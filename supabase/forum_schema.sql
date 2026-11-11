-- ============================================================================
-- NaoFlix Community Forum Schema, Triggers, Anti-Disk IO Indexes & RLS
-- 100% Free Tier Friendly & Idempotent: Run in Supabase Dashboard -> SQL Editor
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Core Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('general', 'anime', 'film', 'comics', 'review', 'nobar')),
  post_type text NOT NULL CHECK (post_type IN ('text', 'image', 'poll', 'nobar', 'link')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  media_items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media_items) = 'array'),
  linked_media jsonb NULL,
  poll_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(poll_options) = 'array'),
  poll_tallies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(poll_tallies) = 'array'),
  poll_expires_at timestamptz NULL,
  rating smallint NULL CHECK (rating IS NULL OR (rating BETWEEN 1 AND 10)),
  nobar_room_id text NULL CHECK (nobar_room_id IS NULL OR char_length(nobar_room_id) BETWEEN 3 AND 32),
  external_link text NULL CHECK (external_link IS NULL OR external_link ~* '^https?://'),
  is_spoiler boolean NOT NULL DEFAULT false,
  spoiler_label text NULL CHECK (spoiler_label IS NULL OR char_length(spoiler_label) <= 40),
  is_nsfw boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'under_review', 'deleted')),
  upvotes_count integer NOT NULL DEFAULT 0,
  downvotes_count integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  hot_score double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_post_votes (
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.forum_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  depth smallint NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 12),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2500),
  image_item jsonb NULL,
  is_spoiler boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'under_review', 'deleted')),
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_comment_votes (
  comment_id uuid NOT NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.forum_poll_votes (
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.forum_bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam', 'spoiler', 'nsfw', 'harassment', 'other')),
  details text NULL CHECK (details IS NULL OR char_length(details) <= 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.forum_upload_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('imagekit', 'supabase')),
  storage_path text NOT NULL,
  file_id text NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Time-Invariant Hot Score + Anti-Disk IO Indexes
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_forum_hot_score(p_score integer, p_created_at timestamptz)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (CASE
      WHEN p_score > 0 THEN LOG10(GREATEST(ABS(p_score), 1)::double precision)
      WHEN p_score < 0 THEN -LOG10(GREATEST(ABS(p_score), 1)::double precision)
      ELSE 0::double precision
    END)
    + ((EXTRACT(EPOCH FROM p_created_at) - 1735689600.0) / 45000.0);
$$;

CREATE INDEX IF NOT EXISTS idx_forum_posts_active_hot
  ON public.forum_posts (is_pinned DESC, hot_score DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_forum_posts_active_created
  ON public.forum_posts (is_pinned DESC, created_at DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_forum_posts_active_top
  ON public.forum_posts (is_pinned DESC, score DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_forum_posts_cat_hot
  ON public.forum_posts (category, is_pinned DESC, hot_score DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_forum_posts_cat_created
  ON public.forum_posts (category, is_pinned DESC, created_at DESC, id DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_forum_posts_author_created
  ON public.forum_posts (author_id, created_at DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_forum_posts_media_key
  ON public.forum_posts ((linked_media->>'media_key'), hot_score DESC)
  WHERE status = 'active' AND linked_media IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forum_posts_title_trgm
  ON public.forum_posts USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_forum_comments_post_created
  ON public.forum_comments (post_id, created_at ASC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_forum_comments_author_created
  ON public.forum_comments (author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forum_upload_logs_user_day
  ON public.forum_upload_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user_created
  ON public.forum_bookmarks (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Trigger Functions (Zero COUNT(*) on Feed Reads)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_forum_post_init_hot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.hot_score := public.compute_forum_hot_score(NEW.score, NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_post_init_hot ON public.forum_posts;
CREATE TRIGGER trg_forum_post_init_hot
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_forum_post_init_hot();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_post_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_up_delta integer := 0;
  v_down_delta integer := 0;
  v_target_post uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target_post := NEW.post_id;
    IF NEW.value = 1 THEN v_up_delta := 1; ELSE v_down_delta := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_target_post := OLD.post_id;
    IF OLD.value = 1 THEN v_up_delta := -1; ELSE v_down_delta := -1; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_target_post := NEW.post_id;
    IF OLD.value <> NEW.value THEN
      IF NEW.value = 1 THEN
        v_up_delta := 1;
        v_down_delta := -1;
      ELSE
        v_up_delta := -1;
        v_down_delta := 1;
      END IF;
    END IF;
  END IF;

  IF v_up_delta <> 0 OR v_down_delta <> 0 THEN
    UPDATE public.forum_posts
    SET
      upvotes_count = GREATEST(0, upvotes_count + v_up_delta),
      downvotes_count = GREATEST(0, downvotes_count + v_down_delta),
      score = (GREATEST(0, upvotes_count + v_up_delta) - GREATEST(0, downvotes_count + v_down_delta)),
      hot_score = public.compute_forum_hot_score(
        (GREATEST(0, upvotes_count + v_up_delta) - GREATEST(0, downvotes_count + v_down_delta)),
        created_at
      )
    WHERE id = v_target_post;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forum_post_votes ON public.forum_post_votes;
CREATE TRIGGER trg_sync_forum_post_votes
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_post_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_post_votes();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE public.forum_posts
      SET comments_count = comments_count + 1
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
      UPDATE public.forum_posts
      SET comments_count = GREATEST(0, comments_count - 1)
      WHERE id = NEW.post_id;
    ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
      UPDATE public.forum_posts
      SET comments_count = comments_count + 1
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'active' THEN
      UPDATE public.forum_posts
      SET comments_count = GREATEST(0, comments_count - 1)
      WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forum_comment_count ON public.forum_comments;
CREATE TRIGGER trg_sync_forum_comment_count
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_comment_count();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_comment_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta integer := 0;
  v_target uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target := NEW.comment_id;
    v_delta := NEW.value;
  ELSIF TG_OP = 'DELETE' THEN
    v_target := OLD.comment_id;
    v_delta := -OLD.value;
  ELSIF TG_OP = 'UPDATE' THEN
    v_target := NEW.comment_id;
    v_delta := NEW.value - OLD.value;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.forum_comments
    SET score = score + v_delta
    WHERE id = v_target;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forum_comment_votes ON public.forum_comment_votes;
CREATE TRIGGER trg_sync_forum_comment_votes
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_comment_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_comment_votes();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_poll_tallies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_len integer;
  v_tallies integer[];
  v_idx integer;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  SELECT jsonb_array_length(poll_options),
         ARRAY(SELECT COALESCE((x)::int, 0) FROM jsonb_array_elements_text(poll_tallies) AS x)
  INTO v_len, v_tallies
  FROM public.forum_posts
  WHERE id = v_post_id
  FOR UPDATE;

  IF v_len IS NULL OR v_len = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WHILE COALESCE(array_length(v_tallies, 1), 0) < v_len LOOP
    v_tallies := array_append(v_tallies, 0);
  END LOOP;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_idx := OLD.option_index + 1;
    IF v_idx >= 1 AND v_idx <= v_len THEN
      v_tallies[v_idx] := GREATEST(0, v_tallies[v_idx] - 1);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_idx := NEW.option_index + 1;
    IF v_idx >= 1 AND v_idx <= v_len THEN
      v_tallies[v_idx] := v_tallies[v_idx] + 1;
    END IF;
  END IF;

  UPDATE public.forum_posts
  SET poll_tallies = to_jsonb(v_tallies)
  WHERE id = v_post_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forum_poll_tallies ON public.forum_poll_votes;
CREATE TRIGGER trg_sync_forum_poll_tallies
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_sync_poll_tallies();

CREATE OR REPLACE FUNCTION public.trg_fn_forum_report_autohide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.forum_reports
  WHERE target_type = NEW.target_type AND target_id = NEW.target_id;

  IF v_count >= 5 THEN
    IF NEW.target_type = 'post' THEN
      UPDATE public.forum_posts
      SET status = 'under_review'
      WHERE id = NEW.target_id AND status = 'active';
    ELSIF NEW.target_type = 'comment' THEN
      UPDATE public.forum_comments
      SET status = 'under_review'
      WHERE id = NEW.target_id AND status = 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_report_autohide ON public.forum_reports;
CREATE TRIGGER trg_forum_report_autohide
  AFTER INSERT ON public.forum_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_forum_report_autohide();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security (Wrapped with (select auth.uid()) InitPlan Caching)
-- ----------------------------------------------------------------------------

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_posts_read_active ON public.forum_posts;
CREATE POLICY forum_posts_read_active ON public.forum_posts
  FOR SELECT USING (status = 'active' OR author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_posts_insert_own ON public.forum_posts;
CREATE POLICY forum_posts_insert_own ON public.forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_posts_update_own ON public.forum_posts;
CREATE POLICY forum_posts_update_own ON public.forum_posts
  FOR UPDATE TO authenticated
  USING (author_id = (select auth.uid()))
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_post_votes_own ON public.forum_post_votes;
CREATE POLICY forum_post_votes_own ON public.forum_post_votes
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_comments_read_active ON public.forum_comments;
CREATE POLICY forum_comments_read_active ON public.forum_comments
  FOR SELECT USING (status <> 'under_review' OR author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_comments_insert_own ON public.forum_comments;
CREATE POLICY forum_comments_insert_own ON public.forum_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_comments_update_own ON public.forum_comments;
CREATE POLICY forum_comments_update_own ON public.forum_comments
  FOR UPDATE TO authenticated
  USING (author_id = (select auth.uid()))
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_comment_votes_own ON public.forum_comment_votes;
CREATE POLICY forum_comment_votes_own ON public.forum_comment_votes
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_poll_votes_own ON public.forum_poll_votes;
CREATE POLICY forum_poll_votes_own ON public.forum_poll_votes
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_bookmarks_own ON public.forum_bookmarks;
CREATE POLICY forum_bookmarks_own ON public.forum_bookmarks
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_reports_insert_own ON public.forum_reports;
CREATE POLICY forum_reports_insert_own ON public.forum_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_reports_read_own ON public.forum_reports;
CREATE POLICY forum_reports_read_own ON public.forum_reports
  FOR SELECT TO authenticated
  USING (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS user_blocks_own ON public.user_blocks;
CREATE POLICY user_blocks_own ON public.user_blocks
  FOR ALL TO authenticated
  USING (blocker_id = (select auth.uid()))
  WITH CHECK (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS forum_upload_logs_own ON public.forum_upload_logs;
CREATE POLICY forum_upload_logs_own ON public.forum_upload_logs
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. Supabase Storage Bucket 'forum-media' (Zero-Config Free Fallback)
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'forum-media',
  'forum-media',
  true,
  524288,
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS forum_media_public_read ON storage.objects;
CREATE POLICY forum_media_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'forum-media');

DROP POLICY IF EXISTS forum_media_auth_upload ON storage.objects;
CREATE POLICY forum_media_auth_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'forum-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS forum_media_auth_delete ON storage.objects;
CREATE POLICY forum_media_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'forum-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 6. Single-Roundtrip RPC Functions (Feed, Thread, Write & Rate Limits)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_forum_feed(
  p_category text DEFAULT NULL,
  p_sort text DEFAULT 'hot',
  p_search text DEFAULT NULL,
  p_media_key text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_bookmarked_only boolean DEFAULT false,
  p_limit integer DEFAULT 15,
  p_cursor_pinned boolean DEFAULT NULL,
  p_cursor_num double precision DEFAULT NULL,
  p_cursor_ts timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_level integer,
  category text,
  post_type text,
  title text,
  body text,
  media_items jsonb,
  linked_media jsonb,
  poll_options jsonb,
  poll_tallies jsonb,
  poll_expires_at timestamptz,
  rating smallint,
  nobar_room_id text,
  external_link text,
  is_spoiler boolean,
  spoiler_label text,
  is_nsfw boolean,
  is_pinned boolean,
  upvotes_count integer,
  downvotes_count integer,
  score integer,
  comments_count integer,
  hot_score double precision,
  created_at timestamptz,
  my_vote smallint,
  my_poll_option smallint,
  is_bookmarked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT (select auth.uid()) AS uid
  )
  SELECT
    p.id,
    p.author_id,
    pr.username::text AS author_username,
    pr.display_name::text AS author_display_name,
    pr.avatar_url::text AS author_avatar_url,
    COALESCE(pr.level, 1)::integer AS author_level,
    p.category,
    p.post_type,
    p.title,
    p.body,
    p.media_items,
    p.linked_media,
    p.poll_options,
    p.poll_tallies,
    p.poll_expires_at,
    p.rating,
    p.nobar_room_id,
    p.external_link,
    p.is_spoiler,
    p.spoiler_label,
    p.is_nsfw,
    p.is_pinned,
    p.upvotes_count,
    p.downvotes_count,
    p.score,
    p.comments_count,
    p.hot_score,
    p.created_at,
    COALESCE(v.value, 0)::smallint AS my_vote,
    pv.option_index AS my_poll_option,
    (bm.post_id IS NOT NULL) AS is_bookmarked
  FROM public.forum_posts p
  CROSS JOIN me
  JOIN public.profiles pr ON pr.id = p.author_id
  LEFT JOIN public.forum_post_votes v ON v.post_id = p.id AND v.user_id = me.uid
  LEFT JOIN public.forum_poll_votes pv ON pv.post_id = p.id AND pv.user_id = me.uid
  LEFT JOIN public.forum_bookmarks bm ON bm.post_id = p.id AND bm.user_id = me.uid
  WHERE p.status = 'active'
    AND (p_category IS NULL OR p_category = 'all' OR p.category = p_category)
    AND (p_author_id IS NULL OR p.author_id = p_author_id)
    AND (p_media_key IS NULL OR p.linked_media->>'media_key' = p_media_key)
    AND (p_search IS NULL OR btrim(p_search) = '' OR p.title ILIKE '%' || btrim(p_search) || '%')
    AND (NOT p_bookmarked_only OR (me.uid IS NOT NULL AND bm.post_id IS NOT NULL))
    AND (
      me.uid IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE ub.blocker_id = me.uid AND ub.blocked_id = p.author_id
      )
    )
    AND (
      p_cursor_id IS NULL
      OR (
        CASE
          WHEN p_sort = 'new' THEN
            (p.is_pinned, p.created_at, p.id) < (COALESCE(p_cursor_pinned, false), p_cursor_ts, p_cursor_id)
          WHEN p_sort = 'top' THEN
            (p.is_pinned, p.score::double precision, p.id) < (COALESCE(p_cursor_pinned, false), p_cursor_num, p_cursor_id)
          ELSE
            (p.is_pinned, p.hot_score, p.id) < (COALESCE(p_cursor_pinned, false), p_cursor_num, p_cursor_id)
        END
      )
    )
  ORDER BY
    p.is_pinned DESC,
    CASE WHEN p_sort = 'new' THEN p.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'top' THEN p.score END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('new', 'top') THEN p.hot_score END DESC NULLS LAST,
    p.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 30);
$$;

GRANT EXECUTE ON FUNCTION public.get_forum_feed TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_forum_thread(p_post_id uuid)
RETURNS TABLE (
  post jsonb,
  comments jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_post jsonb;
  v_comments jsonb;
BEGIN
  SELECT to_jsonb(q) INTO v_post
  FROM (
    SELECT
      p.id,
      p.author_id,
      pr.username AS author_username,
      pr.display_name AS author_display_name,
      pr.avatar_url AS author_avatar_url,
      COALESCE(pr.level, 1) AS author_level,
      p.category,
      p.post_type,
      p.title,
      p.body,
      p.media_items,
      p.linked_media,
      p.poll_options,
      p.poll_tallies,
      p.poll_expires_at,
      p.rating,
      p.nobar_room_id,
      p.external_link,
      p.is_spoiler,
      p.spoiler_label,
      p.is_nsfw,
      p.is_pinned,
      p.status,
      p.upvotes_count,
      p.downvotes_count,
      p.score,
      p.comments_count,
      p.hot_score,
      p.created_at,
      COALESCE(v.value, 0) AS my_vote,
      pv.option_index AS my_poll_option,
      (bm.post_id IS NOT NULL) AS is_bookmarked
    FROM public.forum_posts p
    JOIN public.profiles pr ON pr.id = p.author_id
    LEFT JOIN public.forum_post_votes v ON v.post_id = p.id AND v.user_id = v_uid
    LEFT JOIN public.forum_poll_votes pv ON pv.post_id = p.id AND pv.user_id = v_uid
    LEFT JOIN public.forum_bookmarks bm ON bm.post_id = p.id AND bm.user_id = v_uid
    WHERE p.id = p_post_id AND (p.status = 'active' OR p.author_id = v_uid)
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at ASC), '[]'::jsonb)
  INTO v_comments
  FROM (
    SELECT
      cm.id,
      cm.post_id,
      cm.author_id,
      pr.username AS author_username,
      pr.display_name AS author_display_name,
      pr.avatar_url AS author_avatar_url,
      COALESCE(pr.level, 1) AS author_level,
      cm.parent_id,
      cm.depth,
      CASE WHEN cm.status = 'deleted' THEN '[deleted]' ELSE cm.body END AS body,
      CASE WHEN cm.status = 'deleted' THEN NULL ELSE cm.image_item END AS image_item,
      cm.is_spoiler,
      cm.status,
      cm.score,
      cm.created_at,
      COALESCE(cv.value, 0) AS my_vote
    FROM public.forum_comments cm
    JOIN public.profiles pr ON pr.id = cm.author_id
    LEFT JOIN public.forum_comment_votes cv ON cv.comment_id = cm.id AND cv.user_id = v_uid
    WHERE cm.post_id = p_post_id
      AND cm.status <> 'under_review'
      AND (
        v_uid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.user_blocks ub
          WHERE ub.blocker_id = v_uid AND ub.blocked_id = cm.author_id
        )
      )
    ORDER BY cm.created_at ASC
    LIMIT 300
  ) c;

  RETURN QUERY SELECT v_post, v_comments;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_forum_thread(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_daily_upload_quota(p_incoming_count integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_used integer := 0;
  v_daily_limit constant integer := 12;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM public.forum_upload_logs
  WHERE user_id = v_uid AND created_at >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'allowed', (v_used + GREATEST(p_incoming_count, 0)) <= v_daily_limit,
    'used', v_used,
    'limit', v_daily_limit,
    'remaining', GREATEST(0, v_daily_limit - v_used)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_daily_upload_quota(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_forum_post(
  p_category text,
  p_post_type text,
  p_title text,
  p_body text DEFAULT '',
  p_media_items jsonb DEFAULT '[]'::jsonb,
  p_linked_media jsonb DEFAULT NULL,
  p_poll_options jsonb DEFAULT '[]'::jsonb,
  p_poll_days integer DEFAULT NULL,
  p_rating smallint DEFAULT NULL,
  p_nobar_room_id text DEFAULT NULL,
  p_external_link text DEFAULT NULL,
  p_is_spoiler boolean DEFAULT false,
  p_spoiler_label text DEFAULT NULL,
  p_is_nsfw boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_last_post timestamptz;
  v_hour_count integer;
  v_tallies jsonb := '[]'::jsonb;
  v_poll_len integer := 0;
  v_post_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_post_type = 'image' AND jsonb_array_length(COALESCE(p_media_items, '[]'::jsonb)) > 4 THEN
    RAISE EXCEPTION 'Maximum 4 images allowed per post';
  END IF;

  SELECT MAX(created_at), COUNT(*)
  INTO v_last_post, v_hour_count
  FROM public.forum_posts
  WHERE author_id = v_uid AND created_at >= now() - interval '1 hour' AND status <> 'deleted';

  IF v_last_post IS NOT NULL AND v_last_post > now() - interval '45 seconds' THEN
    RAISE EXCEPTION 'RATE_LIMIT: Please wait before creating another post';
  END IF;

  IF v_hour_count >= 6 THEN
    RAISE EXCEPTION 'RATE_LIMIT: Hourly post limit reached (6 posts/hour)';
  END IF;

  IF p_post_type = 'poll' THEN
    v_poll_len := jsonb_array_length(COALESCE(p_poll_options, '[]'::jsonb));
    IF v_poll_len < 2 OR v_poll_len > 4 THEN
      RAISE EXCEPTION 'Poll must have between 2 and 4 options';
    END IF;
    SELECT jsonb_agg(0) INTO v_tallies FROM generate_series(1, v_poll_len);
  END IF;

  INSERT INTO public.forum_posts (
    author_id,
    category,
    post_type,
    title,
    body,
    media_items,
    linked_media,
    poll_options,
    poll_tallies,
    poll_expires_at,
    rating,
    nobar_room_id,
    external_link,
    is_spoiler,
    spoiler_label,
    is_nsfw
  )
  VALUES (
    v_uid,
    p_category,
    p_post_type,
    btrim(p_title),
    COALESCE(p_body, ''),
    COALESCE(p_media_items, '[]'::jsonb),
    p_linked_media,
    COALESCE(p_poll_options, '[]'::jsonb),
    COALESCE(v_tallies, '[]'::jsonb),
    CASE WHEN p_post_type = 'poll' AND p_poll_days IS NOT NULL THEN now() + make_interval(days => LEAST(GREATEST(p_poll_days, 1), 14)) ELSE NULL END,
    p_rating,
    NULLIF(btrim(COALESCE(p_nobar_room_id, '')), ''),
    NULLIF(btrim(COALESCE(p_external_link, '')), ''),
    COALESCE(p_is_spoiler, false),
    NULLIF(btrim(COALESCE(p_spoiler_label, '')), ''),
    COALESCE(p_is_nsfw, false)
  )
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_forum_post TO authenticated;

CREATE OR REPLACE FUNCTION public.create_forum_comment(
  p_post_id uuid,
  p_parent_id uuid DEFAULT NULL,
  p_body text DEFAULT '',
  p_image_item jsonb DEFAULT NULL,
  p_is_spoiler boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_last_comment timestamptz;
  v_depth smallint := 0;
  v_comment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF char_length(btrim(COALESCE(p_body, ''))) = 0 AND p_image_item IS NULL THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;

  SELECT MAX(created_at) INTO v_last_comment
  FROM public.forum_comments
  WHERE author_id = v_uid AND created_at >= now() - interval '1 minute';

  IF v_last_comment IS NOT NULL AND v_last_comment > now() - interval '8 seconds' THEN
    RAISE EXCEPTION 'RATE_LIMIT: Please wait before commenting again';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT LEAST(depth + 1, 12) INTO v_depth
    FROM public.forum_comments
    WHERE id = p_parent_id AND post_id = p_post_id;
    IF v_depth IS NULL THEN
      RAISE EXCEPTION 'Parent comment not found';
    END IF;
  END IF;

  INSERT INTO public.forum_comments (
    post_id,
    author_id,
    parent_id,
    depth,
    body,
    image_item,
    is_spoiler
  )
  VALUES (
    p_post_id,
    v_uid,
    p_parent_id,
    COALESCE(v_depth, 0),
    btrim(COALESCE(p_body, '')),
    p_image_item,
    COALESCE(p_is_spoiler, false)
  )
  RETURNING id INTO v_comment_id;

  RETURN v_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_forum_comment TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_forum_post(
  p_post_id uuid,
  p_value smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_value = 0 THEN
    DELETE FROM public.forum_post_votes
    WHERE post_id = p_post_id AND user_id = v_uid;
  ELSIF p_value IN (-1, 1) THEN
    INSERT INTO public.forum_post_votes (post_id, user_id, value)
    VALUES (p_post_id, v_uid, p_value)
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  ELSE
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  SELECT jsonb_build_object(
    'score', score,
    'upvotes_count', upvotes_count,
    'downvotes_count', downvotes_count,
    'my_vote', COALESCE((SELECT value FROM public.forum_post_votes WHERE post_id = p_post_id AND user_id = v_uid), 0)
  ) INTO v_res
  FROM public.forum_posts
  WHERE id = p_post_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_forum_post(uuid, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_forum_comment(
  p_comment_id uuid,
  p_value smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_value = 0 THEN
    DELETE FROM public.forum_comment_votes
    WHERE comment_id = p_comment_id AND user_id = v_uid;
  ELSIF p_value IN (-1, 1) THEN
    INSERT INTO public.forum_comment_votes (comment_id, user_id, value)
    VALUES (p_comment_id, v_uid, p_value)
    ON CONFLICT (comment_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  ELSE
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  SELECT jsonb_build_object(
    'score', score,
    'my_vote', COALESCE((SELECT value FROM public.forum_comment_votes WHERE comment_id = p_comment_id AND user_id = v_uid), 0)
  ) INTO v_res
  FROM public.forum_comments
  WHERE id = p_comment_id;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_forum_comment(uuid, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_forum_poll(
  p_post_id uuid,
  p_option_index smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_len integer;
  v_exp timestamptz;
  v_tallies jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT jsonb_array_length(poll_options), poll_expires_at
  INTO v_len, v_exp
  FROM public.forum_posts
  WHERE id = p_post_id AND status = 'active' AND post_type = 'poll';

  IF v_len IS NULL OR p_option_index < 0 OR p_option_index >= v_len THEN
    RAISE EXCEPTION 'Invalid poll option';
  END IF;

  IF v_exp IS NOT NULL AND v_exp < now() THEN
    RAISE EXCEPTION 'Poll has ended';
  END IF;

  INSERT INTO public.forum_poll_votes (post_id, user_id, option_index)
  VALUES (p_post_id, v_uid, p_option_index)
  ON CONFLICT (post_id, user_id)
  DO UPDATE SET option_index = EXCLUDED.option_index;

  SELECT poll_tallies INTO v_tallies
  FROM public.forum_posts
  WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'poll_tallies', v_tallies,
    'my_poll_option', p_option_index
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_forum_poll(uuid, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_forum_bookmark(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.forum_bookmarks WHERE user_id = v_uid AND post_id = p_post_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.forum_bookmarks WHERE user_id = v_uid AND post_id = p_post_id;
    RETURN false;
  ELSE
    INSERT INTO public.forum_bookmarks (user_id, post_id) VALUES (v_uid, p_post_id) ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_forum_bookmark(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_forum_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_media jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.forum_posts
  SET status = 'deleted', updated_at = now()
  WHERE id = p_post_id AND author_id = v_uid AND status <> 'deleted'
  RETURNING media_items INTO v_media;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found or permission denied';
  END IF;

  RETURN COALESCE(v_media, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_forum_post(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_forum_comment(p_comment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_img jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.forum_comments
  SET status = 'deleted', body = '[deleted]'
  WHERE id = p_comment_id AND author_id = v_uid AND status <> 'deleted'
  RETURNING image_item INTO v_img;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found or permission denied';
  END IF;

  RETURN v_img;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_forum_comment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_forum_upload(
  p_provider text,
  p_storage_path text,
  p_file_id text DEFAULT NULL,
  p_size_bytes integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_used integer := 0;
  v_daily_limit constant integer := 12;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM public.forum_upload_logs
  WHERE user_id = v_uid AND created_at >= now() - interval '24 hours';

  IF v_used >= v_daily_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Daily image upload limit (12/24h) reached';
  END IF;

  INSERT INTO public.forum_upload_logs (user_id, provider, storage_path, file_id, size_bytes)
  VALUES (
    v_uid,
    CASE WHEN p_provider = 'imagekit' THEN 'imagekit' ELSE 'supabase' END,
    left(p_storage_path, 512),
    NULLIF(left(COALESCE(p_file_id, ''), 256), ''),
    GREATEST(1, LEAST(COALESCE(p_size_bytes, 1), 524288))
  );

  RETURN jsonb_build_object(
    'recorded', true,
    'used', v_used + 1,
    'limit', v_daily_limit,
    'remaining', GREATEST(0, v_daily_limit - (v_used + 1))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_forum_upload(text, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_forum_item(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_inserted_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.forum_reports (reporter_id, target_type, target_id, reason, details)
  VALUES (
    v_uid,
    p_target_type,
    p_target_id,
    p_reason,
    NULLIF(btrim(COALESCE(p_details, '')), '')
  )
  ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN 'already_reported';
  END IF;

  RETURN 'reported';
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_forum_item(text, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_user_block(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_blocks WHERE blocker_id = v_uid AND blocked_id = p_target_user_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.user_blocks WHERE blocker_id = v_uid AND blocked_id = p_target_user_id;
    RETURN false;
  ELSE
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (v_uid, p_target_user_id) ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_user_block(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_blocked_users()
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.username::text, pr.display_name::text, pr.avatar_url::text
  FROM public.user_blocks ub
  JOIN public.profiles pr ON pr.id = ub.blocked_id
  WHERE ub.blocker_id = (select auth.uid())
  ORDER BY ub.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_blocked_users() TO authenticated;

ANALYZE public.forum_posts;
ANALYZE public.forum_comments;
ANALYZE public.forum_post_votes;
ANALYZE public.forum_poll_votes;
