import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, TouchableOpacity, useColorScheme } from 'react-native';
import Markdown from 'react-native-marked';
import { Modal, Portal, useTheme } from 'react-native-paper';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import useGlobalStyles from '../../assets/style';
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

export default function Announcement() {
  const [modalVisible, setModalVisible] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [currentHash, setCurrentHash] = useState('');

  const dimensions = useWindowDimensions();
  const globalStyles = useGlobalStyles();
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();

  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/Naotica2/naoflix/refs/heads/main/Announcement.md',
    )
      .then(async data => {
        if (!data.ok) return;
        const text = await data.text();
        if (text.trim() === '') return;
        
        const newHash = hashCode(text);
        const savedHash = await DatabaseManager.get('last_announcement_hash');
        
        if (savedHash !== newHash) {
          setAnnouncementText(text);
          setCurrentHash(newHash);
          setModalVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDontShowAgain = async () => {
    if (currentHash) {
      await DatabaseManager.set('last_announcement_hash', currentHash);
    }
    setModalVisible(false);
  };

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
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        contentContainerStyle={styles.modalContentContainer}>
        <View style={styles.modalBackground}>
          <View style={[styles.container, { backgroundColor: isDark ? '#1f2937' : '#ffffff' }]}>
            
            {/* Header */}
            <View style={[styles.header, { backgroundColor: isDark ? '#111827' : '#f3f4f6' }]}>
              <View style={styles.headerIconContainer}>
                <MaterialIcons name="campaign" size={28} color="#3b82f6" />
              </View>
              <Text style={[styles.headerText, { color: isDark ? '#f9fafb' : '#111827' }]}>
                Pemberitahuan
              </Text>
              <TouchableOpacity
                style={styles.closeIcon}
                onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={isDark ? '#9ca3af' : '#6b7280'} />
              </TouchableOpacity>
            </View>

            {/* Content */}
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

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: isDark ? '#374151' : '#e5e7eb', flexDirection: 'row', gap: 10 }]}>
              <TouchableOpacity
                style={[styles.actionButton, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3b82f6' }]}
                activeOpacity={0.8}
                onPress={handleDontShowAgain}>
                <Text style={[styles.actionButtonText, { color: '#3b82f6', fontSize: 13, textAlign: 'center' }]}>Jangan Tampilkan Lagi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={() => setModalVisible(false)}>
                <Text style={styles.actionButtonText}>Mengerti</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </Portal>
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
