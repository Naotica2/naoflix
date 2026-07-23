import MaterialIcons from '@react-native-vector-icons/material-icons';
import MDIcon from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  Dimensions,
  Animated as RNAnimated,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigator } from '../../types/navigation';
import { useAuth } from '../../misc/AuthContext';
import { useLevel } from '../../misc/LevelContext';
import { getFollowCounts, FollowCounts } from '../../utils/followSystem';
import { formatExp, getLevelColor, getLevelBgColor, getLevelLabel } from '../../utils/LevelSystem';
import { useKeyValueIfFocused } from '../../utils/DatabaseManager';
import WatchHistoryGrid from '../Profile/WatchHistoryGrid';
import VIPOfferModal from '../WatchNRead/VIPOfferModal';
import { LinearGradient } from 'expo-linear-gradient';
const { width } = Dimensions.get('window');
const BANNER_HEIGHT = width * (9 / 16);
const AVATAR_SIZE = 86;

function AccountPage() {
  const { profile, user, signOut } = useAuth();
  const { levelData } = useLevel();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const insets = useSafeAreaInsets();
  const scrollY = useMemo(() => new RNAnimated.Value(0), []);
  const historyRaw = useKeyValueIfFocused('historyKeyCollectionsOrder');
  const watchLaterRaw = useKeyValueIfFocused('watchLater');

  const historyCount = useMemo(() => {
    try { return (JSON.parse(historyRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [historyRaw]);

  const watchLaterCount = useMemo(() => {
    try { return (JSON.parse(watchLaterRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [watchLaterRaw]);

  const [followStats, setFollowStats] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [showVIPModal, setShowVIPModal] = useState(false);

  useEffect(() => {
    if (user) {
      getFollowCounts(user.id).then(setFollowStats);
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user) {
      await getFollowCounts(user.id).then(setFollowStats);
    }
    setRefreshing(false);
  }, [user]);

  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const levelColor = getLevelColor(levelData.level);
  const levelBgColor = getLevelBgColor(levelData.level);

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MDIcon name="account-circle-outline" size={80} color={isDark ? '#444' : '#ccc'} />
        <Text style={[styles.username, { marginTop: 16 }]}>Kamu belum login</Text>
        <Text style={[styles.bio, { textAlign: 'center', marginHorizontal: 32, marginTop: 8 }]}>
          Login untuk menyimpan riwayat, melihat profil, dan menaikkan levelmu.
        </Text>
        <TouchableOpacity
          style={[styles.editButton, { marginTop: 24, backgroundColor: '#6366f1' }]}
          onPress={() => navigation.navigate('LoginScreen')}>
          <Text style={[styles.editButtonText, { color: '#fff' }]}>Masuk Sekarang</Text>
        </TouchableOpacity>
        
        {/* Settings Button even for guests */}
        <TouchableOpacity 
          style={{ marginTop: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          onPress={() => navigation.navigate('Utils', { screen: 'Setting' })}>
          <MaterialIcons name="settings" size={20} color={isDark ? '#888' : '#666'} />
          <Text style={{ color: isDark ? '#888' : '#666', fontSize: 14 }}>Pengaturan Aplikasi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VIPOfferModal visible={showVIPModal} onDismiss={() => setShowVIPModal(false)} />
      {/* Absolute Header Icons */}
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
          {profile?.banner_url ? (
            <Image source={{ uri: profile.banner_url }} style={styles.banner} />
          ) : (
            <View style={[styles.banner, { backgroundColor: isDark ? '#1e1e1e' : '#e0e0e0' }]} />
          )}
        </RNAnimated.View>

        {/* Profile Content */}
        <View style={styles.content}>
          {/* Avatar Row */}
          <View style={styles.avatarRow}>
            <View style={[styles.avatarWrapper, profile?.is_vip && { backgroundColor: 'transparent' }]}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[styles.avatar, profile?.is_vip && styles.avatarVIP]} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, profile?.is_vip && styles.avatarVIP]}>
                  <Text style={styles.avatarText}>
                    {(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {profile?.is_vip && (
                <View style={styles.vipBadgeContainer}>
                  <MDIcon name="crown" size={16} color="#FFD700" style={{ textShadowColor: '#F59E0B', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} />
                </View>
              )}
            </View>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => navigation.navigate('EditProfile')}>
              <Text style={styles.editButtonText}>Edit Profil</Text>
            </TouchableOpacity>
          </View>

          {/* Names & Bio */}
          <View style={styles.infoSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.displayName, profile?.is_vip && styles.displayNameVIP]}>{profile?.display_name || profile?.username}</Text>
              {profile?.is_vip && <MDIcon name="check-decagram" size={20} color="#F59E0B" style={{ marginLeft: 6 }} />}
            </View>
            <Text style={[styles.username, profile?.is_vip && styles.usernameVIP]}>@{profile?.username}</Text>
            
            {profile?.bio && (
              <Text style={styles.bio}>{profile.bio}</Text>
            )}

            {/* Level Badge (Discord Roles style) */}
            <View style={styles.badgesRow}>
              <View style={[styles.levelBadge, { backgroundColor: levelBgColor, borderColor: levelColor }]}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                  Lv. {levelData.level} {getLevelLabel(levelData.level)}
                </Text>
              </View>
              {profile?.is_vip && (
                <View style={[styles.levelBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B', marginLeft: 8 }]}>
                  <MDIcon name="crown" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
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
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'Following' })}>
              <Text style={styles.statNumber}>{followStats.following}</Text>
              <Text style={styles.statLabel}>Mengikuti</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'Followers' })}>
              <Text style={styles.statNumber}>{followStats.followers}</Text>
              <Text style={styles.statLabel}>Pengikut</Text>
            </TouchableOpacity>
          </View>

          {!profile?.is_vip && user && (
            <TouchableOpacity style={styles.vipBannerContainer} activeOpacity={0.9} onPress={() => setShowVIPModal(true)}>
              <LinearGradient colors={['#FDE68A', '#F59E0B']} style={styles.vipBannerContent}>
                <View>
                  <Text style={styles.vipBannerTitle}>Upgrade VIP 👑</Text>
                  <Text style={styles.vipBannerSubtitle}>Nobar & Fitur Premium Bebas Batas!</Text>
                </View>
                <View style={styles.vipBannerBtn}>
                  <Text style={styles.vipBannerBtnText}>Get</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* EXP Progress */}
          <View style={styles.expSection}>
            <View style={styles.expHeader}>
              <Text style={styles.expTitle}>Progres Level</Text>
              <Text style={styles.expText}>
                {formatExp(levelData.currentExp)} / {formatExp(levelData.expNeeded)}
              </Text>
            </View>
            <View style={styles.expBarContainer}>
              <View style={[styles.expBarFill, { 
                width: `${levelData.progress * 100}%`,
                backgroundColor: levelColor 
              }]} />
            </View>
          </View>

          {/* Watch History Grid */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Aktivitas Publik</Text>
            {user ? (
              <WatchHistoryGrid userId={user.id} refreshTrigger={refreshing} />
            ) : null}
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
      top: 0,
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
      overflow: 'hidden' 
    },
    expBarFill: { 
      height: '100%', 
      borderRadius: 4 
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
    vipBannerContainer: { width: '100%', marginBottom: 24, borderRadius: 16, overflow: 'hidden', elevation: 4, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    vipBannerContent: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    vipBannerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
    vipBannerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    vipBannerBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    vipBannerBtnText: { color: '#F59E0B', fontSize: 12, fontWeight: 'bold' },
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

export default memo(AccountPage);
