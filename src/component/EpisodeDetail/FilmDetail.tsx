import Icon from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigator } from '../../types/navigation';
import { FilmSearchItem, FilmSeason } from '../../types/film';
import { FilmAPI } from '../../utils/FilmAPI';
import { hasIndonesian, getLanguageOptions } from '../../utils/scrapers/lk21';
import controlWatchLater from '../../utils/watchLaterControl';
import { DatabaseManager } from '../../utils/DatabaseManager';
import ImageLoading from '../misc/ImageLoading';
import cleanSynopsis from '../../utils/cleanSynopsis';
import { tSync, useLanguage } from '../../misc/LanguageContext';
import { normalizeMediaKey } from '../../types/forum';
import MediaForumSection from '../Forum/MediaForumSection';

type Props = NativeStackScreenProps<RootStackNavigator, 'FilmDetail'>;

function FilmDetail(props: Props) {
  const { data } = props.route.params;
  const { t } = useLanguage();
  const styles = useStyles();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTV = data.subjectType == 2 || data.type === 'TV' || data.type === 'Series';

  const [inWatchLater, setInWatchLater] = useState(false);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);

  useEffect(() => {
    const checkWatchLater = async () => {
      try {
        const itemData = props.route.params.data as FilmSearchItem;
        const wlStr = await DatabaseManager.get('watchLater');
        if (wlStr) {
          const wl: any[] = (() => {
            try {
              return JSON.parse(wlStr);
            } catch {
              return [];
            }
          })();
          const found = Array.isArray(wl) && wl.some(item => item.link?.includes(itemData.id));
          setInWatchLater(found);
        }
      } catch {}
    };
    checkWatchLater();
  }, [data.id, props.route.params.data]);

  const langOptions = useMemo(() => getLanguageOptions(data), [data]);
  const [selectedLang, setSelectedLang] = useState(() => {
    const id = langOptions.find(l => l.isIndonesian);
    return id || langOptions[0];
  });

  const [seasons, setSeasons] = useState<FilmSeason[] | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<FilmSeason | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [description, setDescription] = useState(data.description || '');

  useEffect(() => {
    if (!description) {
      let cancelled = false;
      const detailPath = selectedLang?.detailPath || data.id;
      FilmAPI.getFilmDetails(data.source || 'lk21', data.id, detailPath).then(res => {
        if (!cancelled && res?.description) {
          setDescription(res.description);
        }
      }).catch(() => {});
      return () => { cancelled = true; };
    }
  }, [data.id, data.source, selectedLang, description]);

  useEffect(() => {
    if (!isTV) return;
    let cancelled = false;
    (async () => {
      setLoadingSeasons(true);
      try {
        const detailPath = selectedLang?.detailPath || data.id;
        if (data.type === 'TV' || data.type === 'Series') {
          const res = await FilmAPI.getSeasonInfo(data.source || 'lk21', data.id, detailPath);
          if (!cancelled) {
            setSeasons(res);
            if (res.length > 0) {
              setSelectedSeason(res[0]);
              setSelectedEpisode(1);
            }
          }
        }
      } catch {
        if (!cancelled) setSeasons([]);
      } finally {
        if (!cancelled) setLoadingSeasons(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.id, selectedLang, isTV, data.type, data.source]);

  const handleRefreshSeasons = useCallback(async () => {
    setLoadingSeasons(true);
    try {
      const detailPath = selectedLang?.detailPath || data.id;
      const result = await FilmAPI.getSeasonInfo(data.source || 'lk21', data.id, detailPath);
      setSeasons(result);
      if (result.length > 0) {
        setSelectedSeason(result[0]);
        setSelectedEpisode(1);
      }
    } catch {}
    setLoadingSeasons(false);
  }, [data.id, data.source, selectedLang]);

  useEffect(() => {
    setSelectedEpisode(1);
  }, [selectedSeason]);

  const posterWidth = Math.min(130, width * 0.32);
  const posterHeight = posterWidth * 1.48;

  const genres = useMemo(() => {
    return data.genres
      ? data.genres
      : (data.genre
          ? data.genre
              .split(',')
              .map((g: string) => g.trim())
              .filter(Boolean)
          : []);
  }, [data.genres, data.genre]);

  const handleToggleWatchLater = useCallback(() => {
    if (inWatchLater) {
      const wlStr = DatabaseManager.getSync('watchLater');
      if (wlStr) {
        let wl: any[] = [];
        try {
          wl = JSON.parse(wlStr);
        } catch {
          wl = [];
        }
        const idx = Array.isArray(wl) ? wl.findIndex(item => item.link?.includes(data.id)) : -1;
        if (idx >= 0) {
          controlWatchLater('delete', idx);
          setInWatchLater(false);
          ToastAndroid.show(tSync('detail.removedWatchLater'), ToastAndroid.SHORT);
        }
      }
    } else {
      controlWatchLater('add', {
        link: `film://${data.id}/${data.id || ''}`,
        title: data.title,
        rating: String(data.imdbRatingValue || ''),
        releaseYear: data.releaseDate?.slice(0, 4) || '',
        thumbnailUrl: data.poster || '',
        date: Date.now(),
        genre: genres,
        isMovie: !isTV,
      });
      setInWatchLater(true);
      ToastAndroid.show(tSync('detail.addedWatchLater'), ToastAndroid.SHORT);
    }
  }, [data, genres, inWatchLater, isTV]);

  const handlePlay = useCallback(async () => {
    setIsLoading(true);
    const s = selectedSeason?.se ?? 1;
    const e = selectedEpisode;
    try {
      const detailPath = selectedLang?.detailPath || data.id;
      
      let streams = await FilmAPI.getPlayStreams(
        data.source || 'lk21',
        data.id,
        detailPath,
        isTV ? s : undefined,
        isTV ? e : undefined,
      );

      if (!streams.length && !isTV) {
        streams = await FilmAPI.getPlayStreams(
          data.source || 'lk21',
          data.id,
          detailPath,
          1,
          1,
        );
      }

      if (!streams.length) {
        if (detailPath !== data.id) {
          let fallbackStreams = await FilmAPI.getPlayStreams(
            data.source || 'lk21',
            data.id,
            data.id,
            isTV ? s : undefined,
            isTV ? e : undefined,
          );
          
          if (!fallbackStreams.length && !isTV) {
            fallbackStreams = await FilmAPI.getPlayStreams(
              data.source || 'lk21',
              data.id,
              data.id,
              1,
              1,
            );
          }

          if (fallbackStreams.length) {
            props.navigation.navigate('FilmPlayer', {
              streams: fallbackStreams,
              title: isTV ? `${data.title} S${s}E${e}` : data.title,
              subjectId: data.id,
              detailPath: data.id,
              type: isTV ? 'tv' : 'movie',
              season: isTV ? s : undefined,
              episode: isTV ? e : undefined,
              seasons: isTV ? (seasons || undefined) : undefined,
              poster: data.poster || data.cover,
              language: selectedLang?.label,
              source: data.source || 'lk21',
            });
            setIsLoading(false);
            return;
          }
        }
        ToastAndroid.show(tSync('detail.noEpisodeVideo'), ToastAndroid.LONG);
        setIsLoading(false);
        return;
      }

      props.navigation.navigate('FilmPlayer', {
        streams,
        title: isTV ? `${data.title} S${s}E${e}` : data.title,
        subjectId: data.id,
        detailPath,
        type: isTV ? 'tv' : 'movie',
        season: isTV ? s : undefined,
        episode: isTV ? e : undefined,
        seasons: isTV ? (seasons || undefined) : undefined,
        poster: data.poster || data.cover,
        language: selectedLang?.label,
        source: data.source || 'lk21',
      });
    } catch (e: any) {
      ToastAndroid.show(e.message || tSync('detail.failedLoadVideo'), ToastAndroid.LONG);
    } finally {
      setIsLoading(false);
    }
  }, [data, selectedSeason, selectedEpisode, isTV, props.navigation, selectedLang, seasons]);

  const cleanedDescription = useMemo(() => {
    return cleanSynopsis(description);
  }, [description]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#0B0E14' : '#F8FAFC' }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}>
      <View style={{ width: '100%', height: 240, overflow: 'hidden' }}>
        <ImageLoading
          source={{ uri: data.poster }}
          fallbackSearchTitle={data.title}
          style={{ width: '100%', height: '100%' }}
          blurRadius={12}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(11,14,20,0.1)', 'rgba(11,14,20,0.7)', isDark ? '#0B0E14' : '#F8FAFC']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <View style={[styles.heroRow, { marginTop: -posterHeight * 0.45 }]}>
        <View style={[styles.posterWrapper, { width: posterWidth, height: posterHeight }]}>
          <ImageLoading
            source={{ uri: data.poster }}
            fallbackSearchTitle={data.title}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>

        <View style={styles.heroDetails}>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: isTV ? '#F59E0B' : '#3B82F6' }]}>
              <Text style={styles.typeBadgeText}>{isTV ? t('detail.tvSeriesBadge') : t('detail.movieBadge')}</Text>
            </View>
            {hasIndonesian(data) && (
              <View style={[styles.typeBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.typeBadgeText}>Sub Indo</Text>
              </View>
            )}
            {data.imdbRatingValue ? (
              <View style={styles.ratingBadge}>
                <Icon name="star" size={11} color="#F5C518" />
                <Text style={styles.ratingBadgeText}>{data.imdbRatingValue}</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.heroTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={3}>
            {data.title}
          </Text>

          <View style={styles.metaRow}>
            {data.releaseDate ? (
              <Text style={[styles.metaText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                <Icon name="calendar" size={11} color="#3B82F6" /> {data.releaseDate.slice(0, 4)}
              </Text>
            ) : null}
            {data.countryName ? (
              <Text style={[styles.metaText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                <Icon name="globe" size={11} color="#10B981" /> {data.countryName}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.primaryPlayButton}
          activeOpacity={0.8}
          disabled={isLoading}
          onPress={handlePlay}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
          ) : (
            <Icon name="play" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
          )}
          <Text style={styles.primaryPlayButtonText}>
            {isLoading
              ? t('common.loading')
              : isTV
                ? t('detail.watchSeriesEp', { season: selectedSeason?.se ?? 1, ep: selectedEpisode })
                : t('detail.watchNow')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, inWatchLater && styles.secondaryActionButtonActive]}
          activeOpacity={0.8}
          onPress={handleToggleWatchLater}>
          <Icon
            name={inWatchLater ? 'check' : 'bookmark-o'}
            size={15}
            color={inWatchLater ? '#3B82F6' : (isDark ? '#E2E8F0' : '#1E293B')}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.secondaryActionText, inWatchLater && { color: '#3B82F6', fontWeight: '700' }]}>
            {inWatchLater ? t('detail.savedBtn') : t('detail.laterBtn')}
          </Text>
        </TouchableOpacity>
      </View>

      {genres.length > 0 && (
        <View style={styles.genreRow}>
          {genres.map((g: string) => (
            <View key={g} style={styles.genrePill}>
              <Text style={styles.genrePillText}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.synopsisCard}>
        <View style={styles.sectionHeaderLine}>
          <View style={styles.sectionAccentDot} />
          <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
            {t('detail.synopsis')}
          </Text>
        </View>
        <Text
          style={[styles.synopsisParagraph, { color: isDark ? '#94A3B8' : '#475569' }]}
          numberOfLines={showFullSynopsis ? undefined : 3}>
          {cleanedDescription}
        </Text>
        {cleanedDescription.length > 130 && (
          <TouchableOpacity
            onPress={() => setShowFullSynopsis(!showFullSynopsis)}
            style={styles.expandSynopsisBtn}
            activeOpacity={0.7}>
            <Text style={styles.expandSynopsisText}>
              {showFullSynopsis ? t('detail.showLess') : t('detail.showMore')}
            </Text>
            <Icon
              name={showFullSynopsis ? 'angle-up' : 'angle-down'}
              size={14}
              color="#3B82F6"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        )}
      </View>

      {langOptions.length > 1 && (
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View style={styles.sectionHeaderLine}>
            <View style={[styles.sectionAccentDot, { backgroundColor: '#8B5CF6' }]} />
            <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{t('detail.languageOptions')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {langOptions.map(lang => {
              const active = selectedLang?.detailPath === lang.detailPath;
              return (
                <TouchableOpacity
                  key={lang.detailPath}
                  onPress={() => setSelectedLang(lang)}
                  activeOpacity={0.7}
                  style={[
                    styles.langPill,
                    active && styles.langPillActive,
                  ]}>
                  <Text style={[styles.langPillText, active && styles.langPillTextActive]}>
                    {lang.isIndonesian ? t('detail.indonesianLang') : lang.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {isTV && (
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={styles.sectionHeaderLine}>
              <View style={[styles.sectionAccentDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                {t('detail.seasonEpisodeHeader')}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={handleRefreshSeasons}
              disabled={loadingSeasons}
              style={{ padding: 4 }}>
              <Icon name="refresh" size={14} color={isDark ? '#8E95A5' : '#64748B'} />
            </TouchableOpacity>
          </View>

          {loadingSeasons ? (
            <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 14 }} />
          ) : !seasons || seasons.length === 0 ? (
            <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontSize: 13 }}>
              {t('detail.loadingEpsFailed')}
            </Text>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {seasons.map(s => {
                  const active = selectedSeason?.se === s.se;
                  return (
                    <TouchableOpacity
                      key={s.se}
                      onPress={() => setSelectedSeason(s)}
                      activeOpacity={0.7}
                      style={[
                        styles.seasonPill,
                        active && styles.seasonPillActive,
                      ]}>
                      <Text style={[styles.seasonPillText, active && styles.seasonPillTextActive]}>
                        {t('detail.seasonLabel', { season: s.se ?? s.seasonNumber ?? 1 })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={{ marginTop: 10 }}>
                <EpisodeGrid
                  maxEp={selectedSeason?.maxEp ?? 1}
                  selectedEp={selectedEpisode}
                  onSelect={setSelectedEpisode}
                  isDark={isDark}
                />
              </View>
            </>
          )}
        </View>
      )}

      <MediaForumSection
        navigation={props.navigation}
        defaultCategory="film"
        linkedMedia={{
          media_key: normalizeMediaKey('film', `${data.source || 'lk21'}:${data.id}`),
          type: 'film',
          title: data.title,
          poster_url: data.poster || data.cover || null,
          link: `film://${data.id}`,
          source: data.source || 'lk21',
          film_item: {
            id: data.id,
            title: data.title,
            poster: data.poster || data.cover || '',
            type: data.type,
            source: data.source || 'lk21',
            subjectType: data.subjectType,
            releaseDate: data.releaseDate,
            rating: data.imdbRatingValue != null ? String(data.imdbRatingValue) : undefined,
            description,
          },
        }}
      />
    </ScrollView>
  );
}

function useStyles() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(
    () =>
      StyleSheet.create({
        heroRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          gap: 14,
        },
        posterWrapper: {
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: isDark ? '#161A23' : '#E2E8F0',
          borderWidth: 1.5,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        },
        heroDetails: {
          flex: 1,
          justifyContent: 'flex-end',
          paddingBottom: 4,
          gap: 4,
        },
        badgeRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          marginBottom: 2,
        },
        typeBadge: {
          paddingHorizontal: 7,
          paddingVertical: 2.5,
          borderRadius: 5,
        },
        typeBadgeText: {
          color: '#FFFFFF',
          fontSize: 10.5,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
        ratingBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(245, 197, 24, 0.15)',
          paddingHorizontal: 7,
          paddingVertical: 2.5,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: 'rgba(245, 197, 24, 0.35)',
        },
        ratingBadgeText: {
          color: isDark ? '#FDE047' : '#B45309',
          fontSize: 11,
          fontWeight: '700',
        },
        heroTitle: {
          fontSize: 18,
          fontWeight: '800',
          lineHeight: 24,
          letterSpacing: -0.2,
        },
        metaRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 2,
        },
        metaText: {
          fontSize: 11.5,
          fontWeight: '500',
        },
        actionRow: {
          flexDirection: 'row',
          paddingHorizontal: 16,
          gap: 10,
          marginTop: 14,
        },
        primaryPlayButton: {
          flex: 2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#3B82F6',
          borderRadius: 10,
          paddingVertical: 12,
          elevation: 4,
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 6,
        },
        primaryPlayButtonText: {
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '700',
        },
        secondaryActionButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: 10,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        },
        secondaryActionButtonActive: {
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.12)',
          borderColor: 'rgba(59, 130, 246, 0.35)',
        },
        secondaryActionText: {
          fontSize: 13,
          fontWeight: '600',
          color: isDark ? '#E2E8F0' : '#1E293B',
        },
        genreRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          paddingHorizontal: 16,
          marginTop: 14,
        },
        genrePill: {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
          borderRadius: 6,
          paddingHorizontal: 9,
          paddingVertical: 4,
        },
        genrePillText: {
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#475569',
        },
        synopsisCard: {
          marginHorizontal: 16,
          marginTop: 14,
          padding: 14,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
          borderRadius: 12,
        },
        sectionHeaderLine: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        sectionAccentDot: {
          width: 3.5,
          height: 14,
          borderRadius: 2,
          backgroundColor: '#3B82F6',
        },
        sectionTitle: {
          fontSize: 14,
          fontWeight: '700',
        },
        synopsisParagraph: {
          fontSize: 13,
          lineHeight: 21,
          marginTop: 6,
        },
        expandSynopsisBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 6,
        },
        expandSynopsisText: {
          color: '#3B82F6',
          fontSize: 12.5,
          fontWeight: '700',
        },
        langPill: {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 8,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
        langPillActive: {
          backgroundColor: '#3B82F6',
          borderColor: '#3B82F6',
        },
        langPillText: {
          fontWeight: '600',
          fontSize: 12,
          color: isDark ? '#CBD5E1' : '#475569',
        },
        langPillTextActive: {
          color: '#FFFFFF',
        },
        seasonPill: {
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
        seasonPillActive: {
          backgroundColor: '#3B82F6',
          borderColor: '#3B82F6',
        },
        seasonPillText: {
          fontSize: 12.5,
          fontWeight: '700',
          color: isDark ? '#CBD5E1' : '#475569',
        },
        seasonPillTextActive: {
          color: '#FFFFFF',
        },
      }),
    [isDark],
  );
}

const EpisodeGrid = memo(
  ({
    maxEp,
    selectedEp,
    onSelect,
    isDark,
  }: {
    maxEp: number;
    selectedEp: number;
    onSelect: (ep: number) => void;
    isDark: boolean;
  }) => {
    const { width: screenWidth } = useWindowDimensions();
    const cols = screenWidth < 380 ? 5 : screenWidth < 520 ? 6 : screenWidth < 768 ? 7 : 9;
    const gap = 8;
    const padding = 32;
    const boxSize = Math.floor((screenWidth - padding - (cols - 1) * gap) / cols);

    const data = useMemo(() => {
      const arr: number[] = [];
      for (let i = 1; i <= maxEp; i++) arr.push(i);
      return arr;
    }, [maxEp]);

    const renderItem = useCallback(
      ({ item }: { item: number }) => {
        const active = item === selectedEp;
        return (
          <TouchableOpacity
            onPress={() => onSelect(item)}
            activeOpacity={0.75}
            style={{
              width: boxSize,
              height: boxSize,
              borderRadius: 8,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: active
                ? '#3B82F6'
                : isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : '#FFFFFF',
              borderWidth: 1,
              borderColor: active
                ? '#3B82F6'
                : isDark
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(0, 0, 0, 0.08)',
            }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: active ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B',
              }}>
              {item}
            </Text>
          </TouchableOpacity>
        );
      },
      [selectedEp, onSelect, boxSize, isDark],
    );

    return (
      <FlatList
        data={data}
        numColumns={cols}
        key={cols}
        renderItem={renderItem}
        keyExtractor={item => String(item)}
        columnWrapperStyle={{ gap }}
        scrollEnabled={false}
        removeClippedSubviews={true}
      />
    );
  },
);

export default memo(FilmDetail);
