import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useMemo, useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useLanguage } from '../../misc/LanguageContext';
import {
  countCommentSubtree,
  formatCompactCount,
  formatRelativeTime,
  ForumComment,
  ForumCommentNode,
  ForumMediaItem,
} from '../../types/forum';
import { getLevelColor } from '../../utils/LevelSystem';
import ForumImage from './ForumImage';
import ForumRichText from './ForumRichText';

interface Props {
  node: ForumCommentNode;
  visualDepth?: number;
  currentUserId?: string | null;
  isDark?: boolean;
  isCompact?: boolean;
  navigation: any;
  onVoteComment: (commentId: string, value: -1 | 0 | 1) => void;
  onReply: (comment: ForumComment) => void;
  onReportComment: (commentId: string) => void;
  onBlockAuthor: (authorId: string, username: string) => void;
  onDeleteComment: (comment: ForumComment) => void;
  onContinueThread: (commentId: string) => void;
  onOpenImage: (item: ForumMediaItem) => void;
}

function NestedCommentItem({
  node,
  visualDepth = 0,
  currentUserId,
  isDark: isDarkProp,
  isCompact: isCompactProp,
  navigation,
  onVoteComment,
  onReply,
  onReportComment,
  onBlockAuthor,
  onDeleteComment,
  onContinueThread,
  onOpenImage,
}: Props) {
  const { t, language } = useLanguage();
  const systemIsDark = useColorScheme() === 'dark';
  const isDark = isDarkProp ?? systemIsDark;
  const isCompact = isCompactProp ?? Dimensions.get('window').width < 360;

  const [collapsed, setCollapsed] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  const isDeleted = node.status === 'deleted';
  const isMine = Boolean(currentUserId && currentUserId === node.author_id);
  const upActive = node.my_vote === 1;
  const downActive = node.my_vote === -1;
  const relTime = useMemo(
    () => formatRelativeTime(node.created_at, language),
    [node.created_at, language],
  );
  const totalInBranch = useMemo(() => countCommentSubtree(node), [node]);
  const indentStep = isCompact ? 10 : 14;
  const hasThreadLine = visualDepth > 0;
  const guideColor =
    visualDepth === 1 ? (isDark ? '#2e3a59' : '#bfdbfe') : isDark ? '#23232b' : '#d4d4d8';

  const hitMaxDepth = visualDepth >= 4 && node.replies.length > 0;

  return (
    <View
      style={[
        styles.wrapper,
        hasThreadLine && {
          marginLeft: indentStep,
          paddingLeft: indentStep - 2,
          borderLeftWidth: 1.5,
          borderLeftColor: guideColor,
        },
        visualDepth === 0 && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? '#1a1a20' : '#e4e4e7',
          paddingVertical: 10,
        },
      ]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setCollapsed(c => !c)}
        style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={isDeleted}
          onPress={() => navigation.navigate('UserProfile', { userId: node.author_id })}
          style={styles.authorLeft}>
          {!isDeleted && node.author_avatar_url ? (
            <ForumImage
              uri={node.author_avatar_url}
              recyclingKey={node.author_avatar_url}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: isDark ? '#1c1c22' : '#e4e4e7',
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              ]}>
              <Text
                style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#a1a1aa' : '#52525b' }}>
                {isDeleted
                  ? '-'
                  : (node.author_display_name || node.author_username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}

          <Text
            style={{
              fontSize: 12.5,
              fontWeight: '600',
              color: isDeleted ? '#71717a' : isDark ? '#e4e4e7' : '#18181b',
            }}
            numberOfLines={1}>
            {isDeleted ? t('common.user') : node.author_display_name || node.author_username}
          </Text>

          {!isDeleted && (
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: '700',
                color: getLevelColor(node.author_level),
                marginLeft: 5,
              }}>
              Lv.{node.author_level}
            </Text>
          )}

          <Text style={{ fontSize: 11, color: '#71717a' }}>
            {' \u00b7 '}
            {relTime}
          </Text>
        </TouchableOpacity>

        {collapsed && (
          <View
            style={[styles.collapsedBadge, { backgroundColor: isDark ? '#1e293b' : '#dbeafe' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>
              +{totalInBranch}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {!collapsed && (
        <>
          {isDeleted ? (
            <Text
              style={{ fontSize: 13, color: '#71717a', fontStyle: 'italic', marginVertical: 4 }}>
              {t('forumFeed.deletedComment')}
            </Text>
          ) : node.is_spoiler && !spoilerRevealed ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSpoilerRevealed(true)}
              style={[
                styles.spoilerPill,
                {
                  backgroundColor: isDark ? '#18181c' : '#f4f4f5',
                  borderColor: isDark ? '#27272f' : '#e4e4e7',
                },
              ]}>
              <MaterialIcons name="visibility" size={14} color="#eab308" />
              <Text style={{ fontSize: 12.5, color: isDark ? '#cbd5e1' : '#3f3f46' }}>
                {t('forumFeed.spoilerBadge')} - {t('forumFeed.spoilerRevealHint')}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {node.body ? (
                <ForumRichText
                  text={node.body}
                  isDark={isDark}
                  style={[styles.bodyText, { color: isDark ? '#d4d4d8' : '#27272a' }]}
                />
              ) : null}

              {node.image_item?.url ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onOpenImage(node.image_item!)}
                  style={styles.commentImageWrap}>
                  <ForumImage
                    uri={node.image_item.thumbUrl || node.image_item.url}
                    recyclingKey={node.image_item.url}
                    style={styles.commentImage}
                  />
                </TouchableOpacity>
              ) : null}
            </>
          )}

          {!isDeleted && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={() => onVoteComment(node.id, upActive ? 0 : 1)}
                hitSlop={8}
                style={styles.actionItem}>
                <MaterialIcons
                  name={upActive ? 'thumb-up-alt' : 'thumb-up-off-alt'}
                  size={15}
                  color={upActive ? '#f97316' : '#71717a'}
                />
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: upActive
                    ? '#f97316'
                    : downActive
                      ? '#6366f1'
                      : isDark
                        ? '#a1a1aa'
                        : '#52525b',
                  minWidth: 14,
                  textAlign: 'center',
                }}>
                {formatCompactCount(node.score)}
              </Text>

              <TouchableOpacity
                onPress={() => onVoteComment(node.id, downActive ? 0 : -1)}
                hitSlop={8}
                style={styles.actionItem}>
                <MaterialIcons
                  name={downActive ? 'thumb-down-alt' : 'thumb-down-off-alt'}
                  size={15}
                  color={downActive ? '#6366f1' : '#71717a'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onReply(node)}
                hitSlop={6}
                style={[styles.actionItem, { flexDirection: 'row', gap: 4, marginLeft: 8 }]}>
                <MaterialIcons name="reply" size={15} color="#71717a" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#71717a' }}>
                  {t('comments.reply')}
                </Text>
              </TouchableOpacity>

              {isMine ? (
                <TouchableOpacity
                  onPress={() => onDeleteComment(node)}
                  hitSlop={6}
                  style={[styles.actionItem, { marginLeft: 6 }]}>
                  <MaterialIcons name="delete-outline" size={15} color="#ef4444" />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => onReportComment(node.id)}
                    hitSlop={6}
                    style={[styles.actionItem, { marginLeft: 6 }]}>
                    <MaterialIcons name="flag" size={14} color="#71717a" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onBlockAuthor(node.author_id, node.author_username)}
                    hitSlop={6}
                    style={[styles.actionItem, { marginLeft: 2 }]}>
                    <MaterialIcons name="block" size={14} color="#71717a" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {hitMaxDepth ? (
            <TouchableOpacity onPress={() => onContinueThread(node.id)} style={styles.continueBtn}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3b82f6' }}>
                {t('forumFeed.continueThread', { count: totalInBranch - 1 })}
              </Text>
              <MaterialIcons name="arrow-forward" size={14} color="#3b82f6" />
            </TouchableOpacity>
          ) : (
            node.replies.map(child => (
              <NestedCommentItem
                key={child.id}
                node={child}
                visualDepth={visualDepth + 1}
                currentUserId={currentUserId}
                isDark={isDark}
                isCompact={isCompact}
                navigation={navigation}
                onVoteComment={onVoteComment}
                onReply={onReply}
                onReportComment={onReportComment}
                onBlockAuthor={onBlockAuthor}
                onDeleteComment={onDeleteComment}
                onContinueThread={onContinueThread}
                onOpenImage={onOpenImage}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  authorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  collapsedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bodyText: {
    fontSize: 13.5,
    lineHeight: 19.5,
    marginBottom: 4,
  },
  spoilerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginVertical: 4,
  },
  commentImageWrap: {
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 8,
    overflow: 'hidden',
    width: 180,
    height: 125,
  },
  commentImage: {
    width: '100%',
    height: '100%',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
  },
  actionItem: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
});

export default memo(NestedCommentItem);
