-- ============================================================================
-- NaoFlix Supabase Disk IO Optimization Script
-- Safe & Idempotent: Run this in Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Enable pg_trgm for fast partial username/display_name searches (ILIKE '%term%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Indexes to eliminate Sequential Scans across high-traffic queries

-- User search (SearchUsersScreen & BrowsePage Akun tab)
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

-- Cloud watch history lookup & sync deduplication
CREATE INDEX IF NOT EXISTS idx_watch_history_user_type_watched
  ON public.watch_history (user_id, content_type, last_watched_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_history_user_content_type
  ON public.watch_history (user_id, content_id, content_type);

CREATE INDEX IF NOT EXISTS idx_watch_history_title_trgm
  ON public.watch_history USING gin (title gin_trgm_ops);

-- DM channels lookup by either participant, ordered by recent activity
CREATE INDEX IF NOT EXISTS idx_dm_channels_sender_updated
  ON public.dm_channels (sender_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_channels_receiver_updated
  ON public.dm_channels (receiver_id, updated_at DESC);

-- DM messages per channel (chat history pagination + last message preview)
CREATE INDEX IF NOT EXISTS idx_dm_messages_channel_created
  ON public.dm_messages (channel_id, created_at DESC);

-- Partial index for unread DM counts and mark-as-read updates (tiny & fast)
CREATE INDEX IF NOT EXISTS idx_dm_messages_unread_partial
  ON public.dm_messages (channel_id, user_id)
  WHERE is_read = false;

-- Content comments by item & parent user
CREATE INDEX IF NOT EXISTS idx_comments_content_created
  ON public.comments (content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON public.comments (user_id);

-- Follow counts & lists (supports Index-Only Scans for exact counts)
CREATE INDEX IF NOT EXISTS idx_follows_following_follower
  ON public.follows (following_id, follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_following
  ON public.follows (follower_id, following_id);

-- Global chat forum latest messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_desc
  ON public.chat_messages (created_at DESC);

-- 3. Single-query RPC for DM Inbox previews + unread badges (eliminates N+1 queries)
-- Client falls back automatically if this function has not been created yet.
CREATE OR REPLACE FUNCTION public.get_dm_channel_previews()
RETURNS TABLE (
  id uuid,
  partner_id uuid,
  partner_username text,
  partner_display_name text,
  partner_avatar text,
  status text,
  is_sender boolean,
  updated_at timestamptz,
  last_message text,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    CASE WHEN c.sender_id = (select auth.uid()) THEN r.id ELSE s.id END AS partner_id,
    CASE WHEN c.sender_id = (select auth.uid()) THEN r.username::text ELSE s.username::text END AS partner_username,
    CASE WHEN c.sender_id = (select auth.uid()) THEN r.display_name::text ELSE s.display_name::text END AS partner_display_name,
    CASE WHEN c.sender_id = (select auth.uid()) THEN r.avatar_url::text ELSE s.avatar_url::text END AS partner_avatar,
    c.status::text AS status,
    (c.sender_id = (select auth.uid())) AS is_sender,
    c.updated_at::timestamptz AS updated_at,
    lm.text::text AS last_message,
    COALESCE(uc.cnt, 0)::bigint AS unread_count
  FROM public.dm_channels c
  JOIN public.profiles s ON s.id = c.sender_id
  JOIN public.profiles r ON r.id = c.receiver_id
  LEFT JOIN LATERAL (
    SELECT m.text
    FROM public.dm_messages m
    WHERE m.channel_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.dm_messages m
    WHERE m.channel_id = c.id
      AND m.is_read = false
      AND m.user_id <> (select auth.uid())
  ) uc ON true
  WHERE (select auth.uid()) IS NOT NULL
    AND (c.sender_id = (select auth.uid()) OR c.receiver_id = (select auth.uid()))
  ORDER BY c.updated_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_dm_channel_previews() TO authenticated;

-- 4. Refresh planner statistics immediately so Postgres uses the new indexes
ANALYZE public.profiles;
ANALYZE public.follows;
ANALYZE public.watch_history;
ANALYZE public.comments;
ANALYZE public.chat_messages;
ANALYZE public.dm_channels;
ANALYZE public.dm_messages;

-- ============================================================================
-- 5. OPTIONAL DIAGNOSTICS & MAINTENANCE (Uncomment to inspect in SQL Editor)
-- ============================================================================

-- (A) Check which tables have the highest sequential scan tuple reads (Disk IO hotspots):
-- SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup, n_dead_tup
-- FROM pg_stat_user_tables
-- WHERE schemaname = 'public'
-- ORDER BY seq_tup_read DESC;

-- (B) Audit RLS policies using bare auth.uid() instead of (select auth.uid()):
-- Wrapping auth.uid() inside (select auth.uid()) allows Postgres InitPlan caching
-- instead of re-evaluating auth.uid() on every scanned row.
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- (C) Optional cleanup if global chat_messages table has accumulated many old rows:
-- DELETE FROM public.chat_messages
-- WHERE id NOT IN (
--   SELECT id FROM public.chat_messages ORDER BY created_at DESC LIMIT 1000
-- );
-- VACUUM (ANALYZE) public.chat_messages;
