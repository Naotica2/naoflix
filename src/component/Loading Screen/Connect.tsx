import Icon from '@react-native-vector-icons/fontawesome';
import Fontisto from '@react-native-vector-icons/fontisto';
import MaterialIcon from '@react-native-vector-icons/material-design-icons';
import { StackActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Updates from 'expo-updates';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  View,
  ViewStyle,
} from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import Orientation from 'react-native-orientation-locker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from 'react-native-paper';
import {
  default as Reanimated,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { version as appVersion, OTAJSVersion } from '../../../package.json';
import useGlobalStyles from '../../assets/style';
import defaultDatabase from '../../misc/defaultDatabaseValue.json';
import { EpisodeBaruHome } from '../../types/anime';
import { SetDatabaseTarget } from '../../types/databaseTarget';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import { DANGER_MIGRATE_OLD_HISTORY, DatabaseManager } from '../../utils/DatabaseManager';
import deviceUserAgent from '../../utils/deviceUserAgent';
// Removed AnimeMovieWebView import
import { fetchLatestDomain } from '../../utils/scrapers/animeSeries';
import { fetchLatestAnimeIndoDomain } from '../../utils/scrapers/animeindo';
import { useAuth } from '../../misc/AuthContext';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';

const saweriaIcon = require('../../assets/saweria_icon.png');

export const DonasiSaweria = ({
  buttonColor,
  size = 24,
  style,
}: {
  buttonColor?: string;
  size?: number;
  style?: ViewStyle;
}) => {
  const styles = useStyles();
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL('https://saweria.co/naotica')}
      style={[styles.socialButton, buttonColor ? { backgroundColor: buttonColor } : {}, style]}>
      <Icon name="coffee" size={size} color={buttonColor ? '#ffffff' : '#000000'} />
      <Text style={styles.socialButtonText}>Donasi</Text>
    </TouchableOpacity>
  );
};

export const Github = ({
  buttonColor,
  size = 24,
  style,
}: {
  buttonColor?: string;
  size?: number;
  style?: ViewStyle;
}) => {
  const styles = useStyles();
  const globalStyles = useGlobalStyles();
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL('https://github.com/Naotica2')}
      style={[styles.socialButton, buttonColor ? { backgroundColor: buttonColor } : {}, style]}>
      <Icon name="github" size={size} color={globalStyles.text.color} />
      <Text style={styles.socialButtonText}>GitHub</Text>
    </TouchableOpacity>
  );
};

type Props = NativeStackScreenProps<RootStackNavigator, 'connectToServer'>;

function Loading(props: Props) {
  const styles = useStyles();
  const { user, confirmedNoProfile } = useAuth();
  const { addExp } = useLevel();

  useEffect(() => {
    Orientation.lockToPortrait();
  }, []);

  const [loadStatus, setLoadStatus] = useState({
    'Menyiapkan database': false,
    'Mengecek versi aplikasi': false,
    'Mendapatkan domain terbaru': false,
    'Menghubungkan ke server': false,
  });

  // const [isComics1WebViewOpen, setIsComics1WebViewOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const progressValueAnimation = useSharedValue(0);

  const fetchAnimeData = useCallback(async (signal: AbortSignal) => {
    const jsondata: EpisodeBaruHome | void = await AnimeAPI.home(signal).catch(() => {
      // props.navigation.dispatch(StackActions.replace('FailedToConnect'));
      ToastAndroid.show('Gagal menghubungkan ke server anime', ToastAndroid.SHORT);
    });
    setLoadStatus(old => ({
      ...old,
      'Menghubungkan ke server': true,
    }));
    if (jsondata === undefined) {
      return {
        newAnime: [],
        jadwalAnime: [],
      };
    }
    return jsondata;
  }, []);

  const prepareData = useCallback(async () => {
    const arrOfDefaultData = Object.keys(defaultDatabase) as SetDatabaseTarget[];
    const allKeys = await DatabaseManager.getAllKeys();
    for (const dataKey of arrOfDefaultData) {
      const data = await DatabaseManager.get(dataKey);
      if (data === null || data === undefined) {
        await DatabaseManager.set(dataKey, defaultDatabase[dataKey]);
        continue;
      }
    }
    // History migration to individual key per item
    // @ts-expect-error
    const history = await DatabaseManager.get('history');
    if (history) {
      ToastAndroid.show('Mengoptimalkan data history...', ToastAndroid.SHORT);
      await DANGER_MIGRATE_OLD_HISTORY(JSON.parse(history));
    }
    const isInDatabase = (key: string): key is SetDatabaseTarget => {
      return (arrOfDefaultData as readonly string[]).includes(key);
    };
    for (const dataKey of allKeys) {
      if (
        !isInDatabase(dataKey) &&
        !dataKey.startsWith('IGNORE_DEFAULT_DB_') &&
        !dataKey.startsWith('historyItem:') &&
        !dataKey.startsWith('sb-') &&
        dataKey !== 'user_time_statistics'
      ) {
        DatabaseManager.delete(dataKey);
      }
    }
  }, []);

  const deleteUnnecessaryUpdate = useCallback(async () => {
    const downloadPath = `${RNFetchBlob.fs.dirs.DownloadDir}/AniFlix-${appVersion}.apk`;
    const isExist = await RNFetchBlob.fs.exists(downloadPath);
    if (isExist) {
      await RNFetchBlob.fs.unlink(downloadPath);
      ToastAndroid.show('Menghapus update tidak terpakai', ToastAndroid.SHORT);
    }
  }, []);

  const fetchDomain = useCallback(async (signal: AbortSignal) => {
    await Promise.all([
      fetchLatestDomain(signal).catch(() => {}),
      fetchLatestAnimeIndoDomain(signal).catch(() => {}),
    ]).catch(() => {
      ToastAndroid.show(
        'Gagal mendapatkan domain terbaru, menggunakan domain default',
        ToastAndroid.SHORT,
      );
    });
  }, []);

  const checkNativeAppVersion = useCallback(async (signal: AbortSignal) => {
    const abort = new AbortController();
    const timoeut = setTimeout(() => abort.abort(), 15000);
    const onAbort = () => abort.abort();
    signal.addEventListener('abort', onAbort);

    const data = await fetch(
      'https://api.github.com/repos/Naotica2/naoflix/releases?per_page=1',
      {
        signal: abort.signal,
        headers: {
          'User-Agent': deviceUserAgent,
        },
      },
    )
      .then(d => d.json())
      .catch(() => {});
    clearTimeout(timoeut);
    signal.removeEventListener('abort', onAbort);

    if (signal.aborted) return null;

    if (data === undefined) {
      ToastAndroid.show('Error saat mengecek versi', ToastAndroid.SHORT);
      return true;
    } else if (data.message && data.message.includes('Not Found')) {
      // Repository doesn't exist yet, ignore update
      return true;
    } else if (data[0] === undefined) {
      // Rate limit or no releases yet
      return true;
    }
    
    const remoteVersion = data[0]?.tag_name || '';
    const cleanRemote = remoteVersion.replace(/[^0-9.]/g, '');
    const cleanCurrent = appVersion.replace(/[^0-9.]/g, '');
    
    // Check if remote version is strictly greater than current version
    const isNewer = cleanRemote.localeCompare(cleanCurrent, undefined, { numeric: true, sensitivity: 'base' }) > 0;

    if (!isNewer) {
      return true;
    }
    
    return data[0];
  }, []);

  // const [comics1Promise] = useState(
  //   () => new Promise(res => (comics1PromiseResolve.current = res)),
  // );
  // const onComics1Ready = useCallback(() => {
  //   setLoadStatus(old => ({
  //     ...old,
  //     'Mempersiapkan data anime movie': !isAnimeMovieWebViewOpen && !isComics1WebViewOpen,
  //   }));
  //   setIsComics1WebViewOpen(false);
  //   comics1PromiseResolve.current?.();
  // }, [isAnimeMovieWebViewOpen, isComics1WebViewOpen]);

  // Use refs for auth values so connectToServers doesn't restart the entire
  // loading flow when auth state changes (e.g. profile retry succeeds in background)
  const authRef = useRef({ user, confirmedNoProfile });
  useEffect(() => {
    authRef.current = { user, confirmedNoProfile };
  }, [user, confirmedNoProfile]);

  const connectToServers = useCallback(
    async (signal: AbortSignal) => {
      // setIsComics1WebViewOpen(true);
      const animeData = await fetchAnimeData(signal);
      if (signal.aborted) return;
      if (animeData === undefined) {
        return;
      }
      
      const anime = animeData;
        // Read latest auth state at navigation time via ref
        const { user: currentUser, confirmedNoProfile: noProfile } = authRef.current;

        // Daily login EXP reward
        if (currentUser) {
          AsyncStorage.getItem('last_login_reward_date').then(lastDate => {
            const today = new Date().toDateString();
            if (lastDate !== today) {
              addExp(EXP_REWARDS.LOGIN);
              AsyncStorage.setItem('last_login_reward_date', today);
              ToastAndroid.show(`+${EXP_REWARDS.LOGIN} EXP (Daily Login)`, ToastAndroid.SHORT);
            }
          });
        }

        if (currentUser && noProfile) {
          props.navigation.dispatch(StackActions.replace('UsernameSetupScreen'));
        } else {
          props.navigation.dispatch(StackActions.replace('Home', { data: anime }));
        }
    },
    [fetchAnimeData, props.navigation],
  );

  useFocusEffect(
    useCallback(() => {
      const abortController = new AbortController();
      const signal = abortController.signal;

      (async () => {
        setLoadStatus({
          'Menyiapkan database': false,
          'Mengecek versi aplikasi': false,
          'Mendapatkan domain terbaru': false,
          'Menghubungkan ke server': false,
        });
        await prepareData();
        if (signal.aborted) return;

        await deleteUnnecessaryUpdate();
        if (signal.aborted) return;

        setLoadStatus(old => ({
          ...old,
          'Menyiapkan database': true,
        }));

        const nativeAppVersion = await checkNativeAppVersion(signal);
        if (signal.aborted) return;

        if (nativeAppVersion === null) {
          props.navigation.dispatch(StackActions.replace('FailedToConnect'));
        } else if (nativeAppVersion === true || __DEV__) {
          let isOTADoneExecuted = false;
          async function OTADone() {
            if (isOTADoneExecuted || signal.aborted) return;
            isOTADoneExecuted = true;
            setLoadStatus(old => ({
              ...old,
              'Mengecek versi aplikasi': true,
            }));
            await fetchDomain(signal);
            if (signal.aborted) return;
            setLoadStatus(old => ({
              ...old,
              'Mendapatkan domain terbaru': true,
            }));
            connectToServers(signal);
          }
          await OTADone();
        } else {
          const latestVersion = nativeAppVersion.tag_name;
          const changelog = nativeAppVersion.body;
          const download = nativeAppVersion.assets[0].browser_download_url;

          props.navigation.dispatch(
            StackActions.replace('NeedUpdate', {
              latestVersion,
              changelog,
              download,
              nativeUpdate: true,
            }),
          );
        }
      })();

      return () => {
        abortController.abort();
      };
    }, [
      prepareData,
      checkNativeAppVersion,
      props.navigation,
      deleteUnnecessaryUpdate,
      fetchDomain,
      connectToServers,
    ]),
  );

  useEffect(() => {
    const completedSteps = Object.values(loadStatus).filter(Boolean).length;
    const totalSteps = Object.keys(loadStatus).length;
    const progress = (completedSteps / totalSteps) * 100;
    setProgressValue(progress);
    progressValueAnimation.set(withTiming(progress));
  }, [loadStatus, progressValueAnimation]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressValueAnimation.get()}%`,
  }));


  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>NaoFlix</Text>
          <Text style={styles.subtitle}>Memuat pengalaman anime-mu...</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Reanimated.View style={[styles.progressFill, progressBarStyle]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progressValue)}%</Text>
        </View>

        <View style={styles.statusContainer}>
          {Object.entries(loadStatus).map(([key, value]) => (
            <View style={styles.statusItem} key={key}>
              {value ? (
                <MaterialIcon name="check-circle" size={18} color="#3b82f6" />
              ) : (
                <ActivityIndicator size="small" color="#3b82f6" />
              )}
              <Text style={styles.statusText}>{key}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.socialButtons}>
          <Github />
          <DonasiSaweria />
        </View>
        <Text style={styles.versionText}>
          {appVersion}-JS_{OTAJSVersion}
        </Text>
      </View>
    </ScrollView>
  );
}

function useStyles() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexGrow: 1,
          padding: 32,
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#0a0a0a' : '#fafafa',
        },
        content: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        header: {
          alignItems: 'center',
          marginBottom: 48,
        },
        appName: {
          fontSize: 36,
          fontWeight: '800',
          color: '#3b82f6',
          marginBottom: 8,
          letterSpacing: -1,
        },
        subtitle: {
          fontSize: 14,
          color: isDark ? '#666' : '#999',
          fontWeight: '500',
        },
        progressContainer: {
          flexShrink: 0,
          flexWrap: 'nowrap',
          width: '100%',
          marginBottom: 32,
          alignItems: 'center',
        },
        progressBar: {
          height: 4,
          width: '100%',
          backgroundColor: isDark ? '#222' : '#e8e8e8',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 8,
        },
        progressFill: {
          height: '100%',
          backgroundColor: '#3b82f6',
          borderRadius: 2,
        },
        progressText: {
          fontSize: 13,
          color: isDark ? '#666' : '#999',
          fontWeight: '600',
        },
        statusContainer: {
          width: '100%',
          backgroundColor: isDark ? '#151515' : '#fff',
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: isDark ? '#222' : '#eee',
        },
        statusItem: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10,
        },
        statusText: {
          fontSize: 14,
          color: isDark ? '#ccc' : '#444',
          marginLeft: 12,
          fontWeight: '500',
        },
        footer: {
          alignItems: 'center',
          paddingTop: 16,
        },
        socialButtons: {
          flexWrap: 'wrap',
          flexDirection: 'row',
          justifyContent: 'center',
          marginBottom: 16,
        },
        socialButton: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 20,
          marginHorizontal: 8,
          borderWidth: 1,
          borderColor: isDark ? '#333' : '#ddd',
        },
        socialButtonText: {
          fontSize: 13,
          fontWeight: '600',
          color: isDark ? '#ccc' : '#444',
          marginLeft: 8,
        },
        versionText: {
          fontSize: 11,
          color: isDark ? '#444' : '#bbb',
          marginBottom: 8,
          fontWeight: '500',
        },
        loadingIndicator: {
          color: '#3b82f6',
        },
      }),
    [isDark],
  );
}

export default Loading;
