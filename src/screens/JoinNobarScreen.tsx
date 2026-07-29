import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { useAuth } from '../misc/AuthContext';
import { supabase } from '../config/supabaseClient';
import Icon from '@react-native-vector-icons/fontawesome';
import AnimeAPI from '../utils/AnimeAPI';

type Props = NativeStackScreenProps<RootStackNavigator, 'JoinNobar'>;

export default function JoinNobarScreen({ route, navigation }: Props) {
  const { roomId } = route.params;
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setError('Wajib Login');
      return;
    }
    
    const roomChannel = supabase.channel(`room_${roomId}`);

    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      let hostMetadata: any = null;
      let isHostVip = false;
      let participantCount = 0;

      Object.keys(state).forEach(key => {
        const presences = state[key] as any[];
        if (presences.length > 0) {
          if (presences[0].status !== 'waiting_metadata') {
            participantCount++;
          }
          const host = presences.find(p => p.isHost === true);
          if (host) {
            if (host.metadata) hostMetadata = host.metadata;
            isHostVip = host.is_vip === true;
          }
        }
      });

      if (hostMetadata) {
        if (!isHostVip && participantCount >= 5) {
          roomChannel.unsubscribe();
          setError('Room Penuh');
          return;
        }

        roomChannel.unsubscribe();
        if (hostMetadata.type === 'anime') {
          AnimeAPI.fromUrl(hostMetadata.link)
            .then(data => {
              navigation.replace('Video', { data: data as any, link: hostMetadata.link, roomId });
            })
            .catch(err => {
              setError('Gagal memuat data Anime: ' + err.message);
            });
        } else {
          navigation.replace('FilmPlayer', { ...hostMetadata, roomId, isGuest: true });
        }
      }
    });

    roomChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        roomChannel.track({
          username: user.user_metadata?.username || 'Guest',
          isHost: false,
          status: 'waiting_metadata'
        });
      }
    });

    return () => {
      roomChannel.unsubscribe();
    };
  }, [user, roomId]);

  const isDark = useColorScheme() === 'dark';

  if (error === 'Wajib Login') {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
        <Icon name="lock" size={60} color="#ff4444" style={{ marginBottom: 20 }} />
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#1f2937' }]}>Wajib Login</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>Kamu harus login untuk bergabung ke Nobar.</Text>
        <Text style={styles.loginBtn} onPress={() => navigation.replace('LoginScreen')}>
          Pergi ke Halaman Login
        </Text>
      </View>
    );
  }

  if (error === 'Room Penuh') {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
        <Icon name="users" size={60} color="#ff9800" style={{ marginBottom: 20 }} />
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#1f2937' }]}>Room Penuh</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>Maaf, kapasitas room Nobar ini (5 orang) sudah penuh karena pembuat room bukan pengguna VIP.</Text>
        <Text style={styles.loginBtn} onPress={() => navigation.goBack()}>
          Kembali
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={[styles.loadingText, { color: isDark ? '#ffffff' : '#1f2937' }]}>Menyiapkan Room Nobar...</Text>
      <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>ID: {roomId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 16,
  },
  loginBtn: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
    padding: 10,
  },
});
