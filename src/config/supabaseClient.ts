import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; avatar_url: string | null; display_name: string | null; bio: string; banner_url: string | null; total_exp: number; level: number; created_at: string; is_vip: boolean; nobar_count: number; last_nobar_date: string | null; vip_until: string | null };
        Insert: { id: string; username: string; avatar_url?: string | null; display_name?: string | null; bio?: string; banner_url?: string | null; total_exp?: number; level?: number; is_vip?: boolean; nobar_count?: number; last_nobar_date?: string | null; vip_until?: string | null };
        Update: { id?: string; username?: string; avatar_url?: string | null; display_name?: string | null; bio?: string; banner_url?: string | null; total_exp?: number; level?: number; is_vip?: boolean; nobar_count?: number; last_nobar_date?: string | null; vip_until?: string | null };
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
