import MaterialIcons from '@react-native-vector-icons/material-icons';
import MDIcon from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Divider } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useGlobalStyles from '../../assets/style';
import { RootStackNavigator } from '../../types/navigation';
import { useAuth } from '../../misc/AuthContext';
import { useLevel } from '../../misc/LevelContext';
import { formatExp, getRankColor, getRankBgColor } from '../../utils/LevelSystem';
import { useKeyValueIfFocused } from '../../utils/DatabaseManager';

// ============ MENU ITEMS ============
const MENU_ITEMS = [
  {
    title: 'Pengaturan',
    icon: 'settings' as const,
    iconColor: '#615e58',
    desc: 'Atur aplikasi NaoFlix kamu',
    screen: 'Setting',
  },
  {
    title: 'Pengaturan Sumber',
    icon: 'web' as const,
    iconColor: '#d84b3e',
    desc: 'Atur website sumber Anime & Komik',
    screen: 'ExtensionManager',
  },
  {
    title: 'Cari Anime dari Gambar',
    icon: 'image-search' as const,
    iconColor: '#3a8fac',
    desc: 'Cari judul anime dari screenshot',
    screen: 'SearchAnimeByImage',
  },
  {
    title: 'Catatan Update',
    icon: 'update' as const,
    iconColor: '#417e3b',
    desc: 'Perubahan setiap update',
    screen: 'Changelog',
  },
  {
    title: 'Tentang Aplikasi',
    icon: 'info-outline' as const,
    iconColor: '#166db4',
    desc: 'Tentang NaoFlix dan pengembangnya',
    screen: 'About',
  },
] as const;

// ============ ACCOUNT PAGE ============
function AccountPage() {
  const { profile, user, signOut } = useAuth();
  const { levelData } = useLevel();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const insets = useSafeAreaInsets();

  const historyRaw = useKeyValueIfFocused('historyKeyCollectionsOrder');
  const watchLaterRaw = useKeyValueIfFocused('watchLater');

  const historyCount = useMemo(() => {
    try { return (JSON.parse(historyRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [historyRaw]);

  const watchLaterCount = useMemo(() => {
    try { return (JSON.parse(watchLaterRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [watchLaterRaw]);

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40, paddingTop: insets.top }}>
      {/* Profile Header */}
      <View style={styles.profileSection}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {(profile?.username ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.username}>@{profile?.username ?? 'Guest'}</Text>
        {profile?.display_name ? (
          <Text style={styles.displayName}>{profile.display_name}</Text>
        ) : null}

        {/* Level Section */}
        {user && (
          <View style={styles.levelSection}>
            <View style={styles.levelRow}>
              <Text style={styles.levelText}>Lv. {levelData.level}</Text>
              <View style={[styles.rankBadge, {
                borderColor: getRankColor(levelData.rank),
                backgroundColor: getRankBgColor(levelData.rank),
              }]}>
                <Text style={[styles.rankText, { color: getRankColor(levelData.rank) }]}>
                  {levelData.rank}
                </Text>
              </View>
            </View>
            <View style={styles.expBarContainer}>
              <View style={[styles.expBarFill, {
                width: `${levelData.progress * 100}%`,
                backgroundColor: getRankColor(levelData.rank),
              }]} />
            </View>
            <Text style={styles.expText}>
              {formatExp(levelData.currentExp)} / {formatExp(levelData.expNeeded)} EXP
            </Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{historyCount}</Text>
            <Text style={styles.statLabel}>Riwayat</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{watchLaterCount}</Text>
            <Text style={styles.statLabel}>Tonton Nanti</Text>
          </View>
        </View>
      </View>

      <Divider style={{ backgroundColor: isDark ? '#222' : '#ddd', marginHorizontal: 16 }} />

      {/* Menu Items */}
      <View style={styles.menuSection}>
        {MENU_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={() => {
              navigation.navigate('Utils', { screen: item.screen as any });
            }}>
            <View style={[styles.menuIconContainer, { backgroundColor: isDark ? '#222' : '#f0f0f0' }]}>
              <MaterialIcons name={item.icon} size={22} color={item.iconColor} />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: isDark ? '#e0e0e0' : '#111' }]}>
                {item.title}
              </Text>
              <Text style={[styles.menuDesc, { color: isDark ? '#888' : '#666' }]}>
                {item.desc}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={isDark ? '#555' : '#ccc'} />
          </TouchableOpacity>
        ))}
      </View>

      <Divider style={{ backgroundColor: isDark ? '#222' : '#ddd', marginHorizontal: 16, marginTop: 8 }} />

      {/* Sign Out / Sign In */}
      <View style={styles.signOutSection}>
        {user ? (
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <MDIcon name="logout" size={18} color="#ef4444" />
            <Text style={styles.signOutText}>Keluar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.signOutBtn, { borderColor: '#6366f1' }]}
            onPress={() => navigation.navigate('LoginScreen')}>
            <MDIcon name="login" size={18} color="#6366f1" />
            <Text style={[styles.signOutText, { color: '#6366f1' }]}>Masuk</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5' },
    profileSection: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: isDark ? '#333' : '#ddd', marginBottom: 12 },
    avatarPlaceholder: { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    username: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111', marginBottom: 2 },
    displayName: { fontSize: 13, color: '#888', marginBottom: 12 },
    levelSection: { width: '100%', marginBottom: 16, alignItems: 'center' },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    rankBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
    rankText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    levelText: { fontSize: 14, fontWeight: '700', color: isDark ? '#e0e0e0' : '#333' },
    expBarContainer: { width: '80%', height: 6, backgroundColor: isDark ? '#333' : '#e0e0e0', borderRadius: 3, overflow: 'hidden' },
    expBarFill: { height: '100%', borderRadius: 3 },
    expText: { fontSize: 10, color: '#888', marginTop: 4 },
    statsRow: { flexDirection: 'row', gap: 32 },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#111' },
    statLabel: { fontSize: 11, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
    menuSection: { paddingHorizontal: 16, paddingVertical: 8 },
    menuItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4,
      gap: 14, borderBottomWidth: 0.5, borderBottomColor: isDark ? '#1a1a1a' : '#eee',
    },
    menuIconContainer: {
      width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    },
    menuTextContainer: { flex: 1 },
    menuTitle: { fontSize: 15, fontWeight: '600' },
    menuDesc: { fontSize: 12, marginTop: 2 },
    signOutSection: { paddingHorizontal: 24, paddingTop: 20 },
    signOutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333',
    },
    signOutText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  });
}

export default memo(AccountPage);
