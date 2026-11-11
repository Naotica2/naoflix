import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useLanguage } from '../../misc/LanguageContext';
import { ForumReportReason } from '../../types/forum';
import { parseFriendlyForumError, reportForumItem } from '../../utils/forumApi';

interface Props {
  visible: boolean;
  targetType: 'post' | 'comment';
  targetId: string | null;
  onClose: () => void;
}

const REASONS: { key: ForumReportReason; labelKey: string }[] = [
  { key: 'spoiler', labelKey: 'forumFeed.reportReasonSpoiler' },
  { key: 'nsfw', labelKey: 'forumFeed.reportReasonNsfw' },
  { key: 'spam', labelKey: 'forumFeed.reportReasonSpam' },
  { key: 'harassment', labelKey: 'forumFeed.reportReasonHarassment' },
  { key: 'other', labelKey: 'forumFeed.reportReasonOther' },
];

function ForumReportModal({ visible, targetType, targetId, onClose }: Props) {
  const { t } = useLanguage();
  const isDark = useColorScheme() === 'dark';
  const [reason, setReason] = useState<ForumReportReason>('spoiler');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!targetId || submitting) return;
    setSubmitting(true);
    try {
      const outcome = await reportForumItem({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      ToastAndroid.show(
        outcome === 'already_reported'
          ? t('forumFeed.reportAlready')
          : t('forumFeed.reportSubmitted'),
        ToastAndroid.SHORT,
      );
      setDetails('');
      onClose();
    } catch (err) {
      ToastAndroid.show(parseFriendlyForumError(err), ToastAndroid.SHORT);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#141418' : '#ffffff',
              borderColor: isDark ? '#27272f' : '#e4e4e7',
            },
          ]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: isDark ? '#f4f4f5' : '#09090b' }]}>
              {t('forumFeed.reportTitle')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialIcons name="close" size={20} color={isDark ? '#a1a1aa' : '#52525b'} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: isDark ? '#a1a1aa' : '#52525b' }]}>
            {t('forumFeed.reportSubtitle')}
          </Text>

          <View style={styles.reasonsList}>
            {REASONS.map(r => {
              const selected = reason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  activeOpacity={0.75}
                  style={[
                    styles.reasonRow,
                    {
                      backgroundColor: selected
                        ? isDark
                          ? 'rgba(59,130,246,0.14)'
                          : 'rgba(59,130,246,0.08)'
                        : isDark
                          ? '#0c0c0f'
                          : '#f8fafc',
                      borderColor: selected ? '#3b82f6' : isDark ? '#27272a' : '#e4e4e7',
                    },
                  ]}>
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={18}
                    color={selected ? '#3b82f6' : isDark ? '#71717a' : '#a1a1aa'}
                  />
                  <Text
                    style={[
                      styles.reasonText,
                      {
                        color: isDark ? '#e4e4e7' : '#18181b',
                        fontWeight: selected ? '600' : '400',
                      },
                    ]}>
                    {t(r.labelKey as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder={t('forumFeed.reportDetailsPlaceholder')}
            placeholderTextColor={isDark ? '#71717a' : '#a1a1aa'}
            multiline
            maxLength={350}
            style={[
              styles.input,
              {
                color: isDark ? '#f4f4f5' : '#09090b',
                backgroundColor: isDark ? '#0c0c0f' : '#f8fafc',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.btnSecondary, { borderColor: isDark ? '#27272a' : '#e4e4e7' }]}>
              <Text
                style={{ color: isDark ? '#a1a1aa' : '#52525b', fontWeight: '600', fontSize: 13 }}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.btnPrimary, submitting && { opacity: 0.6 }]}>
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                  {t('forumFeed.reportSubmit')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  reasonsList: {
    gap: 7,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  reasonText: {
    fontSize: 13,
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    minHeight: 68,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    minWidth: 110,
    alignItems: 'center',
  },
});

export default memo(ForumReportModal);
