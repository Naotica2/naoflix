import Icon from '@react-native-vector-icons/fontawesome';
import { StackActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import Orientation from 'react-native-orientation-locker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { version as appVersion, OTAJSVersion } from '../../../package.json';
import defaultDatabase from '../../misc/defaultDatabaseValue.json';
import { EpisodeBaruHome } from '../../types/anime';
import { SetDatabaseTarget } from '../../types/databaseTarget';
import { RootStackNavigator } from '../../types/navigation';
import AnimeAPI from '../../utils/AnimeAPI';
import { DANGER_MIGRATE_OLD_HISTORY, DatabaseManager } from '../../utils/DatabaseManager';
import deviceUserAgent from '../../utils/deviceUserAgent';
import { fetchLatestDomain } from '../../utils/scrapers/animeSeries';
import { fetchLatestAnimeIndoDomain } from '../../utils/scrapers/animeindo';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import { useAuth } from '../../misc/AuthContext';
import { TranslationKey, tSync, useLanguage } from '../../misc/LanguageContext';
import { useLevel } from '../../misc/LevelContext';
import { EXP_REWARDS } from '../../utils/LevelSystem';
import NaoFlixLogo from '../misc/NaoFlixLogo';

export const DonasiSaweria = ({
  buttonColor,
  size = 18,
  style,
}: {
  buttonColor?: string;
  size?: number;
  style?: ViewStyle;
}) => {
  const isDark = useColorScheme() === 'dark';
  const styles = useStyles(isDark);
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => Linking.openURL('https://saweria.co/naotica')}
      style={[styles.socialButton, buttonColor ? { backgroundColor: buttonColor } : {}, style]}>
      <Icon name="coffee" size={size} color={buttonColor ? '#ffffff' : isDark ? '#e4e4e7' : '#334155'} />
      <Text style={[styles.socialButtonText, buttonColor ? { color: '#ffffff' } : {}]}>{t('common.donate')}</Text>
    </TouchableOpacity>
  );
};

export const Github = ({
  buttonColor,
  size = 18,
  style,
}: {
  buttonColor?: string;
  size?: number;
  style?: ViewStyle;
}) => {
  const isDark = useColorScheme() === 'dark';
  const styles = useStyles(isDark);
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => Linking.openURL('https://github.com/Naotica2')}
      style={[styles.socialButton, buttonColor ? { backgroundColor: buttonColor } : {}, style]}>
      <Icon name="github" size={size} color={buttonColor ? '#ffffff' : isDark ? '#e4e4e7' : '#334155'} />
      <Text style={[styles.socialButtonText, buttonColor ? { color: '#ffffff' } : {}]}>GitHub</Text>
    </TouchableOpacity>
  );
};

const STEP_KEYS = [
  'prepareDb',
  'checkVersion',
  'fetchDomain',
  'connectServer',
] as const;

type StepKey = (typeof STEP_KEYS)[number];
type LoadStatusMap = Record<StepKey, boolean>;

const STEP_LABEL_KEYS: Record<StepKey, TranslationKey> = {
  prepareDb: 'utils.stepPrepareDb',
  checkVersion: 'utils.stepCheckVersion',
  fetchDomain: 'utils.stepFetchDomain',
  connectServer: 'utils.stepConnectServer',
};

type Props = NativeStackScreenProps<RootStackNavigator, 'connectToServer'>;

function Loading(props: Props) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const styles = useStyles(isDark);

  const isCompact = width < 360 || height < 640;
  const logoSize = Math.round(Math.min(88, Math.max(72, width * 0.21)));
  const progressBarWidth = Math.min(210, Math.round(width * 0.54));

  const { user, confirmedNoProfile } = useAuth();
  const { addExp } = useLevel();

  useEffect(() => {
    Orientation.lockToPortrait();
  }, []);

  const [loadStatus, setLoadStatus] = useState<LoadStatusMap>({
    prepareDb: false,
    checkVersion: false,
    fetchDomain: false,
    connectServer: false,
  });

  const progressValueAnimation = useSharedValue(0);

  const fetchAnimeData = useCallback(async (signal: AbortSignal, isOfflineHint: boolean = false) => {
    const showAnime = await DatabaseManager.get('homeShowAnime');
    if (showAnime === 'false') {
      return {
        newAnime: [],
        jadwalAnime: [],
      };
    }

    let failed = false;
    const jsondata: EpisodeBaruHome | void = await AnimeAPI.home(signal).catch(() => {
      failed = true;
    });
    setLoadStatus(old => ({
      ...old,
      connectServer: true,
    }));
    if (jsondata === undefined || (failed && !jsondata)) {
      if (!isOfflineHint) {
        ToastAndroid.show(tSync('utils.failedConnectAnimeServer'), ToastAndroid.SHORT);
      }
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
    // @ts-expect-error
    const history = await DatabaseManager.get('history');
    if (history) {
      try {
        const parsedHistory = JSON.parse(history);
        ToastAndroid.show(tSync('utils.optimizingHistory'), ToastAndroid.SHORT);
        await DANGER_MIGRATE_OLD_HISTORY(parsedHistory);
      } catch {}
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
      ToastAndroid.show(tSync('utils.deletingOldUpdate'), ToastAndroid.SHORT);
    }
  }, []);

  const fetchDomain = useCallback(async (signal: AbortSignal) => {
    await Promise.all([
      fetchLatestDomain(signal).catch(() => {}),
      fetchLatestAnimeIndoDomain(signal).catch(() => {}),
    ]).catch(() => {
      ToastAndroid.show(
        tSync('utils.failedDomainDefault'),
        ToastAndroid.SHORT,
      );
    });
  }, []);

  const checkNativeAppVersion = useCallback(async (signal: AbortSignal) => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
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
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);

    if (signal.aborted) return null;

    if (data === undefined) {
      return 'offline' as const;
    } else if (data.message && data.message.includes('Not Found')) {
      return true;
    } else if (data[0] === undefined) {
      return true;
    }

    const remoteVersion = data[0]?.tag_name || '';
    const cleanRemote = remoteVersion.replace(/[^0-9.]/g, '');
    const cleanCurrent = appVersion.replace(/[^0-9.]/g, '');

    const isNewer =
      cleanRemote.localeCompare(cleanCurrent, undefined, { numeric: true, sensitivity: 'base' }) > 0;

    if (!isNewer) {
      return true;
    }

    return data[0];
  }, []);

  const authRef = useRef({ user, confirmedNoProfile });
  useEffect(() => {
    authRef.current = { user, confirmedNoProfile };
  }, [user, confirmedNoProfile]);

  const connectToServers = useCallback(
    async (signal: AbortSignal, isOfflineHint: boolean = false) => {
      const animeData = await fetchAnimeData(signal, isOfflineHint);
      if (signal.aborted) return;
      if (animeData === undefined) {
        return;
      }

      const showAnimePref = await DatabaseManager.get('homeShowAnime');
      const isHomeEmpty = animeData.newAnime.length === 0 && showAnimePref !== 'false';
      const offlineList = offlineDownloadManager.getOfflineAnimeList();

      if (isOfflineHint && isHomeEmpty) {
        if (offlineList.length > 0) {
          ToastAndroid.show(tSync('utils.offlineOpeningDownloads'), ToastAndroid.LONG);
          props.navigation.dispatch(StackActions.replace('Home', { data: animeData }));
          return;
        }
        props.navigation.dispatch(StackActions.replace('FailedToConnect'));
        return;
      }

      const anime = animeData;
      const { user: currentUser, confirmedNoProfile: noProfile } = authRef.current;

      if (currentUser) {
        AsyncStorage.getItem('last_login_reward_date').then(lastDate => {
          const today = new Date().toDateString();
          if (lastDate !== today) {
            addExp(EXP_REWARDS.LOGIN);
            AsyncStorage.setItem('last_login_reward_date', today);
            ToastAndroid.show(tSync('utils.dailyLoginExp', { exp: EXP_REWARDS.LOGIN }), ToastAndroid.SHORT);
          }
        });
      }

      if (currentUser && noProfile) {
        props.navigation.dispatch(StackActions.replace('UsernameSetupScreen'));
      } else {
        props.navigation.dispatch(StackActions.replace('Home', { data: anime }));
      }
    },
    [fetchAnimeData, props.navigation, addExp],
  );

  useFocusEffect(
    useCallback(() => {
      const abortController = new AbortController();
      const signal = abortController.signal;

      (async () => {
        setLoadStatus({
          prepareDb: false,
          checkVersion: false,
          fetchDomain: false,
          connectServer: false,
        });
        await prepareData();
        if (signal.aborted) return;

        await deleteUnnecessaryUpdate();
        if (signal.aborted) return;

        setLoadStatus(old => ({
          ...old,
          prepareDb: true,
        }));

        const nativeAppVersion = await checkNativeAppVersion(signal);
        if (signal.aborted) return;

        if (nativeAppVersion === null) {
          const offlineList = offlineDownloadManager.getOfflineAnimeList();
          if (offlineList.length > 0) {
            ToastAndroid.show(tSync('utils.offlineOpeningDownloads'), ToastAndroid.LONG);
            props.navigation.dispatch(
              StackActions.replace('Home', { data: { newAnime: [], jadwalAnime: [] } }),
            );
            return;
          }
          props.navigation.dispatch(StackActions.replace('FailedToConnect'));
        } else if (nativeAppVersion === 'offline' || nativeAppVersion === true || __DEV__) {
          const isOfflineHint = nativeAppVersion === 'offline';
          let isOTADoneExecuted = false;
          async function OTADone() {
            if (isOTADoneExecuted || signal.aborted) return;
            isOTADoneExecuted = true;
            setLoadStatus(old => ({
              ...old,
              checkVersion: true,
            }));
            if (!isOfflineHint) {
              await fetchDomain(signal);
              if (signal.aborted) return;
            }
            setLoadStatus(old => ({
              ...old,
              fetchDomain: true,
            }));
            connectToServers(signal, isOfflineHint);
          }
          await OTADone();
        } else {
          const latestVersion = nativeAppVersion.tag_name;
          const changelog = nativeAppVersion.body;
          const download = nativeAppVersion.assets?.[0]?.browser_download_url || '';

          if (!download) {
            connectToServers(signal, false);
            return;
          }

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
    const completedSteps = STEP_KEYS.filter(key => loadStatus[key]).length;
    const progress = (completedSteps / STEP_KEYS.length) * 100;
    progressValueAnimation.set(withTiming(progress, { duration: 240 }));
  }, [loadStatus, progressValueAnimation]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressValueAnimation.get()}%`,
  }));

  const currentStepIndex = STEP_KEYS.findIndex(k => !loadStatus[k]);
  const activeStepLabel =
    currentStepIndex === -1
      ? t('utils.openingHome')
      : t(STEP_LABEL_KEYS[STEP_KEYS[currentStepIndex]]);

  const bgColors = isDark
    ? (['#0b1526', '#060911', '#040508'] as const)
    : (['#eef4fc', '#f8fafc', '#ffffff'] as const);

  return (
    <LinearGradient colors={bgColors} style={styles.screenBg}>
      <ScrollView
        style={styles.scrollFill}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + (isCompact ? 20 : 28),
            paddingBottom: Math.max(insets.bottom + 18, 26),
            paddingHorizontal: isCompact ? 24 : 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.topSpacer} />

        <View style={styles.centerBlock}>
          <NaoFlixLogo size={logoSize} style={styles.logoMargin} />

          <Text style={[styles.appName, { fontSize: isCompact ? 26 : 30 }]}>NaoFlix</Text>
          <Text style={styles.brandTagline}>{t('utils.connectBrandTagline')}</Text>

          <View style={[styles.progressTrackWrap, { width: progressBarWidth }]}>
            <View style={styles.progressBar}>
              <Reanimated.View style={[styles.progressFill, progressBarStyle]} />
            </View>
            <Text style={styles.activeStepText} numberOfLines={1}>
              {activeStepLabel}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLinks}>
            <TouchableOpacity
              activeOpacity={0.65}
              hitSlop={10}
              onPress={() => Linking.openURL('https://github.com/Naotica2')}
              style={styles.footerLinkItem}>
              <Icon name="github" size={14} color={isDark ? '#94a3b8' : '#475569'} />
              <Text style={styles.footerLinkText}>GitHub</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity
              activeOpacity={0.65}
              hitSlop={10}
              onPress={() => Linking.openURL('https://saweria.co/naotica')}
              style={styles.footerLinkItem}>
              <Icon name="coffee" size={13} color={isDark ? '#94a3b8' : '#475569'} />
              <Text style={styles.footerLinkText}>{t('common.donate')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.versionText}>
            {appVersion} • JS_{OTAJSVersion}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function useStyles(isDark: boolean) {
  return useMemo(
    () =>
      StyleSheet.create({
        screenBg: {
          flex: 1,
        },
        scrollFill: {
          flex: 1,
        },
        container: {
          flexGrow: 1,
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        topSpacer: {
          height: 24,
        },
        centerBlock: {
          width: '100%',
          maxWidth: 320,
          alignItems: 'center',
        },
        logoMargin: {
          marginBottom: 18,
        },
        appName: {
          fontWeight: '800',
          color: isDark ? '#f8fafc' : '#0f172a',
          letterSpacing: 0.4,
        },
        brandTagline: {
          fontSize: 10,
          fontWeight: '600',
          color: isDark ? '#64748b' : '#94a3b8',
          letterSpacing: 2.2,
          marginTop: 6,
          marginBottom: 32,
        },
        progressTrackWrap: {
          alignItems: 'center',
        },
        progressBar: {
          height: 3.5,
          width: '100%',
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
          borderRadius: 999,
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          backgroundColor: '#3b82f6',
          borderRadius: 999,
        },
        activeStepText: {
          fontSize: 12,
          color: isDark ? '#94a3b8' : '#64748b',
          fontWeight: '500',
          marginTop: 12,
        },
        footer: {
          alignItems: 'center',
          paddingTop: 16,
          width: '100%',
        },
        footerLinks: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        },
        footerLinkItem: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingHorizontal: 8,
          gap: 6,
        },
        footerLinkText: {
          fontSize: 12,
          fontWeight: '600',
          color: isDark ? '#94a3b8' : '#475569',
        },
        footerDot: {
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: isDark ? '#334155' : '#cbd5e1',
          marginHorizontal: 6,
        },
        socialButton: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#141418' : '#ffffff',
          paddingVertical: 7,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e2e8f0',
        },
        socialButtonText: {
          fontSize: 12,
          fontWeight: '600',
          color: isDark ? '#d4d4d8' : '#334155',
          marginLeft: 7,
        },
        versionText: {
          fontSize: 11,
          color: isDark ? '#475569' : '#94a3b8',
          fontWeight: '500',
          letterSpacing: 0.3,
        },
      }),
    [isDark],
  );
}

export default Loading;
