-- NaoFlix Core Supabase Schema, RLS Policies, Storage Buckets & Realtime

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Core Tables

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url text NULL,
  display_name text NULL,
  bio text NOT NULL DEFAULT '',
  banner_url text NULL,
  total_exp integer NOT NULL DEFAULT 0 CHECK (total_exp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL CONSTRAINT follows_follower_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL CONSTRAINT follows_following_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT watch_history_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content_id text NOT NULL,
  title text NOT NULL,
  thumbnail_url text NULL,
  episode text NULL,
  source text NOT NULL DEFAULT 'otakudesu',
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_history_user_content_unique UNIQUE (user_id, content_id, content_type)
);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT comments_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_id text NOT NULL,
  content_type text NOT NULL,
  parent_id uuid NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT chat_messages_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text NULL,
  text text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL CONSTRAINT dm_channels_sender_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL CONSTRAINT dm_channels_receiver_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_channels_unique_pair
  ON public.dm_channels (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL CONSTRAINT dm_messages_channel_id_fkey REFERENCES public.dm_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL CONSTRAINT dm_messages_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'text',
  media_metadata jsonb NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Integrity Triggers

CREATE OR REPLACE FUNCTION public.enforce_dm_channel_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
      RAISE EXCEPTION 'Cannot reassign DM channel participants';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND v_uid IS DISTINCT FROM OLD.receiver_id THEN
      RAISE EXCEPTION 'Only the recipient can accept or reject a DM request';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_dm_channel_update ON public.dm_channels;
CREATE TRIGGER trg_enforce_dm_channel_update
  BEFORE UPDATE ON public.dm_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_dm_channel_update();

CREATE OR REPLACE FUNCTION public.enforce_dm_message_read_only_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.text IS DISTINCT FROM OLD.text
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.media_metadata IS DISTINCT FROM OLD.media_metadata THEN
      RAISE EXCEPTION 'DM messages cannot be edited after sending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_dm_message_update ON public.dm_messages;
CREATE TRIGGER trg_enforce_dm_message_update
  BEFORE UPDATE ON public.dm_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_dm_message_read_only_update();

-- 3. Row Level Security

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_all ON public.profiles;
CREATE POLICY profiles_read_all ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS follows_read_all ON public.follows;
CREATE POLICY follows_read_all ON public.follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS follows_insert_own ON public.follows;
CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id = (select auth.uid()) AND follower_id <> following_id);

DROP POLICY IF EXISTS follows_delete_own ON public.follows;
CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE TO authenticated
  USING (follower_id = (select auth.uid()));

DROP POLICY IF EXISTS watch_history_read_all ON public.watch_history;
CREATE POLICY watch_history_read_all ON public.watch_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS watch_history_insert_own ON public.watch_history;
CREATE POLICY watch_history_insert_own ON public.watch_history
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS watch_history_update_own ON public.watch_history;
CREATE POLICY watch_history_update_own ON public.watch_history
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS watch_history_delete_own ON public.watch_history;
CREATE POLICY watch_history_delete_own ON public.watch_history
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS comments_read_all ON public.comments;
CREATE POLICY comments_read_all ON public.comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS comments_insert_own ON public.comments;
CREATE POLICY comments_insert_own ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
CREATE POLICY comments_delete_own ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS chat_messages_read_all ON public.chat_messages;
CREATE POLICY chat_messages_read_all ON public.chat_messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS chat_messages_insert_own ON public.chat_messages;
CREATE POLICY chat_messages_insert_own ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS chat_messages_delete_own ON public.chat_messages;
CREATE POLICY chat_messages_delete_own ON public.chat_messages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS dm_channels_read_participant ON public.dm_channels;
CREATE POLICY dm_channels_read_participant ON public.dm_channels
  FOR SELECT TO authenticated
  USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()));

DROP POLICY IF EXISTS dm_channels_insert_sender ON public.dm_channels;
CREATE POLICY dm_channels_insert_sender ON public.dm_channels
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()) AND sender_id <> receiver_id);

DROP POLICY IF EXISTS dm_channels_update_participant ON public.dm_channels;
CREATE POLICY dm_channels_update_participant ON public.dm_channels
  FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()))
  WITH CHECK (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()));

DROP POLICY IF EXISTS dm_messages_read_participant ON public.dm_messages;
CREATE POLICY dm_messages_read_participant ON public.dm_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_channels c
      WHERE c.id = channel_id
        AND (c.sender_id = (select auth.uid()) OR c.receiver_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS dm_messages_insert_participant ON public.dm_messages;
CREATE POLICY dm_messages_insert_participant ON public.dm_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.dm_channels c
      WHERE c.id = channel_id
        AND c.status <> 'rejected'
        AND (c.sender_id = (select auth.uid()) OR c.receiver_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS dm_messages_update_read_participant ON public.dm_messages;
CREATE POLICY dm_messages_update_read_participant ON public.dm_messages
  FOR UPDATE TO authenticated
  USING (
    user_id <> (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.dm_channels c
      WHERE c.id = channel_id
        AND (c.sender_id = (select auth.uid()) OR c.receiver_id = (select auth.uid()))
    )
  )
  WITH CHECK (
    user_id <> (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.dm_channels c
      WHERE c.id = channel_id
        AND (c.sender_id = (select auth.uid()) OR c.receiver_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS dm_messages_delete_own ON public.dm_messages;
CREATE POLICY dm_messages_delete_own ON public.dm_messages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 4. Storage Buckets ('avatars' and 'banners')

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    4194304,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  ),
  (
    'banners',
    'banners',
    true,
    6291456,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS profile_media_public_read ON storage.objects;
CREATE POLICY profile_media_public_read ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars', 'banners'));

DROP POLICY IF EXISTS profile_media_auth_upload ON storage.objects;
CREATE POLICY profile_media_auth_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS profile_media_auth_update ON storage.objects;
CREATE POLICY profile_media_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS profile_media_auth_delete ON storage.objects;
CREATE POLICY profile_media_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars', 'banners')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 5. Realtime Publication

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_channels;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;
