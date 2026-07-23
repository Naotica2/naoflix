import React, { memo, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated as RNAnimated,
  useColorScheme,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';
import { getLevelColor, getLevelBgColor, getLevelLabel } from '../utils/LevelSystem';
import { getFollowCounts, isFollowing, followUser, unfollowUser, FollowCounts } from '../utils/followSystem';
import WatchHistoryGrid from '../component/Profile/WatchHistoryGrid';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = width * (9 / 16);
const AVATAR_SIZE = 86;

type UserProfileRouteProp = RouteProp<RootStackNavigator, 'UserProfile'>;

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  level: number;
  is_vip: boolean;
}

function UserProfileScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const route = useRoute<UserProfileRouteProp>();
  const targetUserId = route.params.userId;

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [followStats, setFollowStats] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [isFollowedByMe, setIsFollowedByMe] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    // If user opens their own profile from somewhere, redirect to AccountPage tab
    if (user && user.id === targetUserId) {
      navigation.navigate('Home', { screen: 'AccountPage' } as any);
      return;
    }
    
    fetchProfileData();
  }, [targetUserId, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfileData();
    setRefreshing(false);
  }, [targetUserId, user]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, banner_url, level, is_vip')
        .eq('id', targetUserId)
        .single();
        
      if (error) throw error;
      setProfile(data);

      const counts = await getFollowCounts(targetUserId);
      setFollowStats(counts);

      if (user) {
        const following = await isFollowing(user.id, targetUserId);
        setIsFollowedByMe(following);
      }
    } catch (e) {
      console.warn('Failed to fetch user profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      navigation.navigate('LoginScreen');
      return;
    }
    
    setFollowLoading(true);
    try {
      if (isFollowedByMe) {
        const success = await unfollowUser(user.id, targetUserId);
        if (success) {
          setIsFollowedByMe(false);
          setFollowStats(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
        }
      } else {
        const success = await followUser(user.id, targetUserId);
        if (success) {
          setIsFollowedByMe(true);
          setFollowStats(prev => ({ ...prev, followers: prev.followers + 1 }));
        }
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!user) {
      navigation.navigate('LoginScreen');
      return;
    }
    setMsgLoading(true);
    try {
      const { data, error } = await supabase
        .from('dm_channels')
        .select('id, status')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        navigation.navigate('DMChat', {
          channelId: data.id,
          receiverId: targetUserId,
          username: profile?.display_name || profile?.username || 'User',
        });
      } else {
        const { data: newChannel, error: insertError } = await supabase
          .from('dm_channels')
          .insert({
            sender_id: user.id,
            receiver_id: targetUserId,
            status: 'pending'
          })
          .select('id')
          .single();
          
        if (insertError) throw insertError;
        
        navigation.navigate('DMChat', {
          channelId: newChannel.id,
          receiverId: targetUserId,
          username: profile?.display_name || profile?.username || 'User',
        });
      }
    } catch (e) {
      console.warn('Error starting DM:', e);
    } finally {
      setMsgLoading(false);
    }
  };

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialIcons name="error-outline" size={60} color={isDark ? '#555' : '#ccc'} />
        <Text style={[styles.displayName, { marginTop: 16 }]}>Pengguna Tidak Ditemukan</Text>
        <TouchableOpacity style={styles.backBtnFallback} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const levelColor = getLevelColor(profile.level);
  const levelBgColor = getLevelBgColor(profile.level);

  return (
    <View style={styles.container}>
      {/* Absolute Header Icons */}
      <View style={[styles.headerOverlay, { top: insets.top + 10 }]}>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <RNAnimated.ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#6366f1']} tintColor="#6366f1" />
        }
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* Banner with Parallax */}
        <RNAnimated.View style={[
          styles.bannerContainer,
          {
            transform: [{
              translateY: scrollY.interpolate({
                inputRange: [-100, 0, BANNER_HEIGHT],
                outputRange: [-50, 0, BANNER_HEIGHT * 0.5],
                extrapolate: 'clamp',
              })
            }, {
              scale: scrollY.interpolate({
                inputRange: [-100, 0],
                outputRange: [1.5, 1],
                extrapolateRight: 'clamp',
              })
            }]
          }
        ]}>
          {profile.banner_url ? (
            <Image source={{ uri: profile.banner_url }} style={styles.banner} />
          ) : (
            <View style={[styles.banner, { backgroundColor: isDark ? '#1e1e1e' : '#e0e0e0' }]} />
          )}
        </RNAnimated.View>

        {/* Profile Content */}
        <View style={styles.content}>
          {/* Avatar Row */}
          <View style={styles.avatarRow}>
            <View style={[styles.avatarWrapper, profile.is_vip && { backgroundColor: 'transparent' }]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[styles.avatar, profile.is_vip && styles.avatarVIP]} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, profile.is_vip && styles.avatarVIP]}>
                  <Text style={styles.avatarText}>
                    {(profile.display_name || profile.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {profile.is_vip && (
                <View style={styles.vipBadgeContainer}>
                  <MaterialIcons name="workspace-premium" size={16} color="#FFD700" style={{ textShadowColor: '#F59E0B', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} />
                </View>
              )}
            </View>
            
            <TouchableOpacity 
              style={[
                styles.followButton, 
                isFollowedByMe ? styles.followButtonActive : styles.followButtonInactive
              ]}
              disabled={followLoading}
              onPress={handleFollowToggle}>
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowedByMe ? (isDark ? '#fff' : '#111') : '#fff'} />
              ) : (
                <Text style={[
                  styles.followButtonText,
                  isFollowedByMe ? { color: isDark ? '#fff' : '#111' } : { color: '#fff' }
                ]}>
                  {isFollowedByMe ? 'Mengikuti' : 'Ikuti'}
                </Text>
              )}
            </TouchableOpacity>
            
            {isFollowedByMe && (
              <TouchableOpacity 
                style={[styles.followButton, { backgroundColor: isDark ? '#222' : '#e0e0e0', marginLeft: 8 }]}
                disabled={msgLoading}
                onPress={handleSendMessage}>
                {msgLoading ? (
                  <ActivityIndicator size="small" color={isDark ? '#fff' : '#111'} />
                ) : (
                  <MaterialIcons name="chat" size={20} color={isDark ? '#fff' : '#111'} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Names & Bio */}
          <View style={styles.infoSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.displayName, profile.is_vip && styles.displayNameVIP]}>{profile.display_name || profile.username}</Text>
              {profile.is_vip && <MaterialIcons name="verified" size={20} color="#F59E0B" style={{ marginLeft: 6 }} />}
            </View>
            <Text style={[styles.username, profile.is_vip && styles.usernameVIP]}>@{profile.username}</Text>
            
            {profile.bio && (
              <Text style={styles.bio}>{profile.bio}</Text>
            )}

            {/* Level Badge */}
            <View style={styles.badgesRow}>
              <View style={[styles.levelBadge, { backgroundColor: levelBgColor, borderColor: levelColor }]}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                  Lv. {profile.level} {getLevelLabel(profile.level)}
                </Text>
              </View>
              {profile.is_vip && (
                <View style={[styles.levelBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B', marginLeft: 8 }]}>
                  <MaterialIcons name="workspace-premium" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
                  <Text style={[styles.levelBadgeText, { color: '#F59E0B', fontWeight: 'bold' }]}>
                    VIP Member
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: profile.id, initialTab: 'Following' })}>
              <Text style={styles.statNumber}>{followStats.following}</Text>
              <Text style={styles.statLabel}>Mengikuti</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: profile.id, initialTab: 'Followers' })}>
              <Text style={styles.statNumber}>{followStats.followers}</Text>
              <Text style={styles.statLabel}>Pengikut</Text>
            </TouchableOpacity>
          </View>

          {/* Watch History Grid */}
          <View style={styles.historySection}>
            <WatchHistoryGrid userId={profile.id} refreshTrigger={refreshing} />
          </View>

        </View>
      </RNAnimated.ScrollView>
    </View>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: isDark ? '#000000' : '#f8f9fa' 
    },
    headerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      paddingHorizontal: 16,
      zIndex: 10,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    bannerContainer: {
      width: '100%',
      height: BANNER_HEIGHT,
      backgroundColor: isDark ? '#1e1e1e' : '#e0e0e0',
    },
    banner: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    content: {
      paddingHorizontal: 16,
    },
    avatarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: -(AVATAR_SIZE / 2),
      marginBottom: 12,
    },
    avatarWrapper: {
      width: AVATAR_SIZE + 8,
      height: AVATAR_SIZE + 8,
      borderRadius: (AVATAR_SIZE + 8) / 2,
      backgroundColor: isDark ? '#000' : '#f8f9fa',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatar: { 
      width: AVATAR_SIZE, 
      height: AVATAR_SIZE, 
      borderRadius: AVATAR_SIZE / 2, 
    },
    avatarPlaceholder: { 
      backgroundColor: isDark ? '#1a1a1a' : '#ddd', 
      justifyContent: 'center', 
      alignItems: 'center' 
    },
    avatarText: { 
      fontSize: 32, 
      fontWeight: '700', 
      color: isDark ? '#fff' : '#333' 
    },
    followButton: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      minWidth: 100,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    followButtonInactive: {
      backgroundColor: '#6366f1',
    },
    followButtonActive: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#ccc',
    },
    followButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    infoSection: {
      marginBottom: 16,
    },
    displayName: {
      fontSize: 24,
      fontWeight: '800',
      color: isDark ? '#fff' : '#111',
    },
    username: {
      fontSize: 15,
      color: isDark ? '#888' : '#666',
      marginTop: 2,
    },
    bio: {
      fontSize: 14,
      color: isDark ? '#ccc' : '#444',
      marginTop: 12,
      lineHeight: 20,
    },
    badgesRow: {
      flexDirection: 'row',
      marginTop: 12,
    },
    levelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      gap: 6,
    },
    levelDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    levelBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 20,
      marginBottom: 24,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    statNumber: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#fff' : '#111',
    },
    statLabel: {
      fontSize: 14,
      color: isDark ? '#888' : '#666',
    },
    historySection: {
      marginTop: 8,
    },
    backBtnFallback: {
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: '#6366f1',
    },
    backBtnText: {
      color: '#fff',
      fontWeight: '600',
    },
    avatarVIP: { borderColor: '#F59E0B', borderWidth: 2 },
    vipBadgeContainer: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      backgroundColor: '#111',
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: '#F59E0B',
      elevation: 4,
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
    },
    usernameVIP: {
      color: '#F59E0B',
      fontWeight: '600',
    },
    displayNameVIP: {
      color: '#FDE68A',
      textShadowColor: 'rgba(245, 158, 11, 0.3)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
  });
}

export default memo(UserProfileScreen);
