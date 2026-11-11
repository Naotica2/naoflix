import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import Icon from '@react-native-vector-icons/material-design-icons';
import { SystemBars } from 'react-native-edge-to-edge';
import Orientation from 'react-native-orientation-locker';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoPlayer, { PlayerRef } from '../VideoPlayer';
import { useLanguage } from '../../misc/LanguageContext';
import { RootStackNavigator } from '../../types/navigation';
import { OfflineAnimeItem } from '../../types/offlineAnime';
import DialogManager from '../../utils/dialogManager';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import {
  OfflineEpisodeSlot,
  buildOfflineEpisodeSlots,
  cleanDisplaySeriesTitle,
  formatSourceLabel,
  getCanonicalSeriesKey,
} from '../../utils/offlineHelpers';

type Props = NativeStackScreenProps<RootStackNavigator, 'OfflineVideoPlayer'>;

function formatDurationShort(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const mm = mins.toString().padStart(2, '0');
  const ss = rem.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function pickPreferredVariant(
  slot: OfflineEpisodeSlot,
  reference: OfflineAnimeItem,
): OfflineAnimeItem {
  if (slot.variants.length <= 1) return slot.primaryItem;
  const exactRes = slot.variants.find(
    v => v.resolution.toLowerCase() === (reference.resolution || '').toLowerCase(),
  );
  if (exactRes) return exactRes;
  const exactSource = slot.variants.find(
    v => (v.source || '').toLowerCase() === (reference.source || '').toLowerCase(),
  );
  return exactSource || slot.primaryItem;
}

function OfflineVideoPlayer({ route, navigation }: Props) {
  const { item } = route.params;
  const playerRef = useRef<PlayerRef>(null);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [offlineList, setOfflineList] = useState<OfflineAnimeItem[]>(() =>
    offlineDownloadManager.getOfflineAnimeList(),
  );
  const [currentItem, setCurrentItem] = useState<OfflineAnimeItem>(item);
  const [streamUri, setStreamUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastPositionRef = useRef<number>(item.lastPositionSeconds || 0);

  useEffect(() => {
    return offlineDownloadManager.subscribeList(list => {
      setOfflineList([...list]);
    });
  }, []);

  const seriesKey = useMemo(
    () => getCanonicalSeriesKey(currentItem.animeTitle),
    [currentItem.animeTitle],
  );

  const displaySeriesTitle = useMemo(
    () => cleanDisplaySeriesTitle(currentItem.animeTitle),
    [currentItem.animeTitle],
  );

  const seriesItems = useMemo(() => {
    return offlineList.filter(x => getCanonicalSeriesKey(x.animeTitle) === seriesKey);
  }, [offlineList, seriesKey]);

  const episodeSlots = useMemo(() => {
    return buildOfflineEpisodeSlots(seriesItems);
  }, [seriesItems]);

  const currentSlotIndex = useMemo(() => {
    return episodeSlots.findIndex(slot =>
      slot.variants.some(v => v.id === currentItem.id),
    );
  }, [episodeSlots, currentItem.id]);

  const currentSlot =
    currentSlotIndex >= 0 ? episodeSlots[currentSlotIndex] : undefined;
  const prevSlot =
    currentSlotIndex > 0 ? episodeSlots[currentSlotIndex - 1] : undefined;
  const nextSlot =
    currentSlotIndex !== -1 && currentSlotIndex < episodeSlots.length - 1
      ? episodeSlots[currentSlotIndex + 1]
      : undefined;

  const uniqueSources = useMemo(() => {
    const set = new Set<string>();
    seriesItems.forEach(s => {
      if (s.source) set.add(formatSourceLabel(s.source));
    });
    return Array.from(set);
  }, [seriesItems]);

  const flushCurrentProgress = useCallback(() => {
    offlineDownloadManager.updateOfflineProgress(
      currentItem.id,
      lastPositionRef.current,
      true,
    );
  }, [currentItem.id]);

  const switchToItem = useCallback(
    (target: OfflineAnimeItem) => {
      if (target.id === currentItem.id) return;
      flushCurrentProgress();
      lastPositionRef.current = target.lastPositionSeconds || 0;
      setCurrentItem(target);
    },
    [currentItem.id, flushCurrentProgress],
  );

  useEffect(() => {
    Orientation.unlockAllOrientations();
    return () => {
      flushCurrentProgress();
      Orientation.lockToPortrait();
      StatusBar.setHidden(false);
      SystemBars.setHidden(false);
      SystemNavigationBar.navigationShow();
      SystemNavigationBar.fullScreen(false);
    };
  }, [flushCurrentProgress]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setStreamUri(null);

    offlineDownloadManager
      .preparePlayback(currentItem)
      .then(playablePath => {
        if (!isCancelled) {
          setStreamUri(
            playablePath.startsWith('file://')
              ? playablePath
              : `file://${playablePath}`,
          );
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          const msg = err?.message || t('offline.loadFailed');
          setLoadError(msg);
          setIsLoading(false);
          ToastAndroid.show(msg, ToastAndroid.LONG);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentItem, t]);

  const handleFullscreenUpdate = useCallback((full: boolean) => {
    setIsFullscreen(full);
    if (full) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true);
      SystemBars.setHidden(true);
      SystemNavigationBar.navigationHide();
      SystemNavigationBar.stickyImmersive(true);
      SystemNavigationBar.fullScreen(true);
    } else {
      Orientation.lockToPortrait();
      StatusBar.setHidden(false);
      SystemBars.setHidden(false);
      SystemNavigationBar.navigationShow();
      SystemNavigationBar.fullScreen(false);
    }
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) {
        handleFullscreenUpdate(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isFullscreen, handleFullscreenUpdate]);

  const handleDurationChange = useCallback(
    (positionSec: number) => {
      lastPositionRef.current = positionSec;
      offlineDownloadManager.updateOfflineProgress(currentItem.id, positionSec);
    },
    [currentItem.id],
  );

  const handleLoad = useCallback(() => {
    if (currentItem.lastPositionSeconds && currentItem.lastPositionSeconds > 5) {
      playerRef.current?.skipTo(currentItem.lastPositionSeconds);
    }
  }, [currentItem.lastPositionSeconds]);

  const handlePrevEpisode = useCallback(() => {
    if (!prevSlot) return;
    switchToItem(pickPreferredVariant(prevSlot, currentItem));
  }, [prevSlot, currentItem, switchToItem]);

  const handleNextEpisode = useCallback(() => {
    if (!nextSlot) return;
    switchToItem(pickPreferredVariant(nextSlot, currentItem));
  }, [nextSlot, currentItem, switchToItem]);

  const handlePlaybackEnded = useCallback(() => {
    if (autoNext && nextSlot) {
      ToastAndroid.show(
        t('offline.autoPlayingNext', { label: nextSlot.displayLabel }),
        ToastAndroid.SHORT,
      );
      switchToItem(pickPreferredVariant(nextSlot, currentItem));
    }
  }, [autoNext, nextSlot, currentItem, switchToItem, t]);

  const handleDeleteCurrent = useCallback(() => {
    DialogManager.alert(
      t('offline.deleteTitle'),
      t('offline.deletePlayerDesc', {
        title: displaySeriesTitle,
        episode: currentItem.episodeTitle,
        resolution: currentItem.resolution,
      }),
      [
        { text: t('common.cancel'), onPress: () => {} },
        {
          text: t('common.delete'),
          onPress: async () => {
            const deletedId = currentItem.id;
            const remaining = seriesItems.filter(x => x.id !== deletedId);
            await offlineDownloadManager.deleteOfflineAnime(deletedId);
            if (remaining.length === 0) {
              navigation.goBack();
              return;
            }
            const nextSlots = buildOfflineEpisodeSlots(remaining);
            const fallback =
              nextSlot
                ? pickPreferredVariant(nextSlot, currentItem)
                : prevSlot
                ? pickPreferredVariant(prevSlot, currentItem)
                : nextSlots[0]?.primaryItem;
            if (fallback) {
              lastPositionRef.current = fallback.lastPositionSeconds || 0;
              setCurrentItem(fallback);
            } else {
              navigation.goBack();
            }
          },
        },
      ],
    );
  }, [currentItem, displaySeriesTitle, navigation, nextSlot, prevSlot, seriesItems, t]);

  const bgMain = isDark ? '#0f1014' : '#f8fafc';
  const cardBg = isDark ? '#181a20' : '#ffffff';
  const cardBorder = isDark ? '#262933' : '#e2e8f0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';

  return (
    <View style={[styles.container, { backgroundColor: bgMain }]}>
      <SystemBars hidden={isFullscreen} style="light" />
      <StatusBar hidden={isFullscreen} barStyle="light-content" />

      {!isFullscreen && (
        <View style={{ height: insets.top, backgroundColor: '#000' }} />
      )}

      {/* Video container never uses center alignment so child fills 100% cleanly without 0x0 collapse */}
      <View
        style={isFullscreen ? styles.fullscreenPlayer : styles.playerWrapper}>
        {streamUri ? (
          <VideoPlayer
            ref={playerRef}
            style={styles.videoPlayerFill}
            streamingURL={streamUri}
            title={`${displaySeriesTitle} - ${currentItem.episodeTitle} (${currentItem.resolution})`}
            thumbnailURL={currentItem.thumbnailUrl}
            onFullscreenUpdate={handleFullscreenUpdate}
            fullscreen={isFullscreen}
            onDurationChange={handleDurationChange}
            onLoad={handleLoad}
            onEnded={handlePlaybackEnded}
            showNextPrevButtons={episodeSlots.length > 1}
            disablePrevEp={!prevSlot}
            disableNextEp={!nextSlot}
            onPrevEp={handlePrevEpisode}
            onNextEp={handleNextEpisode}
          />
        ) : (
          <View style={styles.loadingOverlay}>
            {isLoading ? (
              <>
                <ActivityIndicator color="#3b82f6" size="large" />
                <Text style={styles.loadingText}>{t('offline.playerLoading')}</Text>
              </>
            ) : (
              <>
                <Icon name="alert-circle-outline" size={40} color="#ef4444" />
                <Text style={styles.errorVideoText}>
                  {loadError || t('offline.playerError')}
                </Text>
                <TouchableOpacity
                  onPress={handleDeleteCurrent}
                  style={styles.removeCorruptBtn}>
                  <Text style={styles.removeCorruptBtnText}>{t('offline.removeCorrupt')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {!isFullscreen && (
        <ScrollView
          style={{ flex: 1, backgroundColor: bgMain }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(32, insets.bottom + 20),
          }}
          showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={10}
              style={[
                styles.iconCircleBtn,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}>
              <Icon name="arrow-left" size={20} color={textPrimary} />
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text
                style={[styles.animeTitle, { color: textPrimary }]}
                numberOfLines={2}>
                {displaySeriesTitle}
              </Text>
              <Text style={[styles.episodeTitle, { color: textMuted }]} numberOfLines={1}>
                {currentItem.episodeTitle} • {currentItem.resolution} •{' '}
                {formatSourceLabel(currentItem.source)}
              </Text>
            </View>

            <View style={styles.offlineBadge}>
              <Icon
                name="cloud-off-outline"
                size={13}
                color="#10b981"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.offlineBadgeText}>{t('common.offline')}</Text>
            </View>
          </View>

          <View
            style={[
              styles.navStrip,
              { backgroundColor: cardBg, borderColor: cardBorder },
            ]}>
            <TouchableOpacity
              onPress={handlePrevEpisode}
              disabled={!prevSlot}
              style={[styles.navBtn, !prevSlot && styles.navBtnDisabled]}>
              <Icon
                name="skip-previous"
                size={18}
                color={prevSlot ? '#3b82f6' : textMuted}
              />
              <Text
                style={[
                  styles.navBtnText,
                  { color: prevSlot ? textPrimary : textMuted },
                ]}>
                {t('offline.prevShort')}
              </Text>
            </TouchableOpacity>

            <View style={styles.navCenterPill}>
              <Text style={styles.navCenterText}>
                {episodeSlots.length > 0 && currentSlotIndex >= 0
                  ? `${currentSlotIndex + 1} / ${episodeSlots.length}`
                  : '1 / 1'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleNextEpisode}
              disabled={!nextSlot}
              style={[styles.navBtn, !nextSlot && styles.navBtnDisabled]}>
              <Text
                style={[
                  styles.navBtnText,
                  { color: nextSlot ? textPrimary : textMuted },
                ]}>
                {t('offline.nextShort')}
              </Text>
              <Icon
                name="skip-next"
                size={18}
                color={nextSlot ? '#3b82f6' : textMuted}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.utilityRow}>
            <TouchableOpacity
              onPress={() => setAutoNext(v => !v)}
              activeOpacity={0.75}
              style={[
                styles.utilityChip,
                {
                  backgroundColor: autoNext
                    ? 'rgba(59, 130, 246, 0.14)'
                    : cardBg,
                  borderColor: autoNext ? '#3b82f6' : cardBorder,
                },
              ]}>
              <Icon
                name={autoNext ? 'playlist-play' : 'playlist-remove'}
                size={16}
                color={autoNext ? '#3b82f6' : textMuted}
              />
              <Text
                style={[
                  styles.utilityChipText,
                  { color: autoNext ? '#3b82f6' : textMuted },
                ]}>
                {t('offline.autoNext', { state: autoNext ? t('offline.on') : t('offline.off') })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeleteCurrent}
              activeOpacity={0.75}
              style={[
                styles.utilityChip,
                {
                  backgroundColor: isDark
                    ? 'rgba(239, 68, 68, 0.12)'
                    : '#fef2f2',
                  borderColor: isDark ? '#7f1d1d' : '#fecaca',
                },
              ]}>
              <Icon name="delete-outline" size={16} color="#ef4444" />
              <Text style={[styles.utilityChipText, { color: '#ef4444' }]}>
                {t('offline.deleteFile')}
              </Text>
            </TouchableOpacity>
          </View>

          {currentSlot && currentSlot.variants.length > 1 && (
            <View
              style={[
                styles.versionBox,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}>
              <Text style={[styles.versionHeader, { color: textMuted }]}>
                {t('offline.versionsForEp', { count: currentSlot.variants.length })}
              </Text>
              <View style={styles.versionChipsWrap}>
                {currentSlot.variants.map(variant => {
                  const selected = variant.id === currentItem.id;
                  return (
                    <TouchableOpacity
                      key={variant.id}
                      onPress={() => switchToItem(variant)}
                      style={[
                        styles.versionChip,
                        {
                          backgroundColor: selected
                            ? '#3b82f6'
                            : isDark
                            ? '#242731'
                            : '#f1f5f9',
                          borderColor: selected ? '#2563eb' : cardBorder,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.versionChipText,
                          { color: selected ? '#ffffff' : textPrimary },
                        ]}>
                        {variant.resolution} • {formatSourceLabel(variant.source)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View
            style={[
              styles.metaBox,
              { backgroundColor: cardBg, borderColor: cardBorder },
            ]}>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: textMuted }]}>{t('offline.size')}</Text>
              <Text style={[styles.metaValue, { color: textPrimary }]}>
                {offlineDownloadManager.formatBytes(currentItem.fileSize)}
              </Text>
            </View>
            <View style={[styles.metaDivider, { backgroundColor: cardBorder }]} />
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: textMuted }]}>{t('offline.resolution')}</Text>
              <Text style={[styles.metaValue, { color: '#10b981' }]}>
                {currentItem.resolution}
              </Text>
            </View>
            <View style={[styles.metaDivider, { backgroundColor: cardBorder }]} />
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: textMuted }]}>{t('offline.source')}</Text>
              <Text style={[styles.metaValue, { color: textPrimary }]}>
                {formatSourceLabel(currentItem.source)}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            <View style={styles.playlistHeaderRow}>
              <Text style={[styles.playlistTitle, { color: textPrimary }]}>
                {t('offline.downloadedEpisodesList', { count: episodeSlots.length })}
              </Text>
              {uniqueSources.length > 1 && (
                <Text style={[styles.mixedSourceHint, { color: textMuted }]}>
                  {t('offline.combinedSources', { sources: uniqueSources.join(', ') })}
                </Text>
              )}
            </View>

            {episodeSlots.map((slot, index) => {
              const isPlayingSlot = slot.variants.some(
                v => v.id === currentItem.id,
              );
              const displayedItem = isPlayingSlot
                ? currentItem
                : pickPreferredVariant(slot, currentItem);
              const resumeSec = displayedItem.lastPositionSeconds || 0;

              return (
                <View
                  key={slot.slotKey}
                  style={[
                    styles.playlistCard,
                    {
                      backgroundColor: isPlayingSlot
                        ? isDark
                          ? 'rgba(59, 130, 246, 0.14)'
                          : '#eff6ff'
                        : cardBg,
                      borderColor: isPlayingSlot ? '#3b82f6' : cardBorder,
                    },
                  ]}>
                  <TouchableOpacity
                    onPress={() => switchToItem(displayedItem)}
                    activeOpacity={0.75}
                    style={styles.playlistMainRow}>
                    <View
                      style={[
                        styles.slotIndexBadge,
                        {
                          backgroundColor: isPlayingSlot
                            ? '#3b82f6'
                            : isDark
                            ? '#252834'
                            : '#e2e8f0',
                        },
                      ]}>
                      <Icon
                        name={isPlayingSlot ? 'play' : 'check'}
                        size={14}
                        color={isPlayingSlot ? '#ffffff' : textMuted}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.playlistItemTitle,
                          {
                            color: isPlayingSlot ? '#3b82f6' : textPrimary,
                            fontWeight: isPlayingSlot ? '700' : '600',
                          },
                        ]}
                        numberOfLines={1}>
                        {slot.displayLabel}
                      </Text>

                      <View style={styles.playlistMetaRow}>
                        <View style={styles.smallResPill}>
                          <Text style={styles.smallResPillText}>
                            {displayedItem.resolution}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.smallSourcePill,
                            {
                              backgroundColor: isDark ? '#252834' : '#f1f5f9',
                            },
                          ]}>
                          <Text
                            style={[
                              styles.smallSourcePillText,
                              { color: textMuted },
                            ]}>
                            {formatSourceLabel(displayedItem.source)}
                          </Text>
                        </View>
                        <Text style={[styles.slotMetaSize, { color: textMuted }]}>
                          {offlineDownloadManager.formatBytes(
                            displayedItem.fileSize,
                          )}
                        </Text>
                        {resumeSec > 5 && (
                          <Text style={styles.slotResumeText}>
                            {t('offline.resumeAt', { time: formatDurationShort(resumeSec) })}
                          </Text>
                        )}
                      </View>
                    </View>

                    <Text style={[styles.slotSeqLabel, { color: textMuted }]}>
                      #{index + 1}
                    </Text>
                  </TouchableOpacity>

                  {slot.variants.length > 1 && (
                    <View style={styles.variantMiniRow}>
                      {slot.variants.map(v => {
                        const activeVariant = v.id === currentItem.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            onPress={() => switchToItem(v)}
                            style={[
                              styles.variantMiniPill,
                              {
                                backgroundColor: activeVariant
                                  ? '#3b82f6'
                                  : isDark
                                  ? '#252834'
                                  : '#f1f5f9',
                              },
                            ]}>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: activeVariant ? '#ffffff' : textMuted,
                              }}>
                              {v.resolution} ({formatSourceLabel(v.source)})
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoPlayerFill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  fullscreenPlayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#93c5fd',
    fontSize: 12,
    marginTop: 10,
    fontWeight: '600',
  },
  errorVideoText: {
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  removeCorruptBtn: {
    marginTop: 12,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  removeCorruptBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animeTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  episodeTitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  offlineBadgeText: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 11,
  },
  navStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 14,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  navBtnDisabled: {
    opacity: 0.45,
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  navCenterPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  navCenterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  utilityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  utilityChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  versionHeader: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  versionChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  versionChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  versionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  metaItem: {
    alignItems: 'center',
    flex: 1,
  },
  metaDivider: {
    width: 1,
    height: 26,
  },
  metaLabel: {
    fontSize: 11,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  playlistHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  playlistTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  mixedSourceHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  playlistCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  playlistMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  slotIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  playlistItemTitle: {
    fontSize: 13,
  },
  playlistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  smallResPill: {
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  smallResPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  smallSourcePill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  smallSourcePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  slotMetaSize: {
    fontSize: 11,
  },
  slotResumeText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
  },
  slotSeqLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  variantMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  variantMiniPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});

export default memo(OfflineVideoPlayer);
