import MaterialIcons from '@react-native-vector-icons/material-icons';
import MDIcon from '@react-native-vector-icons/material-design-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
  Animated as RNAnimated,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigator } from '../../types/navigation';
import { useAuth } from '../../misc/AuthContext';
import { useLanguage } from '../../misc/LanguageContext';
import { useLevel } from '../../misc/LevelContext';
import { getFollowCounts, FollowCounts } from '../../utils/followSystem';
import { formatExp, getLevelColor, getLevelBgColor, getLevelLabel } from '../../utils/LevelSystem';
import ForumImage from '../Forum/ForumImage';
import WatchHistoryGrid from '../Profile/WatchHistoryGrid';

function AccountPage() {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const { levelData } = useLevel();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);

  const isCompact = width < 360;
  const horizontalPad = isCompact ? 12 : 16;
  const avatarSize = isCompact ? 76 : 86;
  const bannerHeight = Math.min(Math.round(width * (9 / 16)), 230);

  const [followStats, setFollowStats] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    if (!historyReady) {
      const task = InteractionManager.runAfterInteractions(() => {
        setHistoryReady(true);
      });
      return () => task.cancel();
    }
  }, [isFocused, historyReady]);

  useEffect(() => {
    if (!user || !isFocused) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      getFollowCounts(user.id).then(next => {
        if (!cancelled) {
          setFollowStats(prev =>
            prev.followers === next.followers && prev.following === next.following ? prev : next,
          );
        }
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [user, isFocused]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user) {
      await getFollowCounts(user.id, true).then(setFollowStats);
    }
    setRefreshing(false);
  }, [user]);

  const styles = useMemo(
    () => makeStyles(isDark, bannerHeight, avatarSize, horizontalPad, isCompact),
    [isDark, bannerHeight, avatarSize, horizontalPad, isCompact],
  );
  const levelColor = getLevelColor(levelData.level);
  const levelBgColor = getLevelBgColor(levelData.level);

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
        <MDIcon name="account-circle-outline" size={80} color={isDark ? '#444' : '#ccc'} />
        <Text style={[styles.username, { marginTop: 16 }]}>{t('account.notSignedIn')}</Text>
        <Text style={[styles.bio, { textAlign: 'center', marginHorizontal: 16, marginTop: 8 }]}>
          {t('account.signInToSync')}
        </Text>
        <TouchableOpacity
          style={[styles.editButton, { marginTop: 24, backgroundColor: '#6366f1', borderColor: '#6366f1' }]}
          onPress={() => navigation.navigate('LoginScreen')}>
          <Text style={[styles.editButtonText, { color: '#fff' }]}>{t('auth.loginNow')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={() => navigation.navigate('Utils', { screen: 'Setting' })}>
          <MaterialIcons name="settings" size={20} color={isDark ? '#888' : '#666'} />
          <Text style={{ color: isDark ? '#888' : '#666', fontSize: 14 }}>{t('account.settings')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerOverlay, { top: insets.top + 10 }]}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.navigate('Utils', { screen: 'Setting' })}>
          <MaterialIcons name="settings" size={22} color="#fff" />
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
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}>
        <RNAnimated.View
          style={[
            styles.bannerContainer,
            {
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [-100, 0, bannerHeight],
                    outputRange: [-50, 0, bannerHeight * 0.5],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  scale: scrollY.interpolate({
                    inputRange: [-100, 0],
                    outputRange: [1.5, 1],
                    extrapolateRight: 'clamp',
                  }),
                },
              ],
            },
          ]}>
          {profile?.banner_url ? (
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
              {profile?.avatar_url ? (
                <ForumImage
                  uri={profile.avatar_url}
                  recyclingKey={profile.avatar_url}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>
                    {(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditProfile')}>
              <Text style={styles.editButtonText}>{t('profile.editProfile')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.displayName} numberOfLines={1}>
                {profile?.display_name || profile?.username}
              </Text>
            </View>
            <Text style={styles.username}>@{profile?.username}</Text>

            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.badgesRow}>
              <View style={[styles.levelBadge, { backgroundColor: levelBgColor, borderColor: levelColor }]}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                  Lv. {levelData.level} {getLevelLabel(levelData.level)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'Following' })}>
              <Text style={styles.statNumber}>{followStats.following}</Text>
              <Text style={styles.statLabel}>{t('account.following')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'Followers' })}>
              <Text style={styles.statNumber}>{followStats.followers}</Text>
              <Text style={styles.statLabel}>{t('account.followers')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.forumQuickRow}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.forumQuickBtn}
              onPress={() =>
                navigation.navigate('ForumUserFeed', {
                  mode: 'user_posts',
                  userId: user.id,
                  username: profile?.username,
                })
              }>
              <MaterialIcons name="forum" size={16} color="#3b82f6" />
              <Text style={styles.forumQuickText} numberOfLines={1}>
                {t('forumFeed.accountMyPosts')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.forumQuickBtn}
              onPress={() => navigation.navigate('ForumUserFeed', { mode: 'bookmarks' })}>
              <MaterialIcons name="bookmark-border" size={16} color="#3b82f6" />
              <Text style={styles.forumQuickText} numberOfLines={1}>
                {t('forumFeed.accountSavedPosts')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.expSection}>
            <View style={styles.expHeader}>
              <Text style={styles.expTitle}>{t('account.level', { level: levelData.level })}</Text>
              <Text style={styles.expText}>
                {formatExp(levelData.currentExp)} / {formatExp(levelData.expNeeded)}
              </Text>
            </View>
            <View style={styles.expBarContainer}>
              <View
                style={[
                  styles.expBarFill,
                  {
                    width: `${levelData.progress * 100}%`,
                    backgroundColor: levelColor,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>{t('profile.recentWatch')}</Text>
            {historyReady ? (
              <WatchHistoryGrid userId={user.id} refreshTrigger={refreshing} />
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

function makeStyles(
  isDark: boolean,
  bannerHeight: number,
  avatarSize: number,
  horizontalPad: number,
  isCompact: boolean,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#f8f9fa',
    },
    headerOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      paddingHorizontal: horizontalPad,
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
      paddingHorizontal: horizontalPad,
    },
    avatarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: -(avatarSize / 2),
      marginBottom: 12,
    },
    avatarWrapper: {
      width: avatarSize + 8,
      height: avatarSize + 8,
      borderRadius: (avatarSize + 8) / 2,
      backgroundColor: isDark ? '#000' : '#f8f9fa',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatar: {
      width: avatarSize,
      height: avatarSize,
      borderRadius: avatarSize / 2,
    },
    avatarPlaceholder: {
      backgroundColor: isDark ? '#1a1a1a' : '#ddd',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: isCompact ? 28 : 32,
      fontWeight: '700',
      color: isDark ? '#fff' : '#333',
    },
    editButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? '#333' : '#ccc',
      backgroundColor: isDark ? 'transparent' : '#fff',
      marginBottom: 8,
    },
    editButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#fff' : '#111',
    },
    infoSection: {
      marginBottom: 16,
    },
    displayName: {
      fontSize: isCompact ? 20 : 24,
      fontWeight: '800',
      color: isDark ? '#fff' : '#111',
      flexShrink: 1,
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
      flexWrap: 'wrap',
      gap: 8,
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
    forumQuickRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 18,
    },
    forumQuickBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#1e1e24' : '#e4e4e7',
      backgroundColor: isDark ? '#111216' : '#ffffff',
    },
    forumQuickText: {
      fontSize: 13,
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
    expSection: {
      backgroundColor: isDark ? '#111' : '#fff',
      padding: 16,
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: isDark ? '#222' : '#eee',
    },
    expHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    expTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#fff' : '#111',
    },
    expText: {
      fontSize: 13,
      color: isDark ? '#888' : '#666',
    },
    expBarContainer: {
      width: '100%',
      height: 8,
      backgroundColor: isDark ? '#222' : '#e0e0e0',
      borderRadius: 4,
      overflow: 'hidden',
    },
    expBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    historySection: {
      marginTop: 8,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#fff' : '#111',
      marginBottom: 12,
    },
  });
}

export default memo(AccountPage);
