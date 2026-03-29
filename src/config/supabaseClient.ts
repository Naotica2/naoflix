import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; avatar_url: string | null; display_name: string | null; created_at: string };
        Insert: { id: string; username: string; avatar_url?: string | null; display_name?: string | null };
        Update: { id?: string; username?: string; avatar_url?: string | null; display_name?: string | null };
        Relationships: [];
      };
      comments: {
        Row: { id: string; user_id: string; content_id: string; content_type: string; parent_id: string | null; text: string; created_at: string };
        Insert: { id?: string; user_id: string; content_id: string; content_type: string; parent_id?: string | null; text: string };
        Update: { id?: string; user_id?: string; content_id?: string; content_type?: string; parent_id?: string | null; text?: string };
        Relationships: [{ foreignKeyName: 'comments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }];
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
