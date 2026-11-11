import React, { memo, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated as RNAnimated,
  InteractionManager,
  useColorScheme,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';
import { tSync, useLanguage } from '../misc/LanguageContext';
import { getLevelColor, getLevelBgColor, getLevelLabel } from '../utils/LevelSystem';
import { getFollowCounts, isFollowing, followUser, unfollowUser, FollowCounts } from '../utils/followSystem';
import ForumImage from '../component/Forum/ForumImage';
import WatchHistoryGrid from '../component/Profile/WatchHistoryGrid';

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
}

function UserProfileScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const route = useRoute<UserProfileRouteProp>();
  const targetUserId = route.params.userId;

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bannerHeight = Math.min(Math.round(width * (9 / 16)), 230);
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [followStats, setFollowStats] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [isFollowedByMe, setIsFollowedByMe] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);

  const fetchProfileData = useCallback(
    async (forceRefresh = false, isCancelled?: () => boolean) => {
      if (!forceRefresh) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, avatar_url, banner_url, level')
          .eq('id', targetUserId)
          .single();

        if (isCancelled?.()) return;
        if (error) throw error;
        setProfile(data);

        const counts = await getFollowCounts(targetUserId, forceRefresh);
        if (isCancelled?.()) return;
        setFollowStats(prev =>
          prev.followers === counts.followers && prev.following === counts.following
            ? prev
            : counts,
        );

        if (user) {
          const following = await isFollowing(user.id, targetUserId);
          if (!isCancelled?.()) {
            setIsFollowedByMe(following);
          }
        }
      } catch (e) {
        if (!isCancelled?.()) {
          console.warn('Failed to fetch user profile:', e);
        }
      } finally {
        if (!isCancelled?.()) {
          setLoading(false);
        }
      }
    },
    [targetUserId, user],
  );

  useEffect(() => {
    if (user && user.id === targetUserId) {
      navigation.navigate('Home', { screen: 'AccountPage' } as any);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      setHistoryReady(true);
      fetchProfileData(false, () => cancelled);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [fetchProfileData, navigation, targetUserId, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfileData(true);
    setRefreshing(false);
  }, [fetchProfileData]);

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
          username: profile?.display_name || profile?.username || tSync('common.user'),
          partnerAvatar: profile?.avatar_url,
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
          username: profile?.display_name || profile?.username || tSync('common.user'),
          partnerAvatar: profile?.avatar_url,
        });
      }
    } catch (e) {
      console.warn('Error starting DM:', e);
    } finally {
      setMsgLoading(false);
    }
  };

  const styles = useMemo(() => makeStyles(isDark, bannerHeight), [isDark, bannerHeight]);

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
        <Text style={[styles.displayName, { marginTop: 16 }]}>{t('profile.userNotFound')}</Text>
        <TouchableOpacity style={styles.backBtnFallback} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const levelColor = getLevelColor(profile.level);
  const levelBgColor = getLevelBgColor(profile.level);

  return (
    <View style={styles.container}>
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
        <RNAnimated.View style={[
          styles.bannerContainer,
          {
            transform: [{
              translateY: scrollY.interpolate({
                inputRange: [-100, 0, bannerHeight],
                outputRange: [-50, 0, bannerHeight * 0.5],
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
            <ForumImage
              uri={profile.banner_url}
              recyclingKey={profile.banner_url}
              style={styles.banner}
            />
          ) : (
            <View style={[styles.banner, { backgroundColor: isDark ? '#1e1e1e' : '#e0e0e0' }]} />
          )}
        </RNAnimated.View>

        <View style={styles.content}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrapper}>
              {profile.avatar_url ? (
                <ForumImage
                  uri={profile.avatar_url}
                  recyclingKey={profile.avatar_url}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>
                    {(profile.display_name || profile.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowedByMe ? styles.followButtonActive : styles.followButtonInactive,
              ]}
              disabled={followLoading}
              onPress={handleFollowToggle}>
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowedByMe ? (isDark ? '#fff' : '#111') : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.followButtonText,
                    isFollowedByMe ? { color: isDark ? '#fff' : '#111' } : { color: '#fff' },
                  ]}>
                  {isFollowedByMe ? t('profile.following') : t('profile.follow')}
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

          <View style={styles.infoSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.displayName}>{profile.display_name || profile.username}</Text>
            </View>
            <Text style={styles.username}>@{profile.username}</Text>

            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.badgesRow}>
              <View style={[styles.levelBadge, { backgroundColor: levelBgColor, borderColor: levelColor }]}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                  Lv. {profile.level} {getLevelLabel(profile.level)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: profile.id, initialTab: 'Following' })}>
              <Text style={styles.statNumber}>{followStats.following}</Text>
              <Text style={styles.statLabel}>{t('account.following')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: profile.id, initialTab: 'Followers' })}>
              <Text style={styles.statNumber}>{followStats.followers}</Text>
              <Text style={styles.statLabel}>{t('account.followers')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.forumPostsBtn}
            onPress={() =>
              navigation.navigate('ForumUserFeed', {
                mode: 'user_posts',
                userId: profile.id,
                username: profile.username,
              })
            }>
            <MaterialIcons name="forum" size={16} color="#3b82f6" />
            <Text style={styles.forumPostsBtnText}>{t('forumFeed.accountMyPosts')}</Text>
            <MaterialIcons name="chevron-right" size={18} color={isDark ? '#71717a' : '#71717a'} />
          </TouchableOpacity>

          <View style={styles.historySection}>
            {historyReady ? (
              <WatchHistoryGrid userId={profile.id} refreshTrigger={refreshing} />
            ) : (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#6366f1" />
              </View>
            )}
          </View>

        </View>
      </RNAnimated.ScrollView>
    </View>
  );
}

function makeStyles(isDark: boolean, bannerHeight: number) {
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
      height: bannerHeight,
      backgroundColor: isDark ? '#1e1e1e' : '#e0e0e0',
    },
    banner: {
      width: '100%',
      height: '100%',
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
      marginBottom: 14,
    },
    forumPostsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#1e1e24' : '#e4e4e7',
      backgroundColor: isDark ? '#111216' : '#ffffff',
      marginBottom: 18,
    },
    forumPostsBtnText: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '600',
      color: isDark ? '#e4e4e7' : '#18181b',
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
  });
}

export default memo(UserProfileScreen);
