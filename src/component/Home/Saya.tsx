import { DrawerContentScrollView, createDrawerNavigator } from '@react-navigation/drawer';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Appbar, Divider } from 'react-native-paper';
import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import MDIcon from '@react-native-vector-icons/material-design-icons';
import useGlobalStyles from '../../assets/style';
import { SayaDrawerNavigator } from '../../types/navigation';
import { useAuth } from '../../misc/AuthContext';
import { useKeyValueIfFocused } from '../../utils/DatabaseManager';
import History from './Saya/History';
import WatchLater from './Saya/WatchLater';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../../types/navigation';

const Drawer = createDrawerNavigator<SayaDrawerNavigator>();

function ProfileDrawerContent(props: DrawerContentComponentProps) {
  const { profile, user, signOut } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();

  const historyRaw = useKeyValueIfFocused('historyKeyCollectionsOrder');
  const watchLaterRaw = useKeyValueIfFocused('watchLater');

  const historyCount = useMemo(() => {
    try { return (JSON.parse(historyRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [historyRaw]);

  const watchLaterCount = useMemo(() => {
    try { return (JSON.parse(watchLaterRaw ?? '[]') as unknown[]).length; } catch { return 0; }
  }, [watchLaterRaw]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5' },
    profileSection: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: isDark ? '#333' : '#ddd', marginBottom: 12 },
    avatarPlaceholder: { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
    username: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111', marginBottom: 2 },
    displayName: { fontSize: 13, color: '#888', marginBottom: 16 },
    statsRow: { flexDirection: 'row', gap: 32 },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#111' },
    statLabel: { fontSize: 11, color: '#888', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
    navSection: { paddingHorizontal: 12, paddingVertical: 8 },
    navItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
      borderRadius: 12, gap: 14,
    },
    navItemActive: { backgroundColor: isDark ? '#1a1a1a' : '#e8e8e8' },
    navText: { fontSize: 15, fontWeight: '600', color: isDark ? '#e0e0e0' : '#333' },
    navTextActive: { color: isDark ? '#fff' : '#000' },
    signOutSection: { paddingHorizontal: 24, paddingBottom: 20, marginTop: 'auto' },
    signOutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333',
    },
    signOutText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  }), [isDark]);

  const activeIndex = props.state.index;

  return (
    <View style={styles.container}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
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
          <Text style={styles.username}>@{profile?.username ?? '—'}</Text>
          <Text style={styles.displayName}>{profile?.display_name ?? ''}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{historyCount}</Text>
              <Text style={styles.statLabel}>Riwayat</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{watchLaterCount}</Text>
              <Text style={styles.statLabel}>Nanti</Text>
            </View>
          </View>
        </View>

        <Divider style={{ backgroundColor: isDark ? '#222' : '#ddd' }} />

        <View style={styles.navSection}>
          <TouchableOpacity
            style={[styles.navItem, activeIndex === 0 && styles.navItemActive]}
            onPress={() => props.navigation.navigate('History')}>
            <MaterialIcons name="history" size={22} color={activeIndex === 0 ? (isDark ? '#fff' : '#000') : '#888'} />
            <Text style={[styles.navText, activeIndex === 0 && styles.navTextActive]}>Riwayat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navItem, activeIndex === 1 && styles.navItemActive]}
            onPress={() => props.navigation.navigate('WatchLater')}>
            <Icon name="clock-o" size={20} color={activeIndex === 1 ? (isDark ? '#fff' : '#000') : '#888'} />
            <Text style={[styles.navText, activeIndex === 1 && styles.navTextActive]}>Tonton Nanti</Text>
          </TouchableOpacity>
        </View>
      </DrawerContentScrollView>

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
    </View>
  );
}

function Saya() {
  const globalStyles = useGlobalStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { profile } = useAuth();

  return (
    <Drawer.Navigator
      drawerContent={drawerProps => <ProfileDrawerContent {...drawerProps} />}
      screenOptions={{
        header: headerProps => (
          <Appbar.Header style={{ backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5' }}>
            <Appbar.Action icon="menu" onPress={() => headerProps.navigation.openDrawer()} />
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
              />
            ) : null}
            <Appbar.Content
              titleStyle={{ fontWeight: 'bold', fontSize: 16 }}
              title={
                typeof headerProps.options.headerTitle === 'string'
                  ? headerProps.options.headerTitle
                  : (headerProps.options.title ?? '')
              }
            />
          </Appbar.Header>
        ),
        headerTintColor: globalStyles.text.color,
        drawerType: 'front',
        drawerStyle: { width: '75%' },
        drawerContentStyle: { backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5' },
      }}>
      <Drawer.Screen
        name="History"
        component={History}
        options={{ title: 'Riwayat' }}
      />
      <Drawer.Screen
        name="WatchLater"
        component={WatchLater}
        options={{ title: 'Tonton Nanti' }}
      />
    </Drawer.Navigator>
  );
}

export default memo(Saya);
