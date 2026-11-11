import { supabase } from '../config/supabaseClient';

export interface FollowCounts {
  followers: number;
  following: number;
}

const FOLLOW_COUNTS_TTL_MS = 60_000;
const followCountsCache = new Map<string, { counts: FollowCounts; fetchedAt: number }>();

export function invalidateFollowCountsCache(userId?: string) {
  if (userId) {
    followCountsCache.delete(userId);
  } else {
    followCountsCache.clear();
  }
}

export async function getFollowCounts(
  userId: string,
  forceRefresh = false,
): Promise<FollowCounts> {
  if (!userId) return { followers: 0, following: 0 };

  if (!forceRefresh) {
    const cached = followCountsCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < FOLLOW_COUNTS_TTL_MS) {
      return cached.counts;
    }
  }

  try {
    const [followersRes, followingRes] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId)
    ]);

    const counts: FollowCounts = {
      followers: followersRes.count || 0,
      following: followingRes.count || 0
    };
    followCountsCache.set(userId, { counts, fetchedAt: Date.now() });
    return counts;
  } catch (e) {
    console.warn('Failed to get follow counts:', e);
    return followCountsCache.get(userId)?.counts || { followers: 0, following: 0 };
  }
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (!followerId || !followingId) return false;
  
  try {
    const { count, error } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
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
    invalidateFollowCountsCache(followerId);
    invalidateFollowCountsCache(followingId);
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
    invalidateFollowCountsCache(followerId);
    invalidateFollowCountsCache(followingId);
    return true;
  } catch (e) {
    console.warn('Failed to unfollow user:', e);
    return false;
  }
}
