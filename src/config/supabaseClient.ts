import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; avatar_url: string | null; display_name: string | null; bio: string; banner_url: string | null; total_exp: number; level: number; created_at: string };
        Insert: { id: string; username: string; avatar_url?: string | null; display_name?: string | null; bio?: string; banner_url?: string | null; total_exp?: number; level?: number };
        Update: { id?: string; username?: string; avatar_url?: string | null; display_name?: string | null; bio?: string; banner_url?: string | null; total_exp?: number; level?: number };
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string };
        Insert: { follower_id: string; following_id: string };
        Update: { follower_id?: string; following_id?: string };
        Relationships: [
          { foreignKeyName: 'follows_follower_id_fkey'; columns: ['follower_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'follows_following_id_fkey'; columns: ['following_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      watch_history: {
        Row: { id: string; user_id: string; content_type: string; content_id: string; title: string; thumbnail_url: string | null; episode: string | null; source: string; last_watched_at: string };
        Insert: { id?: string; user_id: string; content_type: string; content_id: string; title: string; thumbnail_url?: string | null; episode?: string | null; source?: string };
        Update: { id?: string; user_id?: string; content_type?: string; content_id?: string; title?: string; thumbnail_url?: string | null; episode?: string | null; source?: string; last_watched_at?: string };
        Relationships: [{ foreignKeyName: 'watch_history_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }];
      };
      comments: {
        Row: { id: string; user_id: string; content_id: string; content_type: string; parent_id: string | null; text: string; created_at: string };
        Insert: { id?: string; user_id: string; content_id: string; content_type: string; parent_id?: string | null; text: string };
        Update: { id?: string; user_id?: string; content_id?: string; content_type?: string; parent_id?: string | null; text?: string };
        Relationships: [{ foreignKeyName: 'comments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }];
      };
      chat_messages: {
        Row: { id: string; user_id: string; username: string; avatar_url: string | null; text: string; created_at: string };
        Insert: { id?: string; user_id: string; username: string; avatar_url?: string | null; text: string };
        Update: { id?: string; user_id?: string; username?: string; avatar_url?: string | null; text?: string };
        Relationships: [{ foreignKeyName: 'chat_messages_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }];
      };
      dm_channels: {
        Row: { id: string; sender_id: string; receiver_id: string; status: string; created_at: string; updated_at: string };
        Insert: { id?: string; sender_id: string; receiver_id: string; status?: string };
        Update: { id?: string; sender_id?: string; receiver_id?: string; status?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'dm_channels_sender_id_fkey'; columns: ['sender_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'dm_channels_receiver_id_fkey'; columns: ['receiver_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
      dm_messages: {
        Row: { id: string; channel_id: string; user_id: string; text: string; media_type: string; media_metadata: any; created_at: string; is_read: boolean };
        Insert: { id?: string; channel_id: string; user_id: string; text: string; media_type?: string; media_metadata?: any; is_read?: boolean };
        Update: { id?: string; channel_id?: string; user_id?: string; text?: string; media_type?: string; media_metadata?: any; is_read?: boolean };
        Relationships: [
          { foreignKeyName: 'dm_messages_channel_id_fkey'; columns: ['channel_id']; isOneToOne: false; referencedRelation: 'dm_channels'; referencedColumns: ['id'] },
          { foreignKeyName: 'dm_messages_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
      forum_posts: {
        Row: {
          id: string;
          author_id: string;
          category: string;
          post_type: string;
          title: string;
          body: string;
          media_items: any;
          linked_media: any;
          poll_options: any;
          poll_tallies: any;
          poll_expires_at: string | null;
          rating: number | null;
          nobar_room_id: string | null;
          external_link: string | null;
          is_spoiler: boolean;
          spoiler_label: string | null;
          is_nsfw: boolean;
          is_pinned: boolean;
          status: string;
          upvotes_count: number;
          downvotes_count: number;
          score: number;
          comments_count: number;
          hot_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          category: string;
          post_type: string;
          title: string;
          body?: string;
          media_items?: any;
          linked_media?: any;
          poll_options?: any;
          poll_tallies?: any;
          poll_expires_at?: string | null;
          rating?: number | null;
          nobar_room_id?: string | null;
          external_link?: string | null;
          is_spoiler?: boolean;
          spoiler_label?: string | null;
          is_nsfw?: boolean;
          is_pinned?: boolean;
          status?: string;
        };
        Update: {
          title?: string;
          body?: string;
          status?: string;
          is_spoiler?: boolean;
          spoiler_label?: string | null;
          is_nsfw?: boolean;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'forum_posts_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
      forum_post_votes: {
        Row: { post_id: string; user_id: string; value: number; created_at: string };
        Insert: { post_id: string; user_id: string; value: number };
        Update: { value?: number };
        Relationships: [];
      };
      forum_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_id: string | null;
          depth: number;
          body: string;
          image_item: any;
          is_spoiler: boolean;
          status: string;
          score: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_id?: string | null;
          depth?: number;
          body?: string;
          image_item?: any;
          is_spoiler?: boolean;
          status?: string;
        };
        Update: { body?: string; status?: string };
        Relationships: [];
      };
      forum_comment_votes: {
        Row: { comment_id: string; user_id: string; value: number; created_at: string };
        Insert: { comment_id: string; user_id: string; value: number };
        Update: { value?: number };
        Relationships: [];
      };
      forum_poll_votes: {
        Row: { post_id: string; user_id: string; option_index: number; created_at: string };
        Insert: { post_id: string; user_id: string; option_index: number };
        Update: { option_index?: number };
        Relationships: [];
      };
      forum_bookmarks: {
        Row: { user_id: string; post_id: string; created_at: string };
        Insert: { user_id: string; post_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      forum_reports: {
        Row: { id: string; reporter_id: string; target_type: string; target_id: string; reason: string; details: string | null; created_at: string };
        Insert: { id?: string; reporter_id: string; target_type: string; target_id: string; reason: string; details?: string | null };
        Update: Record<string, never>;
        Relationships: [];
      };
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      forum_upload_logs: {
        Row: { id: string; user_id: string; provider: string; storage_path: string; file_id: string | null; size_bytes: number; created_at: string };
        Insert: { id?: string; user_id: string; provider: string; storage_path: string; file_id?: string | null; size_bytes: number };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      [key: string]: {
        Args: Record<string, any>;
        Returns: any;
      };
    };
    Enums: Record<string, never>;
  };
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
