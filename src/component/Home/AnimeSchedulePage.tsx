import MaterialIcon from '@react-native-vector-icons/material-icons';
import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimeAPI from '../../utils/AnimeAPI';
import { getActiveAnimeSource, getSourceVersion } from '../../utils/sourcePreferences';
import ImageLoading from '../misc/ImageLoading';
import { LinearGradient } from 'expo-linear-gradient';
import { TranslationKey, useLanguage } from '../../misc/LanguageContext';

interface ScheduleAnimeItem {
  title: string;
  link: string;
  estimatedTime: string;
  estimatedEpisode: string;
  thumbnailUrl?: string;
}

function getConsistentTime(title: string): string {
  const times = [
    '08:30', '09:00', '10:00', '11:30', '12:30',
    '14:00', '15:30', '17:00', '18:30', '19:30',
    '20:00', '20:30', '21:00', '21:30', '22:00',
    '22:30', '23:00'
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  return times[Math.abs(hash) % times.length];
}

function getConsistentEpNum(title: string, weekOffset: number = 0): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const baseEp = (Math.abs(hash) % 11) + 1;
  return Math.max(1, baseEp + weekOffset);
}

interface DayColumnInfo {
  dayName: string;
  shortDay: string;
  dateNumber: number;
  monthIndex: number;
  fullDate: Date;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
}

function computeWeekDays(weekOffset: number): DayColumnInfo[] {
  const now = new Date();
  const currentDayIndex = now.getDay();
  // Normalize Monday as first day: Monday=0 ... Sunday=6
  const normalizedIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;

  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() - normalizedIndex + weekOffset * 7);
  mondayDate.setHours(0, 0, 0, 0);

  const days: DayColumnInfo[] = [];
  const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const shortNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);

    const isToday = d.getTime() === todayStart.getTime();
    const isPast = d.getTime() < todayStart.getTime();
    const isFuture = d.getTime() > todayStart.getTime();

    days.push({
      dayName: dayNames[i],
      shortDay: shortNames[i],
      dateNumber: d.getDate(),
      monthIndex: d.getMonth(),
      fullDate: d,
      isToday,
      isPast,
      isFuture,
    });
  }

  return days;
}

const AnimeScheduleCard = memo(function AnimeScheduleCard({
  item,
  isToday,
  isDayPast,
  currentHourMinute,
  onPress,
}: {
  item: ScheduleAnimeItem;
  isToday: boolean;
  isDayPast: boolean;
  currentHourMinute: string;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useLanguage();

  const isTimePassed = isDayPast || (isToday && currentHourMinute >= item.estimatedTime);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={styles.cardContainer}>
      <View style={[styles.posterWrapper, { backgroundColor: isDark ? '#18181b' : '#e2e8f0' }]}>
        <ImageLoading
          source={{ uri: item.thumbnailUrl || '' }}
          fallbackSearchTitle={item.title}
          style={styles.cardCover}
          resizeMode="cover"
        />

        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.75)']}
          style={styles.gradientOverlay}
          pointerEvents="none"
        />

        <View style={styles.topBadgeRow} pointerEvents="none">
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isTimePassed
                  ? 'rgba(34, 197, 94, 0.9)'
                  : 'rgba(59, 130, 246, 0.85)',
              },
            ]}>
            <Text style={styles.statusPillText}>
              {isTimePassed ? t('schedule.statusAvailable') : t('schedule.statusSoon')}
            </Text>
          </View>
        </View>

        <View style={styles.bottomBadgeRow} pointerEvents="none">
          <View style={styles.timeBadge}>
            <Text style={styles.timeBadgeText}>{item.estimatedTime}</Text>
          </View>
          <View style={styles.episodeBadge}>
            <Text style={styles.episodeBadgeText}>
              {item.estimatedEpisode.replace(/Episode\s*/i, 'Ep ')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <Text
          numberOfLines={2}
          style={[
            styles.cardTitle,
            { color: isDark ? '#f1f5f9' : '#0f172a' },
          ]}>
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.cardSubText,
            { color: isDark ? '#94a3b8' : '#64748b' },
          ]}>
          {item.estimatedTime} WIB • {item.estimatedEpisode}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export function AnimeSchedulePage() {
  const isDark = useColorScheme() === 'dark';
  const navigation = useNavigation<any>();
  const { width: screenWidth } = useWindowDimensions();
  const { t } = useLanguage();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  });

  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentHourMinute, setCurrentHourMinute] = useState('00:00');
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<'otakudesu' | 'nimegami'>('otakudesu');
  const loadedVersionRef = useRef(-1);
  const hasLoadedRef = useRef(false);
  const [jadwalRaw, setJadwalRaw] = useState<
    Record<
      string,
      {
        title: string;
        link: string;
        thumbnailUrl?: string;
        estimatedTime?: string;
        estimatedEpisode?: string;
      }[]
    >
  >({});

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();

      setCurrentHourMinute(`${h}:${m}`);
      setCurrentTimeStr(`(GMT +07:00) ${mo}/${d}/${y} ${h}:${m}:${s} WIB`);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch schedule matching the active anime source, and auto-reload whenever user switches source
  useFocusEffect(
    useCallback(() => {
      const currentVer = getSourceVersion();
      if (loadedVersionRef.current === currentVer && hasLoadedRef.current) {
        return;
      }
      loadedVersionRef.current = currentVer;
      const controller = new AbortController();
      let isMounted = true;
      setLoading(true);

      Promise.all([
        getActiveAnimeSource(),
        AnimeAPI.jadwalAnime(controller.signal),
      ])
        .then(([src, res]) => {
          if (isMounted) {
            hasLoadedRef.current = true;
            setActiveSource(src);
            setJadwalRaw(res || {});
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            hasLoadedRef.current = true;
            setLoading(false);
          }
        });

      return () => {
        isMounted = false;
        controller.abort();
      };
    }, []),
  );

  const weekDays = useMemo(() => computeWeekDays(weekOffset), [weekOffset]);
  const activeDay = weekDays[selectedDayIndex] || weekDays[0];

  const animeListForDay: ScheduleAnimeItem[] = useMemo(() => {
    const rawList = jadwalRaw[activeDay.dayName] || [];
    return rawList.map(item => {
      const time = item.estimatedTime || getConsistentTime(item.title);
      const epStr = item.estimatedEpisode || `Episode ${getConsistentEpNum(item.title, weekOffset)}`;
      return {
        title: item.title,
        link: item.link,
        thumbnailUrl: item.thumbnailUrl,
        estimatedTime: time,
        estimatedEpisode: epStr,
      };
    }).sort((a, b) => a.estimatedTime.localeCompare(b.estimatedTime));
  }, [jadwalRaw, activeDay.dayName, weekOffset]);

  const handlePrevWeek = () => {
    setWeekOffset(prev => prev - 1);
  };

  const handleNextWeek = () => {
    setWeekOffset(prev => prev + 1);
  };

  const numColumns = useMemo(() => {
    return screenWidth > 600 ? 4 : 3;
  }, [screenWidth]);

  const renderItem = useCallback(
    ({ item }: { item: ScheduleAnimeItem }) => (
      <View style={{ flex: 1, padding: 4 }}>
        <AnimeScheduleCard
          item={item}
          isToday={activeDay.isToday}
          isDayPast={activeDay.isPast}
          currentHourMinute={currentHourMinute}
          onPress={() => {
            navigation.dispatch(
              StackActions.push('FromUrl', {
                title: item.title,
                link: item.link,
                type: 'anime',
                thumbnailUrl: item.thumbnailUrl,
              }),
            );
          }}
        />
      </View>
    ),
    [activeDay.isToday, activeDay.isPast, currentHourMinute, navigation],
  );

  const sourceDisplayName =
    activeSource === 'nimegami'
      ? 'Nimegami'
      : 'Otakudesu';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: isDark ? '#09090b' : '#f8fafc' }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: isDark ? '#18181b' : '#f1f5f9' }]}>
          <MaterialIcon name="chevron-left" size={24} color={isDark ? '#f4f4f6' : '#0f172a'} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.mainHeaderTitle, { color: isDark ? '#f4f4f6' : '#0f172a' }]}>
            {t('schedule.title')} ({sourceDisplayName})
          </Text>
          {currentTimeStr ? (
            <Text style={[styles.timeSubtitle, { color: isDark ? '#71717a' : '#64748b' }]}>
              {currentTimeStr}
            </Text>
          ) : null}
        </View>

        <View style={{ width: 40 }} />
      </View>

      <View style={styles.weekSelectorContainer}>
        {weekOffset !== 0 && (
          <View style={styles.weekOffsetBanner}>
            <Text style={[styles.weekOffsetText, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
              {weekOffset > 0
                ? t('schedule.weeksAhead', { count: weekOffset })
                : t('schedule.weeksAgo', { count: Math.abs(weekOffset) })}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setWeekOffset(0);
                const day = new Date().getDay();
                setSelectedDayIndex(day === 0 ? 6 : day - 1);
              }}
              style={styles.resetWeekBtn}>
              <Text style={styles.resetWeekText}>{t('common.today')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.weekControlsRow}>
          <TouchableOpacity
            onPress={handlePrevWeek}
            style={[styles.arrowButton, { backgroundColor: isDark ? '#18181b' : '#ffffff', borderColor: isDark ? '#27272a' : '#e2e8f0' }]}>
            <MaterialIcon name="chevron-left" size={18} color={isDark ? '#a1a1aa' : '#64748b'} />
          </TouchableOpacity>

          <View style={styles.daysScrollRow}>
            {weekDays.map((d, index) => {
              const isSelected = selectedDayIndex === index;
              const monthLabel = t(`schedule.month.${d.monthIndex}` as TranslationKey);
              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.7}
                  onPress={() => setSelectedDayIndex(index)}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: isSelected
                        ? '#3b82f6'
                        : d.isToday
                        ? (isDark ? '#1e293b' : '#e0e7ff')
                        : d.isPast
                        ? (isDark ? '#141416' : '#f1f5f9')
                        : (isDark ? '#18181b' : '#ffffff'),
                      borderColor: isSelected
                        ? '#2563eb'
                        : d.isToday
                        ? '#3b82f6'
                        : (isDark ? '#27272a' : '#e2e8f0'),
                      opacity: !isSelected && d.isPast ? 0.6 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.dayShortName,
                      {
                        color: isSelected
                          ? '#ffffff'
                          : d.isToday
                          ? '#3b82f6'
                          : d.isPast
                          ? (isDark ? '#71717a' : '#94a3b8')
                          : (isDark ? '#a1a1aa' : '#475569'),
                        fontWeight: isSelected || d.isToday ? '700' : '500',
                      },
                    ]}>
                    {t(`schedule.day.${d.shortDay}` as TranslationKey)}
                  </Text>
                  <Text
                    style={[
                      styles.dayDateNumber,
                      {
                        color: isSelected
                          ? '#ffffff'
                          : d.isToday
                          ? (isDark ? '#f4f4f6' : '#0f172a')
                          : d.isPast
                          ? (isDark ? '#52525b' : '#94a3b8')
                          : (isDark ? '#e4e4e7' : '#334155'),
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}>
                    {d.dateNumber} {monthLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={handleNextWeek}
            style={[styles.arrowButton, { backgroundColor: isDark ? '#18181b' : '#ffffff', borderColor: isDark ? '#27272a' : '#e2e8f0' }]}>
            <MaterialIcon name="chevron-right" size={18} color={isDark ? '#a1a1aa' : '#64748b'} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.dayInfoBanner}>
        <Text style={[styles.dayInfoTitle, { color: isDark ? '#f4f4f6' : '#0f172a' }]}>
          {t(`schedule.dayFull.${activeDay.dayName}` as TranslationKey)}, {activeDay.dateNumber}{' '}
          {t(`schedule.month.${activeDay.monthIndex}` as TranslationKey)}
        </Text>
        <View style={styles.dayBadgeRow}>
          {activeDay.isToday && (
            <View style={styles.todayHighlightBadge}>
              <Text style={styles.todayHighlightText}>{t('common.today')}</Text>
            </View>
          )}
          {activeDay.isPast && !activeDay.isToday && (
            <View style={[styles.todayHighlightBadge, { backgroundColor: isDark ? '#27272a' : '#e2e8f0' }]}>
              <Text style={[styles.todayHighlightText, { color: isDark ? '#a1a1aa' : '#64748b' }]}>
                {t('schedule.passedBadge')}
              </Text>
            </View>
          )}
          <Text style={[styles.animeCountText, { color: isDark ? '#71717a' : '#64748b' }]}>
            {t('schedule.scheduledCount', { count: animeListForDay.length })}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={{ marginTop: 12, color: isDark ? '#71717a' : '#64748b', fontSize: 13 }}>
              {t('schedule.loadingSchedule')}
            </Text>
          </View>
        ) : animeListForDay.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={[styles.emptyTitle, { color: isDark ? '#f4f4f6' : '#18181b' }]}>
              {t('schedule.emptyDayTitle')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: isDark ? '#71717a' : '#888990' }]}>
              {t('schedule.emptyDayDesc', {
                day: t(`schedule.dayFull.${activeDay.dayName}` as TranslationKey),
                source: sourceDisplayName,
              })}
            </Text>
          </View>
        ) : (
          <FlashList
            key={numColumns}
            data={animeListForDay}
            numColumns={numColumns}
            contentContainerStyle={styles.listContent}
            keyExtractor={item => item.link || item.title}
            renderItem={renderItem}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  mainHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  timeSubtitle: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  weekSelectorContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  weekOffsetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  weekOffsetText: {
    fontSize: 11,
    fontWeight: '600',
  },
  resetWeekBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  resetWeekText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  weekControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrowButton: {
    width: 32,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  daysScrollRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  dayShortName: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  dayDateNumber: {
    fontSize: 11,
    marginTop: 2,
  },
  dayInfoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dayInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dayBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayHighlightBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  todayHighlightText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  animeCountText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  cardContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  posterWrapper: {
    width: '100%',
    aspectRatio: 1 / 1.5,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  topBadgeRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '700',
  },
  bottomBadgeRow: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  timeBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '600',
  },
  episodeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.92)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '700',
  },
  cardDetails: {
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  cardSubText: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 240,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
});

export default memo(AnimeSchedulePage);
