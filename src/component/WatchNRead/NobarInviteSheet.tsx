import React from 'react';
import { View, StyleSheet, Text, Share, TouchableOpacity, ToastAndroid } from 'react-native';
import { Modal, Portal, Button } from 'react-native-paper';
import Icon from '@react-native-vector-icons/fontawesome';
import * as Clipboard from 'expo-clipboard';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  roomId: string;
  onInviteDM: () => void;
  isDark: boolean;
}

export default function NobarInviteSheet({ visible, onDismiss, roomId, onInviteDM, isDark }: Props) {
  const shareLink = async () => {
    try {
      const link = `naoflix://nobar?room=${roomId}`;
      await Clipboard.setStringAsync(roomId);
      ToastAndroid.show('ID Room berhasil disalin ke clipboard!', ToastAndroid.SHORT);
      await Share.share({
        message: `🎥 Ayo Nobar di NaoFlix sekarang!\n\n🔑 ID Room: ${roomId}\n(Buka NaoFlix > Halaman Home > Klik Tombol Gabung Room Nobar)\n\nAtau klik link: ${link}`,
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  const copyOnly = async () => {
    await Clipboard.setStringAsync(roomId);
    ToastAndroid.show('ID Room disalin!', ToastAndroid.SHORT);
  };

  return (
    <Portal>
      <Modal 
        visible={visible} 
        onDismiss={onDismiss} 
        contentContainerStyle={[styles.modalContent, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}
      >
        <View style={styles.header}>
          <Icon name="television" size={24} color="#6366f1" />
          <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
            Invite Teman Nobar
          </Text>
        </View>
        
        <Text style={[styles.subtitle, { color: isDark ? '#aaa' : '#666' }]}>
          Pilih cara untuk mengundang teman ke dalam room ini. Video akan di-pause otomatis.
        </Text>

        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: '#6366f1' }]} 
          onPress={onInviteDM}
          activeOpacity={0.8}
        >
          <Icon name="send" size={16} color="#fff" />
          <Text style={styles.btnText}>Kirim via DM NaoFlix</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: '#25D366', marginTop: 10 }]} 
          onPress={shareLink}
          activeOpacity={0.8}
        >
          <Icon name="share-alt" size={16} color="#6366f1" />
          <Text style={[styles.btnText, { color: '#6366f1' }]}>Share Link & ID Room</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: isDark ? '#333' : '#eee', marginTop: 12 }]} 
          onPress={copyOnly}
          activeOpacity={0.8}
        >
          <Icon name="copy" size={16} color={isDark ? '#fff' : '#000'} />
          <Text style={[styles.btnText, { color: isDark ? '#fff' : '#000' }]}>Copy ID Room ({roomId})</Text>
        </TouchableOpacity>

        <Button 
          mode="text" 
          onPress={onDismiss} 
          textColor={isDark ? '#aaa' : '#666'}
          style={{ marginTop: 15 }}
        >
          Tutup & Kembali Menonton
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 10,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
