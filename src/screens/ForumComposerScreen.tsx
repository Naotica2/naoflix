import MaterialIcons from '@react-native-vector-icons/material-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ForumImage from '../component/Forum/ForumImage';
import ForumMediaPickerModal from '../component/Forum/ForumMediaPickerModal';
import { useAuth } from '../misc/AuthContext';
import { useLanguage } from '../misc/LanguageContext';
import { useLevel } from '../misc/LevelContext';
import {
  ForumCategory,
  ForumLinkedMedia,
  ForumMediaItem,
  ForumPostType,
  getDirectMediaUrlFromLink,
  isGifUrl,
  needsExternalMediaResolve,
  UploadQuotaInfo,
} from '../types/forum';
import { RootStackNavigator } from '../types/navigation';
import {
  createForumPost,
  parseFriendlyForumError,
  peekResolvedExternalMediaUrl,
  resolveExternalMediaUrl,
} from '../utils/forumApi';
import {
  compressForumImage,
  formatBytesShort,
  getDailyUploadQuota,
  MAX_FORUM_IMAGES_PER_POST,
  pickForumImages,
  PreparedForumImage,
  uploadForumImages,
} from '../utils/forumMediaStorage';
import { awardForumExpWithCap } from '../utils/LevelSystem';

type Props = NativeStackScreenProps<RootStackNavigator, 'ForumComposer'>;

const COMPOSER_MODES: { key: ForumPostType; labelKey: string; icon: string }[] = [
  { key: 'text', labelKey: 'forumFeed.modeText', icon: 'notes' },
  { key: 'image', labelKey: 'forumFeed.modeImage', icon: 'photo-library' },
  { key: 'poll', labelKey: 'forumFeed.modePoll', icon: 'poll' },
  { key: 'link', labelKey: 'forumFeed.modeLink', icon: 'link' },
  { key: 'nobar', labelKey: 'forumFeed.modeNobar', icon: 'live-tv' },
];

const CATEGORIES: { key: ForumCategory; labelKey: string; color: string }[] = [
  { key: 'general', labelKey: 'forumFeed.catGeneral', color: '#64748b' },
  { key: 'anime', labelKey: 'forumFeed.catAnime', color: '#3b82f6' },
  { key: 'film', labelKey: 'forumFeed.catFilm', color: '#10b981' },
  { key: 'comics', labelKey: 'forumFeed.catComics', color: '#f59e0b' },
  { key: 'review', labelKey: 'forumFeed.catReview', color: '#eab308' },
  { key: 'nobar', labelKey: 'forumFeed.catNobar', color: '#6366f1' },
];

const POLL_DURATIONS = [1, 3, 7] as const;

function ForumComposerScreen({ navigation, route }: Props) {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const { addExp } = useLevel();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const initialNobarId = route.params?.nobarRoomId || '';
  const initialNobarTitle = route.params?.nobarTitle || '';

  const [mode, setMode] = useState<ForumPostType>(initialNobarId ? 'nobar' : 'text');
  const [category, setCategory] = useState<ForumCategory>(
    route.params?.defaultCategory || (initialNobarId ? 'nobar' : 'general'),
  );
  const [title, setTitle] = useState(() =>
    initialNobarId
      ? t('forumFeed.nobarPromoteDefaultTitle', {
          title: initialNobarTitle || 'NaoFlix',
          roomId: initialNobarId,
        })
      : '',
  );
  const [body, setBody] = useState('');
  const [linkedMedia, setLinkedMedia] = useState<ForumLinkedMedia | null>(
    route.params?.linkedMedia || null,
  );
  const [episodeTag, setEpisodeTag] = useState(route.params?.linkedMedia?.episode_label || '');
  const [rating, setRating] = useState<number | null>(null);

  const [images, setImages] = useState<PreparedForumImage[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [quota, setQuota] = useState<UploadQuotaInfo | null>(null);
  const [oversizePrompt, setOversizePrompt] = useState<{
    index: number;
    image: PreparedForumImage;
  } | null>(null);

  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDays, setPollDays] = useState<number>(3);
  const [externalLink, setExternalLink] = useState('');
  const [resolvedPreviewEntry, setResolvedPreviewEntry] = useState<{
    link: string;
    url: string | null;
  } | null>(null);
  const [resolvingPreviewLink, setResolvingPreviewLink] = useState<string | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [nobarRoomId, setNobarRoomId] = useState(initialNobarId);

  const [isSpoiler, setIsSpoiler] = useState(false);
  const [spoilerLabel, setSpoilerLabel] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !profile) {
      navigation.replace(user ? 'UsernameSetupScreen' : 'LoginScreen');
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      getDailyUploadQuota()
        .then(q => {
          if (!cancelled) setQuota(q);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [navigation, profile, user]);

  const trimmedExternalLink = externalLink.trim();
  const directPreviewUrl = getDirectMediaUrlFromLink(trimmedExternalLink);
  const needsAsyncPreview = Boolean(
    mode === 'link' &&
    trimmedExternalLink &&
    !directPreviewUrl &&
    needsExternalMediaResolve(trimmedExternalLink),
  );
  const cachedAsyncPreviewUrl = needsAsyncPreview
    ? peekResolvedExternalMediaUrl(trimmedExternalLink)
    : undefined;

  useEffect(() => {
    if (!needsAsyncPreview || cachedAsyncPreviewUrl !== undefined) {
      return;
    }
    let cancelled = false;
    const targetLink = trimmedExternalLink;
    const timer = setTimeout(() => {
      setResolvingPreviewLink(targetLink);
      resolveExternalMediaUrl(targetLink)
        .then(url => {
          if (!cancelled) {
            setResolvedPreviewEntry({ link: targetLink, url });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResolvedPreviewEntry({ link: targetLink, url: null });
          }
        })
        .finally(() => {
          setResolvingPreviewLink(cur => (cur === targetLink ? null : cur));
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cachedAsyncPreviewUrl, needsAsyncPreview, trimmedExternalLink]);

  const isResolvingPreview = resolvingPreviewLink === trimmedExternalLink;

  const previewMediaUrl =
    directPreviewUrl ||
    (needsAsyncPreview
      ? cachedAsyncPreviewUrl !== undefined
        ? cachedAsyncPreviewUrl
        : resolvedPreviewEntry?.link === trimmedExternalLink
          ? resolvedPreviewEntry.url
          : null
      : null);
  const showComposerMediaPreview = Boolean(previewMediaUrl && failedPreviewUrl !== previewMediaUrl);
  const isComposerPreviewGif = Boolean(
    previewMediaUrl && (isGifUrl(previewMediaUrl) || isGifUrl(trimmedExternalLink)),
  );

  const handlePickImages = useCallback(async () => {
    const remainingSlots = MAX_FORUM_IMAGES_PER_POST - images.length;
    if (remainingSlots <= 0) return;

    try {
      const picked = await pickForumImages(remainingSlots);
      if (picked.length === 0) return;

      setProcessingImages(true);
      const nextPrepared: PreparedForumImage[] = [];
      let firstOversized: { offset: number; image: PreparedForumImage } | null = null;

      for (let i = 0; i < picked.length; i++) {
        const compressed = await compressForumImage(picked[i], false);
        if (compressed.exceedsLimit && !firstOversized) {
          firstOversized = { offset: images.length + nextPrepared.length, image: compressed };
        }
        nextPrepared.push(compressed);
      }

      setImages(prev => [...prev, ...nextPrepared].slice(0, MAX_FORUM_IMAGES_PER_POST));
      if (firstOversized) {
        setOversizePrompt({
          index: firstOversized.offset,
          image: firstOversized.image,
        });
      }
    } catch (err: any) {
      if (err?.message === 'PERMISSION_DENIED') {
        ToastAndroid.show(t('downloadAnime.permissionDeniedDesc'), ToastAndroid.SHORT);
      } else {
        ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
      }
    } finally {
      setProcessingImages(false);
    }
  }, [images.length, t]);

  const handleConvertStaticWebp = useCallback(async () => {
    if (!oversizePrompt) return;
    const { index, image } = oversizePrompt;
    setOversizePrompt(null);
    setProcessingImages(true);
    try {
      const staticConverted = await compressForumImage(
        {
          uri: image.originalUri,
          fileName: image.fileName,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          sizeBytes: image.originalBytes,
        },
        true,
      );
      if (staticConverted.exceedsLimit) {
        ToastAndroid.show(t('forumFeed.overSizeTitle'), ToastAndroid.SHORT);
        setOversizePrompt({ index, image: staticConverted });
        return;
      }
      setImages(prev => prev.map((it, i) => (i === index ? staticConverted : it)));
    } catch (err) {
      ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
    } finally {
      setProcessingImages(false);
    }
  }, [oversizePrompt, t]);

  const handleSwitchToExternalUrl = useCallback(() => {
    if (!oversizePrompt) return;
    const { index } = oversizePrompt;
    setOversizePrompt(null);
    setImages(prev => prev.filter((_, i) => i !== index));
    setMode('link');
  }, [oversizePrompt]);

  const handleRemoveImage = useCallback((idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handlePublish = useCallback(async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      ToastAndroid.show(t('forumFeed.titlePlaceholder'), ToastAndroid.SHORT);
      return;
    }

    if (mode === 'image' && images.length === 0) {
      ToastAndroid.show(
        t('forumFeed.pickImagesBtn', { max: MAX_FORUM_IMAGES_PER_POST }),
        ToastAndroid.SHORT,
      );
      return;
    }

    const badImgIndex = images.findIndex(img => img.exceedsLimit);
    if (badImgIndex >= 0) {
      setOversizePrompt({ index: badImgIndex, image: images[badImgIndex] });
      return;
    }

    const cleanedPoll = pollOptions.map(o => o.trim()).filter(Boolean);
    if (mode === 'poll' && cleanedPoll.length < 2) {
      ToastAndroid.show(t('forumFeed.pollOptionsLabel'), ToastAndroid.SHORT);
      return;
    }

    const trimmedLink = externalLink.trim();
    if (mode === 'link' && !/^https?:\/\/\S+/i.test(trimmedLink)) {
      ToastAndroid.show(t('forumFeed.externalLinkPlaceholder'), ToastAndroid.SHORT);
      return;
    }

    const trimmedRoom = nobarRoomId.trim().toUpperCase();
    if (mode === 'nobar' && trimmedRoom.length < 3) {
      ToastAndroid.show(t('forumFeed.nobarRoomInput'), ToastAndroid.SHORT);
      return;
    }

    setSubmitting(true);
    try {
      let uploadedMedia: ForumMediaItem[] = [];
      if (images.length > 0 && (mode === 'image' || mode === 'text' || mode === 'nobar')) {
        uploadedMedia = await uploadForumImages(images);
      }

      const finalLinkedMedia: ForumLinkedMedia | null = linkedMedia
        ? {
            ...linkedMedia,
            episode_label: episodeTag.trim() || linkedMedia.episode_label || null,
          }
        : null;

      const postId = await createForumPost({
        category,
        post_type: mode,
        title: trimmedTitle,
        body: body.trim(),
        media_items: uploadedMedia,
        linked_media: finalLinkedMedia,
        poll_options: mode === 'poll' ? cleanedPoll : [],
        poll_days: mode === 'poll' ? pollDays : null,
        rating: category === 'review' || rating !== null ? rating : null,
        nobar_room_id: mode === 'nobar' ? trimmedRoom : null,
        external_link: mode === 'link' ? trimmedLink : null,
        is_spoiler: isSpoiler,
        spoiler_label: isSpoiler && spoilerLabel.trim() ? spoilerLabel.trim() : null,
        is_nsfw: isNsfw,
      });

      const expAwarded = await awardForumExpWithCap('post', addExp);
      if (expAwarded > 0) {
        ToastAndroid.show(t('forumFeed.expEarnedToast', { exp: expAwarded }), ToastAndroid.SHORT);
      } else {
        ToastAndroid.show(t('forumFeed.publishedToast'), ToastAndroid.SHORT);
      }

      navigation.replace('ForumPostDetail', { postId });
    } catch (err) {
      ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.LONG);
    } finally {
      setSubmitting(false);
    }
  }, [
    addExp,
    body,
    category,
    episodeTag,
    externalLink,
    images,
    isNsfw,
    isSpoiler,
    linkedMedia,
    mode,
    navigation,
    nobarRoomId,
    pollDays,
    pollOptions,
    rating,
    spoilerLabel,
    submitting,
    t,
    title,
  ]);

  const bg = isDark ? '#0a0a0c' : '#f4f4f5';
  const surface = isDark ? '#0f0f12' : '#ffffff';
  const borderCol = isDark ? '#1e1e24' : '#e4e4e7';
  const inputBg = isDark ? '#141419' : '#f8fafc';
  const textCol = isDark ? '#f4f4f5' : '#09090b';
  const mutedCol = isDark ? '#a1a1aa' : '#52525b';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: surface,
            borderBottomColor: borderCol,
          },
        ]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="close" size={22} color={textCol} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textCol }]} numberOfLines={1}>
          {t('forumFeed.composerTitle')}
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={submitting || processingImages}
          onPress={handlePublish}
          style={[styles.publishBtn, (submitting || processingImages) && { opacity: 0.6 }]}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.publishBtnText}>{t('forumFeed.publishBtn')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 14,
          paddingBottom: insets.bottom + 32,
          maxWidth: 680,
          width: '100%',
          alignSelf: 'center',
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 7 }}>
          {COMPOSER_MODES.map(m => {
            const active = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                activeOpacity={0.75}
                onPress={() => setMode(m.key)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active ? '#3b82f6' : surface,
                    borderColor: active ? '#3b82f6' : borderCol,
                  },
                ]}>
                <MaterialIcons
                  name={m.icon as any}
                  size={16}
                  color={active ? '#ffffff' : mutedCol}
                />
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: active ? '700' : '600',
                    color: active ? '#ffffff' : textCol,
                  }}>
                  {t(m.labelKey as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol }]}>
          <Text style={[styles.fieldLabel, { color: mutedCol }]}>
            {t('forumFeed.chooseCategory')}
          </Text>
          <View style={styles.wrapRow}>
            {CATEGORIES.map(c => {
              const active = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: active ? 'rgba(59,130,246,0.16)' : inputBg,
                      borderColor: active ? '#3b82f6' : borderCol,
                    },
                  ]}>
                  <View style={[styles.catDot, { backgroundColor: c.color }]} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: active ? '700' : '600',
                      color: active ? '#3b82f6' : textCol,
                    }}>
                    {t(c.labelKey as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 10 }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.fieldLabel, { color: mutedCol }]}>
              {t('forumFeed.titleLabel')}
            </Text>
            <Text style={{ fontSize: 11, color: mutedCol }}>{title.length}/160</Text>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('forumFeed.titlePlaceholder')}
            placeholderTextColor="#71717a"
            maxLength={160}
            style={[
              styles.input,
              {
                backgroundColor: inputBg,
                borderColor: borderCol,
                color: textCol,
                fontWeight: '600',
              },
            ]}
          />

          <Text style={[styles.fieldLabel, { color: mutedCol, marginTop: 4 }]}>
            {t('forumFeed.bodyLabel')}
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('forumFeed.bodyPlaceholder')}
            placeholderTextColor="#71717a"
            multiline
            maxLength={4000}
            style={[
              styles.input,
              styles.textArea,
              { backgroundColor: inputBg, borderColor: borderCol, color: textCol },
            ]}
          />
        </View>

        {mode === 'poll' && (
          <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 9 }]}>
            <Text style={[styles.fieldLabel, { color: mutedCol }]}>
              {t('forumFeed.pollOptionsLabel')}
            </Text>
            {pollOptions.map((opt, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={opt}
                  onChangeText={val =>
                    setPollOptions(prev => prev.map((p, i) => (i === idx ? val : p)))
                  }
                  placeholder={t('forumFeed.pollOptionPlaceholder', { num: idx + 1 })}
                  placeholderTextColor="#71717a"
                  maxLength={80}
                  style={[
                    styles.input,
                    { flex: 1, backgroundColor: inputBg, borderColor: borderCol, color: textCol },
                  ]}
                />
                {pollOptions.length > 2 && (
                  <TouchableOpacity
                    onPress={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))}
                    hitSlop={8}>
                    <MaterialIcons name="close" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {pollOptions.length < 4 && (
              <TouchableOpacity
                onPress={() => setPollOptions(prev => [...prev, ''])}
                style={styles.addPollOptionBtn}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3b82f6' }}>
                  {t('forumFeed.pollAddOption')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.fieldLabel, { color: mutedCol, marginTop: 4 }]}>
              {t('forumFeed.pollDurationLabel')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {POLL_DURATIONS.map(d => {
                const active = pollDays === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setPollDays(d)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: active ? '#3b82f6' : inputBg,
                        borderColor: active ? '#3b82f6' : borderCol,
                      },
                    ]}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: active ? '#ffffff' : textCol,
                      }}>
                      {t('forumFeed.pollDaysCount', { days: d })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {mode === 'link' && (
          <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 8 }]}>
            <Text style={[styles.fieldLabel, { color: mutedCol }]}>
              {t('forumFeed.externalLinkLabel')}
            </Text>
            <TextInput
              value={externalLink}
              onChangeText={setExternalLink}
              placeholder={t('forumFeed.externalLinkPlaceholder')}
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              keyboardType="url"
              style={[
                styles.input,
                { backgroundColor: inputBg, borderColor: borderCol, color: textCol },
              ]}
            />
            {needsAsyncPreview && isResolvingPreview && !showComposerMediaPreview ? (
              <View style={styles.linkPreviewLoading}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            ) : null}
            {showComposerMediaPreview && previewMediaUrl ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: mutedCol }}>
                  {t('forumFeed.externalMediaPreview')}
                </Text>
                <View
                  style={[
                    styles.linkPreviewBox,
                    { backgroundColor: inputBg, borderColor: borderCol },
                  ]}>
                  <ForumImage
                    uri={previewMediaUrl}
                    recyclingKey={previewMediaUrl}
                    contentFit="contain"
                    autoplay
                    style={styles.previewImg}
                    onError={() => setFailedPreviewUrl(previewMediaUrl)}
                  />
                  <View style={styles.linkPreviewBadge}>
                    <Text style={styles.linkPreviewBadgeText}>
                      {isComposerPreviewGif ? 'GIF' : 'IMG'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {mode === 'nobar' && (
          <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 8 }]}>
            <Text style={[styles.fieldLabel, { color: mutedCol }]}>
              {t('forumFeed.nobarRoomInput')}
            </Text>
            <TextInput
              value={nobarRoomId}
              onChangeText={setNobarRoomId}
              placeholder="e.g. xk9a3m2p"
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              style={[
                styles.input,
                { backgroundColor: inputBg, borderColor: borderCol, color: textCol },
              ]}
            />
          </View>
        )}

        {(mode === 'image' || mode === 'text' || mode === 'nobar') && (
          <View
            style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 10 }]}>
            <View style={styles.rowBetween}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={processingImages || images.length >= MAX_FORUM_IMAGES_PER_POST}
                onPress={handlePickImages}
                style={[
                  styles.pickImageBtn,
                  {
                    borderColor: '#3b82f6',
                    backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : '#eff6ff',
                    opacity: images.length >= MAX_FORUM_IMAGES_PER_POST ? 0.5 : 1,
                  },
                ]}>
                {processingImages ? (
                  <ActivityIndicator size="small" color="#3b82f6" />
                ) : (
                  <MaterialIcons name="add-photo-alternate" size={18} color="#3b82f6" />
                )}
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3b82f6' }}>
                  {images.length === 0
                    ? t('forumFeed.pickImagesBtn', { max: MAX_FORUM_IMAGES_PER_POST })
                    : t('forumFeed.pickMoreImages', {
                        count: images.length,
                        max: MAX_FORUM_IMAGES_PER_POST,
                      })}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11.5, color: mutedCol, lineHeight: 16 }}>
              {t('forumFeed.imageLimitNote')}
            </Text>

            {quota && (
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '600',
                  color: quota.remaining <= 2 ? '#f59e0b' : mutedCol,
                }}>
                {t('forumFeed.uploadQuotaLabel', {
                  remaining: quota.remaining,
                  limit: quota.limit,
                })}
              </Text>
            )}

            {images.length > 0 && (
              <View style={styles.imagePreviewGrid}>
                {images.map((img, idx) => (
                  <View
                    key={`${img.originalUri}-${idx}`}
                    style={[
                      styles.previewTile,
                      { borderColor: img.exceedsLimit ? '#ef4444' : borderCol },
                    ]}>
                    <ForumImage uri={img.localUri} style={styles.previewImg} />
                    <TouchableOpacity
                      onPress={() => handleRemoveImage(idx)}
                      style={styles.removeImgBadge}>
                      <MaterialIcons name="close" size={14} color="#ffffff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={!img.exceedsLimit}
                      onPress={() => setOversizePrompt({ index: idx, image: img })}
                      style={[
                        styles.compPill,
                        { backgroundColor: img.exceedsLimit ? '#ef4444' : 'rgba(0,0,0,0.72)' },
                      ]}>
                      <Text
                        style={{ fontSize: 10, fontWeight: '700', color: '#ffffff' }}
                        numberOfLines={1}>
                        {img.exceedsLimit
                          ? `>500KB (${formatBytesShort(img.compressedBytes)})`
                          : t('forumFeed.compressedBadge', {
                              orig: formatBytesShort(img.originalBytes),
                              comp: formatBytesShort(img.compressedBytes),
                            })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 10 }]}>
          <Text style={[styles.fieldLabel, { color: mutedCol }]}>
            {t('forumFeed.attachedMediaLabel')}
          </Text>

          {linkedMedia ? (
            <View style={{ gap: 8 }}>
              <View
                style={[styles.linkedCard, { backgroundColor: inputBg, borderColor: borderCol }]}>
                {linkedMedia.poster_url ? (
                  <ForumImage uri={linkedMedia.poster_url} style={styles.linkedThumb} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 13.5, fontWeight: '700', color: textCol }}
                    numberOfLines={1}>
                    {linkedMedia.title}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: mutedCol, marginTop: 2 }}>
                    {linkedMedia.type.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setLinkedMedia(null)} hitSlop={8}>
                  <MaterialIcons name="close" size={19} color="#ef4444" />
                </TouchableOpacity>
              </View>

              <TextInput
                value={episodeTag}
                onChangeText={setEpisodeTag}
                placeholder={t('forumFeed.episodeLabelInput')}
                placeholderTextColor="#71717a"
                maxLength={40}
                style={[
                  styles.input,
                  { backgroundColor: inputBg, borderColor: borderCol, color: textCol },
                ]}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setMediaPickerOpen(true)}
              style={[styles.attachBtn, { backgroundColor: inputBg, borderColor: borderCol }]}>
              <MaterialIcons name="movie-filter" size={18} color="#3b82f6" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#3b82f6' }}>
                {t('forumFeed.attachMediaBtn')}
              </Text>
            </TouchableOpacity>
          )}

          {(category === 'review' || linkedMedia !== null) && (
            <View style={{ marginTop: 4, gap: 7 }}>
              <Text style={[styles.fieldLabel, { color: mutedCol }]}>
                {t('forumFeed.ratingLabel')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setRating(null)}
                  style={[
                    styles.scoreChip,
                    {
                      backgroundColor: rating === null ? '#3b82f6' : inputBg,
                      borderColor: rating === null ? '#3b82f6' : borderCol,
                    },
                  ]}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: rating === null ? '#ffffff' : mutedCol,
                    }}>
                    {t('forumFeed.ratingNone')}
                  </Text>
                </TouchableOpacity>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                  const active = rating === num;
                  return (
                    <TouchableOpacity
                      key={num}
                      onPress={() => setRating(num)}
                      style={[
                        styles.scoreChip,
                        {
                          backgroundColor: active ? '#eab308' : inputBg,
                          borderColor: active ? '#eab308' : borderCol,
                        },
                      ]}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: active ? '#000000' : textCol,
                        }}>
                        {num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: borderCol, gap: 10 }]}>
          <View style={styles.rowBetween}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: textCol }}>
              {t('forumFeed.spoilerToggle')}
            </Text>
            <Switch
              value={isSpoiler}
              onValueChange={setIsSpoiler}
              trackColor={{ false: '#3f3f46', true: '#eab308' }}
              thumbColor="#ffffff"
            />
          </View>

          {isSpoiler && (
            <TextInput
              value={spoilerLabel}
              onChangeText={setSpoilerLabel}
              placeholder={t('forumFeed.spoilerEpisodePlaceholder')}
              placeholderTextColor="#71717a"
              maxLength={40}
              style={[
                styles.input,
                { backgroundColor: inputBg, borderColor: borderCol, color: textCol },
              ]}
            />
          )}

          <View
            style={[
              styles.rowBetween,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: borderCol,
                paddingTop: 10,
              },
            ]}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: textCol }}>
              {t('forumFeed.nsfwToggle')}
            </Text>
            <Switch
              value={isNsfw}
              onValueChange={setIsNsfw}
              trackColor={{ false: '#3f3f46', true: '#ef4444' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      {mediaPickerOpen && (
        <ForumMediaPickerModal
          visible
          onClose={() => setMediaPickerOpen(false)}
          onSelect={media => {
            setLinkedMedia(media);
            if (media.episode_label) setEpisodeTag(media.episode_label);
          }}
        />
      )}

      {Boolean(oversizePrompt) && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOversizePrompt(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: surface, borderColor: borderCol }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialIcons name="photo-size-select-large" size={22} color="#f59e0b" />
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: textCol, flex: 1 }}>
                  {t('forumFeed.overSizeTitle')}
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: mutedCol, lineHeight: 19, marginBottom: 14 }}>
                {t('forumFeed.overSizeDesc', {
                  size: formatBytesShort(oversizePrompt?.image.compressedBytes || 0),
                  name: oversizePrompt?.image.fileName || 'image',
                })}
              </Text>

              <View style={{ gap: 9 }}>
                <TouchableOpacity
                  onPress={handleConvertStaticWebp}
                  style={[styles.modalActionBtn, { backgroundColor: '#3b82f6' }]}>
                  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                    {t('forumFeed.overSizeUseStatic')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSwitchToExternalUrl}
                  style={[
                    styles.modalActionBtn,
                    { backgroundColor: inputBg, borderWidth: 1, borderColor: borderCol },
                  ]}>
                  <Text style={{ color: textCol, fontWeight: '700', fontSize: 13 }}>
                    {t('forumFeed.overSizeUseExternal')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const idx = oversizePrompt?.index ?? -1;
                    setOversizePrompt(null);
                    if (idx >= 0) handleRemoveImage(idx);
                  }}
                  style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>
                    {t('common.delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '700',
  },
  publishBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 88,
  },
  publishBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  addPollOptionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  pickImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imagePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  previewTile: {
    width: '48%',
    height: 135,
    borderRadius: 9,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  removeImgBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compPill: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 9,
    paddingVertical: 11,
  },
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    padding: 8,
  },
  linkedThumb: {
    width: 36,
    height: 50,
    borderRadius: 5,
  },
  scoreChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  modalActionBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: 'center',
  },
  linkPreviewLoading: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkPreviewBox: {
    width: '100%',
    height: 160,
    borderRadius: 9,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  linkPreviewBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(10,10,14,0.78)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  linkPreviewBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
  },
});

export default memo(ForumComposerScreen);
