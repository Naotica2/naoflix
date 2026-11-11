import React, { memo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { getUserStats, UserStats } from '../../utils/UserTracker';
import moment from 'moment';
import { useLanguage } from '../../misc/LanguageContext';

type TabCategory = 'Anime' | 'Film' | 'Komik';
const TABS: TabCategory[] = ['Anime', 'Film', 'Komik'];

function UserStatsDash() {
  const isDark = useColorScheme() === 'dark';
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabCategory>('Anime');

  useEffect(() => {
    getUserStats().then(setStats);
  }, []);

  if (!stats) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: isDark ? '#fff' : '#000' }}>{t('profile.loadingStats')}</Text>
      </View>
    );
  }

  const formatDaysAndHours = (ms: number) => {
    const duration = moment.duration(ms);
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();

    if (days > 0) return t('profile.daysHours', { days, hours });
    if (hours > 0) return t('profile.hoursMinutesShort', { hours, minutes });
    return t('profile.minutesFull', { minutes });
  };

  const formatMsToText = (ms: number) => {
    if (ms < 60000) return t('profile.lessThanMinute');
    return formatDaysAndHours(ms);
  };

  const getTabData = () => {
    switch (activeTab) {
      case 'Anime':
        return {
          title: t('profile.totalAnime'),
          count: stats.animeCount,
          subCount: t('profile.episodesWatched', { count: stats.animeEpisodes }),
          timeMs: stats.animeTimeMs,
          timeLabel: t('profile.watchTime'),
          color: '#6366f1',
          bgLight: isDark ? '#2e3163' : '#e0e7ff',
        };
      case 'Film':
        return {
          title: t('profile.totalFilm'),
          count: stats.movieCount,
          subCount: '-',
          timeMs: stats.movieTimeMs,
          timeLabel: t('profile.watchTime'),
          color: '#ec4899',
          bgLight: isDark ? '#5c2242' : '#fce7f3',
        };
      case 'Komik':
        return {
          title: t('profile.totalComics'),
          count: stats.comicCount,
          subCount: t('profile.chaptersRead', { count: stats.comicChapters }),
          timeMs: stats.comicTimeMs,
          timeLabel: t('profile.readTime'),
          color: '#f59e0b',
          bgLight: isDark ? '#6b4505' : '#fef3c7',
        };
    }
  };

  const getTabLabel = (tab: TabCategory) => {
    switch (tab) {
      case 'Anime':
        return t('profile.animeStats');
      case 'Film':
        return t('profile.filmStats');
      case 'Komik':
        return t('profile.comicsStats');
    }
  };

  const activeData = getTabData();
  const hPad = isCompact ? 14 : 20;

  return (
    <View style={styles.container}>
      <Text style={[styles.headerTitle, { marginLeft: hPad, color: isDark ? '#fff' : '#111' }]}>
        {t('profile.statsTitle')}
      </Text>

      <View style={[styles.tabsRow, { paddingHorizontal: hPad }]}>
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
                  backgroundColor: isActive
                    ? isDark
                      ? '#fff'
                      : '#111'
                    : isDark
                      ? '#222'
                      : '#f0f0f0',
                  borderColor: isActive ? 'transparent' : isDark ? '#333' : '#ddd',
                  borderWidth: 1,
                },
              ]}>
              <Text
                style={[
                  styles.tabPillText,
                  {
                    color: isActive ? (isDark ? '#000' : '#fff') : isDark ? '#aaa' : '#666',
                    fontWeight: isActive ? 'bold' : '500',
                  },
                ]}>
                {getTabLabel(tab)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        style={[
          styles.statCard,
          {
            marginHorizontal: hPad,
            padding: isCompact ? 18 : 24,
            backgroundColor: activeData.bgLight,
          },
        ]}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text
              style={[
                styles.mainCountText,
                { fontSize: isCompact ? 40 : 48, lineHeight: isCompact ? 48 : 56 },
                { color: isDark ? '#fff' : activeData.color },
              ]}>
              {activeData.count}
            </Text>
            <Text style={[styles.mainTitleText, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
              {activeData.title}
            </Text>
          </View>
          {activeData.subCount !== '-' && (
            <View style={styles.subCountBadge}>
              <MaterialIcons
                name="play-arrow"
                size={12}
                color={activeData.color}
                style={{ marginRight: 2 }}
              />
              <Text style={[styles.subCountText, { color: activeData.color }]}>
                {activeData.subCount}
              </Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.divider,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
          ]}
        />

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
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPillText: {
    fontSize: 13,
  },
  statCard: {
    borderRadius: 24,
    elevation: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainCountText: {
    fontWeight: '900',
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
    marginVertical: 20,
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

export default memo(UserStatsDash);
