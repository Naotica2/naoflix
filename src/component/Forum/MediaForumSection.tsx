import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useLanguage } from '../../misc/LanguageContext';
import {
  formatCompactCount,
  formatRelativeTime,
  ForumCategory,
  ForumLinkedMedia,
  ForumPost,
} from '../../types/forum';
import { fetchForumFeed } from '../../utils/forumApi';

interface Props {
  linkedMedia: ForumLinkedMedia;
  defaultCategory?: ForumCategory;
  navigation: any;
  horizontalMargin?: number;
}

function MediaForumSection({
  linkedMedia,
  defaultCategory = 'general',
  navigation,
  horizontalMargin = 16,
}: Props) {
  const { t, language } = useLanguage();
  const isDark = useColorScheme() === 'dark';

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchForumFeed({
        mediaKey: linkedMedia.media_key,
        sort: 'hot',
        limit: 2,
      });
      setPosts(data);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [linkedMedia.media_key]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleCreateDiscussion = () => {
    navigation.navigate('ForumComposer', {
      linkedMedia,
      defaultCategory,
    });
  };

  const handleOpenFilteredForum = () => {
    navigation.navigate('Home', {
      screen: 'ForumPage',
      params: {
        filterMediaKey: linkedMedia.media_key,
        filterMediaTitle: linkedMedia.title,
      },
    });
  };

  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: horizontalMargin,
          backgroundColor: isDark ? '#111216' : '#ffffff',
          borderColor: isDark ? '#1e2028' : '#e4e4e7',
        },
      ]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <MaterialIcons name="forum" size={16} color="#3b82f6" />
          <Text style={[styles.title, { color: isDark ? '#f4f4f5' : '#09090b' }]}>
            {t('forumFeed.detailSectionTitle')}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCreateDiscussion}
          style={styles.discussBtn}>
          <MaterialIcons name="add" size={14} color="#ffffff" />
          <Text style={styles.discussBtnText}>{t('forumFeed.detailDiscussBtn')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 14, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      ) : posts.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: isDark ? '#71717a' : '#71717a', marginTop: 4 }}>
          {t('forumFeed.detailNoThreads')}
        </Text>
      ) : (
        <View style={styles.previewList}>
          {posts.map(p => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.75}
              onPress={() =>
                navigation.navigate('ForumPostDetail', {
                  postId: p.id,
                  initialPost: p,
                })
              }
              style={[
                styles.previewItem,
                {
                  backgroundColor: isDark ? '#16171d' : '#f8fafc',
                  borderColor: isDark ? '#23242e' : '#e4e4e7',
                },
              ]}>
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#e4e4e7' : '#18181b' }}
                numberOfLines={2}>
                {p.title}
              </Text>
              <View style={styles.previewMeta}>
                <Text style={{ fontSize: 11.5, color: '#71717a' }}>
                  @{p.author_username} {'\u00b7'} {formatRelativeTime(p.created_at, language)}
                </Text>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#3b82f6' }}>
                  {formatCompactCount(p.score)} pt {'\u00b7'} {p.comments_count}{' '}
                  {t('comments.title').toLowerCase()}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={handleOpenFilteredForum} style={styles.viewAllRow}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3b82f6' }}>
              {t('forumFeed.detailViewAllBtn', { count: posts.length })}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 11,
    borderWidth: 1,
    padding: 13,
    marginTop: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  discussBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  discussBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  previewList: {
    gap: 7,
    marginTop: 10,
  },
  previewItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
  },
});

export default memo(MediaForumSection);
