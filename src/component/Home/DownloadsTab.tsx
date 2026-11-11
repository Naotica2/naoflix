import Icon from '@react-native-vector-icons/material-design-icons';
import { NavigationProp, StackActions, useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import moment from 'moment';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import useGlobalStyles from '../../assets/style';
import { useLanguage } from '../../misc/LanguageContext';
import { RootStackNavigator } from '../../types/navigation';
import { ActiveDownloadItem, OfflineAnimeItem } from '../../types/offlineAnime';
import DialogManager from '../../utils/dialogManager';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import {
  OfflineAnimeGroup,
  formatSourceLabel,
  groupOfflineAnimeSeries,
} from '../../utils/offlineHelpers';
import ImageLoading from '../misc/ImageLoading';

function formatSeconds(seconds: number) {
  const duration = moment.duration(seconds, 'seconds');
  const m = duration.minutes().toString().padStart(2, '0');
  const s = duration.seconds().toString().padStart(2, '0');
  if (duration.hours() > 0) {
    return `${duration.hours()}:${m}:${s}`;
  }
  return `${m}:${s}`;
}

function DownloadsTab() {
  const globalStyles = useGlobalStyles();
  const navigation = useNavigation<NavigationProp<RootStackNavigator>>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  const [offlineList, setOfflineList] = useState<OfflineAnimeItem[]>(() =>
    offlineDownloadManager.getOfflineAnimeList(),
  );
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubList = offlineDownloadManager.subscribeList(list => {
      setOfflineList([...list]);
    });
    const unsubProgress = offlineDownloadManager.subscribeProgress(activeMap => {
      setActiveDownloads(Array.from(activeMap.values()));
    });
    return () => {
      unsubList();
      unsubProgress();
    };
  }, []);

  const downloadingItems = useMemo(
    () => activeDownloads.filter(d => d.status === 'downloading'),
    [activeDownloads],
  );
  const pausedItems = useMemo(
    () => activeDownloads.filter(d => d.status === 'paused'),
    [activeDownloads],
  );

  const totalBytes = useMemo(
    () => offlineList.reduce((acc, curr) => acc + (curr.fileSize || 0), 0),
    [offlineList],
  );

  const groupedAnime = useMemo(() => {
    return groupOfflineAnimeSeries(offlineList);
  }, [offlineList]);

  const totalUniqueEpisodes = useMemo(
    () => groupedAnime.reduce((sum, g) => sum + g.slots.length, 0),
    [groupedAnime],
  );

  const toggleExpand = useCallback((canonicalKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [canonicalKey]: prev[canonicalKey] === false,
    }));
  }, []);

  const handlePlay = useCallback(
    (item: OfflineAnimeItem) => {
      navigation.dispatch(
        StackActions.push('OfflineVideoPlayer', { item }),
      );
    },
    [navigation],
  );

  const handleDeleteEpisode = useCallback(
    (item: OfflineAnimeItem) => {
      DialogManager.alert(
        t('offline.deleteTitle'),
        t('offline.deleteDesc', {
          title: item.animeTitle,
          episode: `${item.episodeTitle} (${item.resolution})`,
        }),
        [
          { text: t('common.cancel'), onPress: () => {} },
          {
            text: t('common.delete'),
            onPress: () => offlineDownloadManager.deleteOfflineAnime(item.id),
          },
        ],
      );
    },
    [t],
  );

  const handleDeleteGroup = useCallback(
    (group: OfflineAnimeGroup) => {
      DialogManager.alert(
        t('offline.deleteAnimeTitle'),
        t('offline.deleteAnimeDesc', {
          fileCount: group.items.length,
          epCount: group.slots.length,
          title: group.animeTitle,
        }),
        [
          { text: t('common.cancel'), onPress: () => {} },
          {
            text: t('offline.deleteAllBtn'),
            onPress: async () => {
              for (const ep of group.items) {
                await offlineDownloadManager.deleteOfflineAnime(ep.id);
              }
            },
          },
        ],
      );
    },
    [t],
  );

  const handleDeleteAll = useCallback(() => {
    DialogManager.alert(
      t('offline.deleteAllTitle'),
      t('offline.deleteAllDesc', { count: offlineList.length + activeDownloads.length }),
      [
        { text: t('common.cancel'), onPress: () => {} },
        {
          text: t('offline.deleteAllBtn'),
          onPress: () => offlineDownloadManager.deleteAllOfflineAnime(),
        },
      ],
    );
  }, [t, offlineList.length, activeDownloads.length]);

  const handleCancelDownload = useCallback(
    (item: ActiveDownloadItem) => {
      DialogManager.alert(
        t('offline.cancelDownloadTitle'),
        t('offline.cancelDownloadDesc', {
          title: item.animeTitle,
          episode: item.episodeTitle,
        }),
        [
          { text: t('common.no'), onPress: () => {} },
          {
            text: t('common.yes'),
            onPress: () => offlineDownloadManager.cancelDownload(item.id),
          },
        ],
      );
    },
    [t],
  );

  const renderDownloadCard = useCallback(
    (item: ActiveDownloadItem) => {
      const receivedFormatted = offlineDownloadManager.formatBytes(item.receivedBytes);
      const totalFormatted = offlineDownloadManager.formatBytes(item.totalBytes);
      const isPaused = item.status === 'paused';
      const isNetworkPaused = isPaused && item.pauseReason === 'network';

      const statusText = isPaused
        ? isNetworkPaused
          ? t('offline.statusPausedNetwork', { percent: item.progressPercent })
          : t('offline.statusPausedManual', { percent: item.progressPercent })
        : t('offline.statusDownloading', { percent: item.progressPercent });

      return (
        <View
          key={item.id}
          style={[
            styles.activeCard,
            {
              backgroundColor: isPaused
                ? isDark
                  ? '#241e12'
                  : '#fffbeb'
                : isDark
                  ? '#1a2234'
                  : '#eff6ff',
              borderColor: isPaused
                ? isDark
                  ? '#d97706'
                  : '#fcd34d'
                : isDark
                  ? '#2563eb'
                  : '#bfdbfe',
            },
          ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ImageLoading
              source={{ uri: item.thumbnailUrl }}
              style={styles.activeThumb}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={[
                  styles.activeTitle,
                  {
                    color: isPaused
                      ? isDark
                        ? '#fef3c7'
                        : '#92400e'
                      : isDark
                        ? '#ffffff'
                        : '#1e3a8a',
                  },
                ]}
                numberOfLines={1}>
                {item.animeTitle}
              </Text>
              <Text
                style={[
                  styles.activeSubtitle,
                  {
                    color: isPaused
                      ? isDark
                        ? '#fcd34d'
                        : '#b45309'
                      : isDark
                        ? '#93c5fd'
                        : '#3b82f6',
                  },
                ]}
                numberOfLines={1}>
                {item.episodeTitle} • {item.resolution} • {formatSourceLabel(item.source)}
              </Text>
              <View
                style={[
                  styles.progressBarWrapper,
                  {
                    backgroundColor: isPaused
                      ? 'rgba(245, 158, 11, 0.22)'
                      : 'rgba(59, 130, 246, 0.2)',
                  },
                ]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.max(4, item.progressPercent)}%`,
                      backgroundColor: isPaused ? '#f59e0b' : '#3b82f6',
                    },
                  ]}
                />
              </View>
              <View style={styles.progressInfoRow}>
                <Text
                  style={[
                    styles.progressPercentText,
                    { color: isPaused ? '#f59e0b' : '#3b82f6' },
                  ]}>
                  {statusText}
                </Text>
                <Text style={styles.progressBytesText}>
                  {receivedFormatted} / {item.totalBytes > 0 ? totalFormatted : '...'}
                </Text>
              </View>
            </View>

            <View style={styles.downloadControlsRow}>
              <TouchableOpacity
                onPress={() =>
                  isPaused
                    ? offlineDownloadManager.resumeDownload(item.id)
                    : offlineDownloadManager.pauseDownload(item.id, 'manual')
                }
                hitSlop={8}
                style={[
                  styles.pauseResumeBtn,
                  {
                    backgroundColor: isPaused
                      ? 'rgba(16, 185, 129, 0.16)'
                      : 'rgba(245, 158, 11, 0.16)',
                  },
                ]}>
                <Icon
                  name={isPaused ? 'play' : 'pause'}
                  size={18}
                  color={isPaused ? '#10b981' : '#f59e0b'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCancelDownload(item)}
                hitSlop={8}
                style={styles.cancelButton}>
                <Icon name="close" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [handleCancelDownload, isDark, t],
  );

  const renderAnimeGroup = useCallback(
    ({ item: group }: { item: OfflineAnimeGroup }) => {
      const isExpanded = expandedGroups[group.canonicalKey] !== false;
      const playTarget = group.lastPositionEp || group.slots[0]?.primaryItem;

      return (
        <View
          style={[
            styles.groupCard,
            {
              backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
              borderColor: isDark ? '#2a2a2a' : '#e5e7eb',
            },
          ]}>
          <TouchableOpacity
            style={styles.groupHeaderRow}
            activeOpacity={0.8}
            onPress={() => toggleExpand(group.canonicalKey)}>
            <View style={styles.groupThumbWrapper}>
              <ImageLoading source={{ uri: group.thumbnailUrl }} style={styles.groupThumb} />
              <View style={styles.epCountBadge}>
                <Text style={styles.epCountText}>{group.slots.length} Eps</Text>
              </View>
            </View>

            <View style={styles.groupHeaderInfo}>
              <Text style={[globalStyles.text, styles.groupAnimeTitle]} numberOfLines={2}>
                {group.animeTitle}
              </Text>

              <View style={styles.groupMetaRow}>
                {group.sources.map(src => (
                  <View key={src} style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>
                      {formatSourceLabel(src)}
                    </Text>
                  </View>
                ))}
                <Text style={styles.groupTotalSizeText}>
                  {offlineDownloadManager.formatBytes(group.totalSize)}
                </Text>
              </View>

              {group.lastPositionEp?.lastPositionSeconds &&
              group.lastPositionEp.lastPositionSeconds > 5 ? (
                <View style={styles.resumeInfoRow}>
                  <Icon
                    name="clock-outline"
                    size={12}
                    color="#3b82f6"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.resumeInfoText} numberOfLines={1}>
                    {t('offline.resumeAt', {
                      time: `${group.lastPositionEp.episodeTitle} (${formatSeconds(group.lastPositionEp.lastPositionSeconds)})`,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.groupActions}>
              <TouchableOpacity
                onPress={() => playTarget && handlePlay(playTarget)}
                style={styles.playMainBtn}
                hitSlop={6}>
                <Icon name="play" size={20} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleDeleteGroup(group)}
                style={styles.deleteGroupBtn}
                hitSlop={6}>
                <Icon name="delete-outline" size={20} color="#ff4d4d" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleExpand(group.canonicalKey)}
                style={styles.expandChevronBtn}
                hitSlop={6}>
                <Icon
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={isDark ? '#9ca3af' : '#6b7280'}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* Episodes grouped per unique slot with multi-resolution and multi-source support */}
          {isExpanded && (
            <View
              style={[
                styles.episodesListContainer,
                { borderTopColor: isDark ? '#262626' : '#f1f5f9' },
              ]}>
              {group.slots.map(slot => {
                return (
                  <View key={slot.slotKey} style={styles.slotGroupWrap}>
                    {slot.variants.map((ep, vIdx) => {
                      const isResume =
                        ep.lastPositionSeconds && ep.lastPositionSeconds > 5;
                      const showSlotTitle = vIdx === 0;
                      return (
                        <TouchableOpacity
                          key={ep.id}
                          onPress={() => handlePlay(ep)}
                          style={[
                            styles.episodeRow,
                            {
                              backgroundColor: isDark ? '#202020' : '#f8fafc',
                              borderColor: isDark ? '#2b2b2b' : '#e2e8f0',
                            },
                          ]}>
                          <View style={styles.epPlayIconWrapper}>
                            <Icon
                              name="play-circle-outline"
                              size={20}
                              color="#3b82f6"
                            />
                          </View>

                          <View style={styles.epDetailWrapper}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                              <Text
                                style={[
                                  styles.epTitleText,
                                  { color: isDark ? '#f3f4f6' : '#1e293b' },
                                ]}
                                numberOfLines={1}>
                                {showSlotTitle
                                  ? slot.displayLabel
                                  : t('offline.otherVersion', { label: slot.displayLabel })}
                              </Text>
                              <View style={styles.resPill}>
                                <Text style={styles.resPillText}>{ep.resolution}</Text>
                              </View>
                              <View
                                style={[
                                  styles.epSourcePill,
                                  {
                                    backgroundColor: isDark
                                      ? '#2c3140'
                                      : '#e2e8f0',
                                  },
                                ]}>
                                <Text
                                  style={[
                                    styles.epSourcePillText,
                                    { color: isDark ? '#cbd5e1' : '#334155' },
                                  ]}>
                                  {formatSourceLabel(ep.source)}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginTop: 3,
                              }}>
                              <Text style={styles.epSizeText}>
                                {offlineDownloadManager.formatBytes(ep.fileSize)}
                              </Text>
                              {isResume && (
                                <>
                                  <Text style={styles.epDot}>•</Text>
                                  <Text style={styles.epResumeText}>
                                    {t('offline.resumeAt', { time: formatSeconds(ep.lastPositionSeconds!) })}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={() => handleDeleteEpisode(ep)}
                            hitSlop={8}
                            style={styles.epDeleteBtn}>
                            <Icon name="close" size={17} color="#ef4444" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      );
    },
    [
      expandedGroups,
      globalStyles.text,
      handleDeleteEpisode,
      handleDeleteGroup,
      handlePlay,
      isDark,
      t,
      toggleExpand,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      {(groupedAnime.length > 0 || activeDownloads.length > 0) && (
        <View style={styles.storageHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Icon
              name="cellphone-check"
              size={18}
              color="#10b981"
              style={{ marginRight: 6 }}
            />
            <Text style={[globalStyles.text, { fontSize: 13 }]}>
              {t('offline.storageSummary', {
                animeCount: groupedAnime.length,
                epCount: totalUniqueEpisodes,
                size: offlineDownloadManager.formatBytes(totalBytes),
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={handleDeleteAll} hitSlop={6}>
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>
              {t('offline.deleteAllBtn')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {downloadingItems.length > 0 && (
        <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
          <Text style={[globalStyles.text, styles.activeHeaderTitle]}>
            {t('offline.activeDownloads', { count: downloadingItems.length })}
          </Text>
          {downloadingItems.map(renderDownloadCard)}
        </View>
      )}

      {pausedItems.length > 0 && (
        <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
          <Text style={[globalStyles.text, styles.pausedHeaderTitle]}>
            {t('offline.pausedDownloads', { count: pausedItems.length })}
          </Text>
          {pausedItems.map(renderDownloadCard)}
        </View>
      )}

      {groupedAnime.length === 0 && activeDownloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="cloud-download-outline" size={64} color="#888" />
          <Text style={[globalStyles.text, styles.emptyTitle]}>
            {t('offline.emptyTitle')}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t('offline.emptyDesc')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={groupedAnime}
          renderItem={renderAnimeGroup}
          keyExtractor={group => group.canonicalKey}
          extraData={{ expandedGroups, isDark, t }}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activeHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 6,
  },
  pausedHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f59e0b',
    marginBottom: 6,
  },
  activeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  activeThumb: {
    width: 50,
    height: 70,
    borderRadius: 6,
  },
  activeTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  progressBarWrapper: {
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressPercentText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressBytesText: {
    fontSize: 10,
    color: '#888',
  },
  downloadControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  pauseResumeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupCard: {
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeaderRow: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  groupThumbWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  groupThumb: {
    width: 65,
    height: 90,
    borderRadius: 8,
  },
  epCountBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  epCountText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  groupHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  groupAnimeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  groupMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  sourceBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3b82f6',
  },
  groupTotalSizeText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  resumeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  resumeInfoText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  playMainBtn: {
    backgroundColor: '#3b82f6',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteGroupBtn: {
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandChevronBtn: {
    padding: 4,
  },
  episodesListContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  slotGroupWrap: {
    gap: 4,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  epPlayIconWrapper: {
    marginRight: 8,
  },
  epDetailWrapper: {
    flex: 1,
  },
  epTitleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resPill: {
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  resPillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  epSourcePill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  epSourcePillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  epSizeText: {
    fontSize: 11,
    color: '#888',
  },
  epDot: {
    marginHorizontal: 4,
    color: '#888',
    fontSize: 11,
  },
  epResumeText: {
    fontSize: 11,
    color: '#3b82f6',
    fontWeight: '600',
  },
  epDeleteBtn: {
    padding: 4,
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default memo(DownloadsTab);
