import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { useAuth } from '../misc/AuthContext';
import { tSync, useLanguage } from '../misc/LanguageContext';
import { supabase } from '../config/supabaseClient';
import Icon from '@react-native-vector-icons/fontawesome';
import AnimeAPI from '../utils/AnimeAPI';
import { fetchLatestAnimeIndoDomain } from '../utils/scrapers/animeindo';

type Props = NativeStackScreenProps<RootStackNavigator, 'JoinNobar'>;

function normalizeRoomCode(raw?: string): string {
  const input = (raw || '').trim();
  if (!input) return '';
  const queryMatch = input.match(/[?&](?:room|roomId)=([A-Za-z0-9_-]+)/i);
  if (queryMatch?.[1]) return queryMatch[1].toUpperCase();
  const pathMatch = input.match(/(?:naoflix|aniflix):\/\/nobar\/([A-Za-z0-9_-]+)/i);
  if (pathMatch?.[1]) return pathMatch[1].toUpperCase();
  return input.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
}

export default function JoinNobarScreen({ route, navigation }: Props) {
  const resolvedRoomId = useMemo(
    () => normalizeRoomCode(route.params?.roomId || route.params?.room),
    [route.params?.roomId, route.params?.room],
  );
  const { user } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    resolvedRef.current = false;
    setError(null);

    if (!user) {
      setError('auth_required');
      return;
    }

    if (!resolvedRoomId) {
      setError(tSync('nobar.invalidRoomCode'));
      return;
    }

    let isCancelled = false;
    const domainPromise = fetchLatestAnimeIndoDomain().catch(() => {});
    const roomChannel = supabase.channel(`room_${resolvedRoomId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    const timeout = setTimeout(() => {
      if (!resolvedRef.current && !isCancelled) {
        roomChannel.unsubscribe();
        setError(tSync('nobar.roomNotFound'));
      }
    }, 12000);

    roomChannel.on('presence', { event: 'sync' }, async () => {
      if (resolvedRef.current || isCancelled) return;
      const state = roomChannel.presenceState();
      let hostMetadata: any = null;

      Object.keys(state).forEach(key => {
        const presences = state[key] as any[];
        if (presences.length > 0) {
          const host = presences.find(p => p.isHost === true);
          if (host?.metadata) {
            hostMetadata = host.metadata;
          }
        }
      });

      if (hostMetadata) {
        resolvedRef.current = true;
        clearTimeout(timeout);
        roomChannel.unsubscribe();

        if (hostMetadata.type === 'anime') {
          try {
            if (
              hostMetadata.link?.includes('otakudesu') ||
              hostMetadata.link?.includes('anime-indo') ||
              hostMetadata.link?.startsWith('sanka://')
            ) {
              await domainPromise;
            }
            const data = await AnimeAPI.fromUrl(hostMetadata.link);
            if (isCancelled) return;
            if (!data || data === 'Unsupported' || data.type !== 'animeStreaming') {
              setError(tSync('nobar.roomNotFound'));
              return;
            }
            navigation.replace('Video', {
              data: data as any,
              link: hostMetadata.link,
              roomId: resolvedRoomId,
            });
          } catch (err: any) {
            if (!isCancelled) {
              setError(err?.message || tSync('common.error'));
            }
          }
        } else {
          navigation.replace('FilmPlayer', {
            ...hostMetadata,
            roomId: resolvedRoomId,
            isGuest: true,
          });
        }
      }
    });

    roomChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        roomChannel.track({
          username: user.user_metadata?.username || tSync('common.guest'),
          isHost: false,
          status: 'waiting_metadata',
        });
      }
    });

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
      roomChannel.unsubscribe();
    };
  }, [user, resolvedRoomId, navigation]);

  const isDark = useColorScheme() === 'dark';

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('connectToServer');
    }
  };

  if (error === 'auth_required') {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
        <Icon name="lock" size={60} color="#ff4444" style={{ marginBottom: 20 }} />
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#1f2937' }]}>
          {t('auth.loginRequiredTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>
          {t('auth.loginRequiredNobar')}
        </Text>
        <Text style={styles.loginBtn} onPress={() => navigation.replace('LoginScreen')}>
          {t('auth.loginNow')}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
        <Icon name="exclamation-triangle" size={54} color="#ef4444" style={{ marginBottom: 16 }} />
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#1f2937' }]}>
          {t('common.error')}
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>
          {error}
        </Text>
        <Text style={styles.loginBtn} onPress={handleBack}>
          {t('common.back')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f0f0f' : '#ffffff' }]}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={[styles.loadingText, { color: isDark ? '#ffffff' : '#1f2937' }]}>
        {t('utils.connecting')}
      </Text>
      <Text style={[styles.subtitle, { color: isDark ? '#aaaaaa' : '#4b5563' }]}>
        {t('nobar.roomCodeLabel')}: {resolvedRoomId}
      </Text>
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
