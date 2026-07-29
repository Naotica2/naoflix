import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, TouchableOpacity, Dimensions } from 'react-native';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { getUserStats, UserStats } from '../../utils/UserTracker';
import moment from 'moment';
import 'moment/locale/id';

const { width } = Dimensions.get('window');

type TabCategory = 'Anime' | 'Film' | 'TV Series' | 'Komik' | 'Novel';
const TABS: TabCategory[] = ['Anime', 'Film', 'TV Series', 'Komik', 'Novel'];

export default function UserStatsDash() {
  const isDark = useColorScheme() === 'dark';
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabCategory>('Anime');

  useEffect(() => {
    getUserStats().then(setStats);
  }, []);

  if (!stats) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: isDark ? '#fff' : '#000' }}>Memuat statistik...</Text>
      </View>
    );
  }

  const formatDaysAndHours = (ms: number) => {
    const duration = moment.duration(ms);
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();
    
    if (days > 0) return `${days} Hari ${hours} Jam`;
    if (hours > 0) return `${hours} Jam ${minutes} Mnt`;
    return `${minutes} Menit`;
  };

  const formatMsToText = (ms: number) => {
    if (ms < 60000) return '< 1 Menit';
    return formatDaysAndHours(ms);
  };

  const getTabData = () => {
    switch (activeTab) {
      case 'Anime':
        return {
          title: 'Total Anime',
          count: stats.animeCount,
          subCount: `${stats.animeEpisodes} Eps`,
          timeMs: stats.animeTimeMs,
          timeLabel: 'Waktu Nonton',
          icon: 'live-tv',
          color: '#6366f1',
          bgLight: isDark ? '#2e3163' : '#e0e7ff',
        };
      case 'Film':
        return {
          title: 'Total Film',
          count: stats.movieCount,
          subCount: '-',
          timeMs: stats.movieTimeMs,
          timeLabel: 'Waktu Nonton',
          icon: 'movie',
          color: '#ec4899',
          bgLight: isDark ? '#5c2242' : '#fce7f3',
        };
      case 'TV Series':
        return {
          title: 'Total Series',
          count: stats.seriesCount,
          subCount: `${stats.seriesEpisodes} Eps`,
          timeMs: stats.seriesTimeMs,
          timeLabel: 'Waktu Nonton',
          icon: 'subscriptions',
          color: '#8b5cf6',
          bgLight: isDark ? '#3d266e' : '#ede9fe',
        };
      case 'Komik':
        return {
          title: 'Total Komik',
          count: stats.comicCount,
          subCount: `${stats.comicChapters} Ch`,
          timeMs: stats.comicTimeMs,
          timeLabel: 'Waktu Baca',
          icon: 'library-books',
          color: '#f59e0b',
          bgLight: isDark ? '#6b4505' : '#fef3c7',
        };
      case 'Novel':
        return {
          title: 'Total Novel',
          count: stats.novelCount,
          subCount: `${stats.novelChapters} Ch`,
          timeMs: stats.novelTimeMs,
          timeLabel: 'Waktu Baca',
          icon: 'menu-book',
          color: '#10b981',
          bgLight: isDark ? '#054e36' : '#d1fae5',
        };
    }
  };

  const activeData = getTabData();

  return (
    <View style={styles.container}>
      <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111' }]}>NaoFlix Statistics</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
        {TABS.map(tab => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity 
              key={tab} 
              activeOpacity={0.8}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabPill, 
                { 
                  backgroundColor: isActive ? (isDark ? '#fff' : '#111') : (isDark ? '#222' : '#f0f0f0'),
                  borderColor: isActive ? 'transparent' : (isDark ? '#333' : '#ddd'),
                  borderWidth: 1,
                }
              ]}>
              <Text style={[styles.tabPillText, { color: isActive ? (isDark ? '#000' : '#fff') : (isDark ? '#aaa' : '#666'), fontWeight: isActive ? 'bold' : '500' }]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.statCard, { backgroundColor: activeData.bgLight }]}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.mainCountText, { color: isDark ? '#fff' : activeData.color }]}>
              {activeData.count}
            </Text>
            <Text style={[styles.mainTitleText, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
              {activeData.title}
            </Text>
          </View>
          {activeData.subCount !== '-' && (
            <View style={styles.subCountBadge}>
              <MaterialIcons name="play-arrow" size={12} color={activeData.color} style={{ marginRight: 2 }} />
              <Text style={[styles.subCountText, { color: activeData.color }]}>{activeData.subCount}</Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />

        <View style={styles.bottomStatsRow}>
          <View style={styles.bottomStatItem}>
            <View style={[styles.iconCircle, { backgroundColor: activeData.color + '30' }]}>
              <MaterialIcons name="schedule" size={18} color={activeData.color} />
            </View>
            <View>
              <Text style={[styles.bottomStatValue, { color: isDark ? '#fff' : '#334155' }]}>
                {formatMsToText(activeData.timeMs)}
              </Text>
              <Text style={[styles.bottomStatLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                {activeData.timeLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
    marginLeft: 20,
    letterSpacing: 0.5,
  },
  tabsScroll: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPillText: {
    fontSize: 14,
  },
  statCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 24,
    elevation: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainCountText: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 56,
  },
  mainTitleText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  subCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  subCountText: {
    fontSize: 13,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 24,
  },
  bottomStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bottomStatValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  bottomStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
