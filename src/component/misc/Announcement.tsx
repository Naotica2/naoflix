import { useEffect, useMemo, useState } from 'react';
import {
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown from 'react-native-marked';
import { Modal, Portal } from 'react-native-paper';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useLanguage } from '../../misc/LanguageContext';
import { DatabaseManager } from '../../utils/DatabaseManager';

const hashCode = (str: string) => {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString();
};

function AnnouncementModal({
  announcementText,
  onClose,
  onDontShowAgain,
}: {
  announcementText: string;
  onClose: () => void;
  onDontShowAgain: () => void;
}) {
  const dimensions = useWindowDimensions();
  const { t } = useLanguage();
  const isDark = useColorScheme() === 'dark';

  const markdownTheme = useMemo<any>(() => {
    return {
      colors: {
        text: isDark ? '#e5e7eb' : '#1f2937',
        background: 'transparent',
        code: isDark ? '#f87171' : '#ef4444',
        link: '#3b82f6',
        border: isDark ? '#374151' : '#e5e7eb',
      },
    };
  }, [isDark]);

  return (
    <Portal>
      <Modal
        visible
        onDismiss={onClose}
        contentContainerStyle={styles.modalContentContainer}>
        <View style={styles.modalBackground}>
          <View style={[styles.container, { backgroundColor: isDark ? '#1f2937' : '#ffffff' }]}>
            <View style={[styles.header, { backgroundColor: isDark ? '#111827' : '#f3f4f6' }]}>
              <View style={styles.headerIconContainer}>
                <MaterialIcons name="campaign" size={28} color="#3b82f6" />
              </View>
              <Text style={[styles.headerText, { color: isDark ? '#f9fafb' : '#111827' }]}>
                {t('utils.announcementHeader')}
              </Text>
              <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
                <MaterialIcons name="close" size={24} color={isDark ? '#9ca3af' : '#6b7280'} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Markdown
                theme={markdownTheme}
                flatListProps={{
                  style: {
                    paddingHorizontal: 20,
                    paddingTop: 10,
                    paddingBottom: 20,
                    maxHeight: dimensions.height * 0.6,
                  },
                  showsVerticalScrollIndicator: false,
                }}
                value={announcementText}
              />
            </View>

            <View
              style={[
                styles.footer,
                { borderTopColor: isDark ? '#374151' : '#e5e7eb', flexDirection: 'row', gap: 10 },
              ]}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3b82f6' },
                ]}
                activeOpacity={0.8}
                onPress={onDontShowAgain}>
                <Text style={[styles.actionButtonText, { color: '#3b82f6', fontSize: 13, textAlign: 'center' }]}>
                  {t('utils.dontShowAgain')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={onClose}>
                <Text style={styles.actionButtonText}>{t('utils.understood')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

export default function Announcement() {
  const [modalVisible, setModalVisible] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [currentHash, setCurrentHash] = useState('');

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      fetch(
        'https://raw.githubusercontent.com/Naotica2/naoflix/refs/heads/main/Announcement.md',
      )
        .then(async data => {
          if (!data.ok || cancelled) return;
          const text = await data.text();
          if (text.trim() === '' || cancelled) return;

          const newHash = hashCode(text);
          const savedHash = await DatabaseManager.get('last_announcement_hash');

          if (!cancelled && savedHash !== newHash) {
            setAnnouncementText(text);
            setCurrentHash(newHash);
            setModalVisible(true);
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  const handleDontShowAgain = async () => {
    if (currentHash) {
      await DatabaseManager.set('last_announcement_hash', currentHash);
    }
    setModalVisible(false);
  };

  if (!modalVisible) return null;

  return (
    <AnnouncementModal
      announcementText={announcementText}
      onClose={() => setModalVisible(false)}
      onDontShowAgain={handleDontShowAgain}
    />
  );
}

const styles = StyleSheet.create({
  modalContentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackground: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  container: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerIconContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    padding: 8,
    borderRadius: 12,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  closeIcon: {
    padding: 4,
  },
  content: {
    minHeight: 100,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  actionButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
