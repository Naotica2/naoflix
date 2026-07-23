import { supabase } from '../config/supabaseClient';

export interface FollowCounts {
  followers: number;
  following: number;
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  if (!userId) return { followers: 0, following: 0 };
  
  try {
    const [followersRes, followingRes] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId)
    ]);

    return {
      followers: followersRes.count || 0,
      following: followingRes.count || 0
    };
  } catch (e) {
    console.warn('Failed to get follow counts:', e);
    return { followers: 0, following: 0 };
  }
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (!followerId || !followingId) return false;
  
  try {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
      
    if (error) throw error;
    return (count || 0) > 0;
  } catch (e) {
    console.warn('Failed to check follow status:', e);
    return false;
  }
}

export async function followUser(followerId: string, followingId: string): Promise<boolean> {
  if (!followerId || !followingId || followerId === followingId) return false;
  
  try {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: followerId, following_id: followingId });
      
    if (error) {
      if (error.code === '23505') return true; // Already following (Unique violation)
      throw error;
    }
    return true;
  } catch (e) {
    console.warn('Failed to follow user:', e);
    return false;
  }
}

export async function unfollowUser(followerId: string, followingId: string): Promise<boolean> {
  if (!followerId || !followingId) return false;
  
  try {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
      
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Failed to unfollow user:', e);
    return false;
  }
}
