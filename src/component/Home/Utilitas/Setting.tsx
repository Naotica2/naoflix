import { Dropdown, IDropdownRef } from '@pirles/react-native-element-dropdown';
import Icon, { FontAwesomeIconName } from '@react-native-vector-icons/fontawesome';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Buffer } from 'buffer/';
import { reloadAppAsync } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import { AudioMixingMode } from 'expo-video';
import moment from 'moment';
import { JSX, memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Appearance,
  ColorSchemeName,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import {
  ActivityIndicator,
  Divider,
  List,
  Modal,
  Portal,
  Surface,
  Switch,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { useSharedValue } from 'react-native-reanimated';
import { createDocument } from 'react-native-saf-x';
import defaultDatabaseValue from '../../../misc/defaultDatabaseValue.json';
import { AppLanguage, useLanguage } from '../../../misc/LanguageContext';
import { HistoryItemKey } from '../../../types/databaseTarget';
import { HistoryJSON } from '../../../types/historyJSON';
import { UtilsStackNavigator } from '../../../types/navigation';
import watchLaterJSON from '../../../types/watchLaterJSON';
import {
  DANGER_MIGRATE_OLD_HISTORY,
  DatabaseManager,
  useKeyValueIfFocused,
  useModifiedKeyValueIfFocused,
} from '../../../utils/DatabaseManager';
import DialogManager from '../../../utils/dialogManager';
import offlineDownloadManager from '../../../utils/offlineDownloadManager';
import { invalidateSourceCache } from '../../../utils/sourcePreferences';
import ReText from '../../misc/ReText';
import { clearMyListsHistoryCache } from '../MyListsPage';
import { HistoryDatabaseCache } from '../Saya/History';
import UserStatsDash from '../../Profile/UserStatsDash';

const defaultDatabaseValueKeys = Object.keys(defaultDatabaseValue);

type BackupJSON = Omit<typeof defaultDatabaseValue, 'historyKeyCollectionsOrder'> & {
  history: string;
};

interface SettingsData {
  key: string;
  title: string;
  description: string;
  iconName: FontAwesomeIconName;
  iconColor?: string;
  rightComponent?: JSX.Element;
  handler: () => any;
}

type Props = NativeStackScreenProps<UtilsStackNavigator, 'Setting'>;

function safeParseArray<T = any>(raw: unknown): T[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function Setting(_props: Props) {
  const theme = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const enableBatteryTimeInfo = useKeyValueIfFocused('enableBatteryTimeInfo');

  const languageDropdown = useRef<IDropdownRef>(null);

  const appTheme = useKeyValueIfFocused('colorScheme');
  const appThemeDropdown = useRef<IDropdownRef>(null);

  const audioMixingMode = useKeyValueIfFocused('audioMixingMode');
  const AMMDropdown = useRef<IDropdownRef>(null);

  const batteryTimeInfoSwitch = enableBatteryTimeInfo === 'true';
  const batteryTimeSwitchHandler = useCallback(() => {
    const newValue = String(!batteryTimeInfoSwitch);
    DatabaseManager.set('enableBatteryTimeInfo', newValue);
  }, [batteryTimeInfoSwitch]);

  const nowPlayingNotificationSwitch = useModifiedKeyValueIfFocused(
    'enableNowPlayingNotification',
    res => res === 'true',
  );
  const nowPlayingNotificationSwitchHandler = useCallback(() => {
    const newValue = String(!nowPlayingNotificationSwitch);
    DatabaseManager.set('enableNowPlayingNotification', newValue);
  }, [nowPlayingNotificationSwitch]);

  const forumChatSwitch = useModifiedKeyValueIfFocused(
    'enableForumChat',
    res => res !== 'false',
    true,
  );
  const forumChatSwitchHandler = useCallback(() => {
    const newValue = String(!forumChatSwitch);
    DatabaseManager.set('enableForumChat', newValue);
  }, [forumChatSwitch]);

  const [modalVisible, setModalVisible] = useState(false);
  const modalText = useSharedValue('');

  const dropdownLanguageData = useMemo<{ label: string; value: AppLanguage }[]>(
    () => [
      { label: t('settings.languageId'), value: 'id' },
      { label: t('settings.languageEn'), value: 'en' },
    ],
    [t],
  );

  const dropdownThemeData = useMemo(
    () => [
      { label: t('settings.themeAuto'), value: 'auto' },
      { label: t('settings.themeLight'), value: 'light' },
      { label: t('settings.themeDark'), value: 'dark' },
    ],
    [t],
  );

  const dropdownAudioMixingData = useMemo<{ label: string; value: AudioMixingMode }[]>(
    () => [
      { label: t('settings.audioAuto'), value: 'auto' },
      { label: t('settings.audioDoNotMix'), value: 'doNotMix' },
      { label: t('settings.audioMix'), value: 'mixWithOthers' },
      { label: t('settings.audioDuck'), value: 'duckOthers' },
    ],
    [t],
  );

  const backupData = useCallback(async () => {
    try {
      const needsLegacyWritePermission = Number(Platform.Version) < 29;
      if (needsLegacyWritePermission) {
        const isGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (!isGranted) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            DialogManager.alert(
              t('settings.accessDeniedTitle'),
              t('settings.backupPermissionDenied'),
            );
            return;
          }
        }
      }

      const fileuri =
        'NaoFlix_backup_' + moment().format('YYYY-MM-DD_HH-mm-ss') + '.naoflix.txt';
      modalText.set(t('settings.backingUpModal'));
      setModalVisible(true);

      let encoded = '';
      let offlineCount = 0;
      try {
        const backupPayload = await DatabaseManager.getDataForBackup();
        offlineCount = safeParseArray(backupPayload.offlineAnimeList).length;
        encoded = Buffer.from(JSON.stringify(backupPayload), 'utf8').toString('base64');
      } finally {
        setModalVisible(false);
      }

      const backupFile = await createDocument(encoded, {
        initialName: fileuri,
        mimeType: 'text/plain',
      });
      if (backupFile) {
        DialogManager.alert(
          t('common.success'),
          t('settings.backupSuccess', { count: offlineCount }),
        );
      }
    } catch (e: any) {
      DialogManager.alert(
        t('common.error'),
        t('settings.backupFailed', { message: e?.message || t('common.unknown') }),
      );
    }
  }, [modalText, t]);

  const restoreHistoryOrWatchLater = useCallback(
    async (
      restoreDataFromBackup: (HistoryJSON | watchLaterJSON)[],
      target: 'history' | 'watchLater',
    ) => {
      if (!Array.isArray(restoreDataFromBackup)) return;
      const backupSnapshot = await DatabaseManager.getDataForBackup();
      const currentData = safeParseArray<HistoryJSON | watchLaterJSON>(backupSnapshot[target]);

      for (const result of restoreDataFromBackup) {
        if (!result || typeof result !== 'object' || typeof result.title !== 'string') {
          continue;
        }
        const dataINDEX = currentData.findIndex(
          val =>
            val.title?.trim() === result.title?.trim() &&
            val.isComics === result.isComics &&
            val.isMovie === result.isMovie,
        );

        if (dataINDEX >= 0) {
          if ((currentData[dataINDEX].date || 0) > (result.date || 0)) {
            continue;
          }
          currentData.splice(dataINDEX, 1);
        }
        currentData.push(result);
      }
      currentData.sort((a, b) => (b.date || 0) - (a.date || 0));
      if (target === 'history') {
        await DANGER_MIGRATE_OLD_HISTORY(currentData as HistoryJSON[]);
      } else {
        await DatabaseManager.set('watchLater', JSON.stringify(currentData));
      }
    },
    [],
  );

  const restoreSearchHistory = useCallback(async (restoreItems: string[]) => {
    if (!Array.isArray(restoreItems)) return;
    const rawCurrent = (await DatabaseManager.get('searchHistory')) ?? '[]';
    const currentSearchHistory = safeParseArray<string>(rawCurrent);
    [...restoreItems].reverse().forEach(val => {
      if (typeof val === 'string' && val.trim() && !currentSearchHistory.includes(val)) {
        currentSearchHistory.unshift(val);
      }
    });
    await DatabaseManager.set('searchHistory', JSON.stringify(currentSearchHistory));
  }, []);

  const restoreData = useCallback(async () => {
    let pickedUri: string | undefined;
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!doc.assets || doc.assets.length === 0) return;
      pickedUri = doc.assets[0].uri;

      const rawEncoded = await RNFetchBlob.fs.readFile(pickedUri, 'utf8');
      let backupDataJSON: BackupJSON | null = null;
      try {
        const decoded = Buffer.from(rawEncoded, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          backupDataJSON = parsed as BackupJSON;
        }
      } catch {
        backupDataJSON = null;
      }

      if (!backupDataJSON) {
        DialogManager.alert(t('common.error'), t('settings.restoreInvalid'));
        return;
      }

      modalText.set(t('settings.restoringModal'));
      setModalVisible(true);

      let offlineKept = 0;
      let offlineDropped = 0;
      let hadOfflineInBackup = false;
      let restoredExtensions = false;

      for (const value of Object.keys(backupDataJSON) as (keyof BackupJSON)[]) {
        if (!defaultDatabaseValueKeys.includes(value) && value !== 'history') {
          continue;
        }

        const rawField = backupDataJSON[value];
        if (typeof rawField !== 'string') {
          continue;
        }

        modalText.set(t('settings.restoreKeyModal', { key: value }));

        if (value === 'history' || value === 'watchLater') {
          const items = safeParseArray(rawField);
          await restoreHistoryOrWatchLater(items, value);
        } else if (value === 'searchHistory') {
          const searchItems = safeParseArray<string>(rawField);
          await restoreSearchHistory(searchItems);
        } else if (value === 'colorScheme') {
          Appearance.setColorScheme(
            rawField === 'auto' ? undefined : (rawField as ColorSchemeName),
          );
          await DatabaseManager.set('colorScheme', rawField);
        } else if (value === 'language') {
          const targetLang: AppLanguage = rawField === 'en' ? 'en' : 'id';
          await setLanguage(targetLang);
        } else if (value === 'offlineAnimeList') {
          const backupOfflineItems = safeParseArray<any>(rawField);
          hadOfflineInBackup = backupOfflineItems.length > 0;
          const existingCurrent = offlineDownloadManager.getOfflineAnimeList();
          const mergedMap = new Map<string, any>();

          for (const cur of existingCurrent) {
            if (cur && typeof cur.filePath === 'string' && cur.id) {
              const exists = await RNFetchBlob.fs.exists(cur.filePath).catch(() => false);
              if (exists) {
                mergedMap.set(cur.id, cur);
              }
            }
          }

          for (const item of backupOfflineItems) {
            if (!item || typeof item !== 'object' || typeof item.filePath !== 'string' || !item.id) {
              offlineDropped++;
              continue;
            }
            const exists = await RNFetchBlob.fs.exists(item.filePath).catch(() => false);
            if (exists) {
              const prev = mergedMap.get(item.id);
              mergedMap.set(
                item.id,
                prev
                  ? {
                      ...item,
                      lastPositionSeconds: Math.max(
                        Number(prev.lastPositionSeconds) || 0,
                        Number(item.lastPositionSeconds) || 0,
                      ),
                      downloadedAt: Math.max(
                        Number(prev.downloadedAt) || 0,
                        Number(item.downloadedAt) || 0,
                      ),
                    }
                  : item,
              );
              offlineKept++;
            } else {
              offlineDropped++;
            }
          }

          await DatabaseManager.set(
            'offlineAnimeList',
            JSON.stringify(Array.from(mergedMap.values())),
          );
        } else if (value === 'pausedDownloads') {
          const backupPaused = safeParseArray<any>(rawField).filter(
            entry =>
              entry &&
              typeof entry === 'object' &&
              typeof entry.id === 'string' &&
              typeof entry.filePath === 'string',
          );
          await DatabaseManager.set('pausedDownloads', JSON.stringify(backupPaused));
        } else {
          if (value === 'extensionPreferences') {
            restoredExtensions = true;
          }
          await DatabaseManager.set(value, rawField);
        }
      }

      HistoryDatabaseCache.clear();
      clearMyListsHistoryCache();
      if (restoredExtensions) {
        invalidateSourceCache();
      }
      await offlineDownloadManager.reloadFromStorage();

      const msg = hadOfflineInBackup
        ? `${t('settings.restoreSuccess')}\n\n${t('settings.restoreOfflineRevalidated', {
            kept: offlineKept,
            dropped: offlineDropped,
          })}`
        : t('settings.restoreSuccess');
      DialogManager.alert(t('common.success'), msg);
    } catch (e: any) {
      const errMessage =
        e?.message === 'Network Error'
          ? t('settings.errorNetwork')
          : t('settings.restoreFailed', { message: e?.message || t('common.unknown') });
      DialogManager.alert(t('common.error'), errMessage);
    } finally {
      setModalVisible(false);
      if (pickedUri) {
        await RNFetchBlob.fs.unlink(pickedUri).catch(() => {});
      }
    }
  }, [modalText, restoreHistoryOrWatchLater, restoreSearchHistory, setLanguage, t]);

  const clearHistory = useCallback(() => {
    DialogManager.alert(t('settings.clearHistoryTitle'), t('settings.clearHistoryConfirm'), [
      {
        text: t('common.cancel'),
      },
      {
        text: t('common.delete'),
        onPress: async () => {
          modalText.set(t('settings.clearingModal'));
          setModalVisible(true);
          await new Promise<void>(res => setTimeout(() => res(), 10));
          try {
            const keyOrder = safeParseArray<HistoryItemKey>(
              DatabaseManager.getSync('historyKeyCollectionsOrder') ?? '[]',
            );
            for (const key of keyOrder) {
              if (typeof key !== 'string') continue;
              const title = key.split(':').slice(1, -2).join(':');
              modalText.set(t('settings.clearingKeyModal', { title }));
              await DatabaseManager.delete(key);
            }
            await DatabaseManager.set('historyKeyCollectionsOrder', '[]');
            HistoryDatabaseCache.clear();
            clearMyListsHistoryCache();
            DialogManager.alert(t('common.success'), t('settings.clearHistorySuccess'));
          } catch (e: any) {
            DialogManager.alert(
              t('settings.clearHistoryFailed'),
              e?.message || t('common.unknown'),
            );
          } finally {
            setModalVisible(false);
          }
        },
      },
    ]);
  }, [modalText, t]);

  const dropdownStyles = useMemo(
    () => ({
      style: {
        width: 148,
        backgroundColor: theme.colors.elevation.level2,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 0,
      },
      containerStyle: {
        borderRadius: 8,
        backgroundColor: theme.colors.elevation.level2,
        borderWidth: 0,
      },
      itemTextStyle: {
        color: theme.colors.onSurface,
        fontSize: 13,
      },
      itemContainerStyle: {
        backgroundColor: theme.colors.elevation.level2,
      },
      selectedTextStyle: {
        color: theme.colors.onSurface,
        fontSize: 13,
      },
    }),
    [theme.colors.elevation.level2, theme.colors.onSurface],
  );

  const settingsData = useMemo<SettingsData[]>(
    () => [
      {
        key: 'language',
        title: t('settings.languageLabel'),
        description: t('settings.languageDesc'),
        iconName: 'language',
        rightComponent: (
          <Dropdown
            data={dropdownLanguageData}
            onChange={item => {
              void setLanguage(item.value);
            }}
            ref={languageDropdown}
            value={language}
            labelField="label"
            valueField="value"
            maxHeight={200}
            activeColor={theme.colors.primaryContainer}
            placeholderStyle={{ color: theme.colors.onSurfaceVariant }}
            {...dropdownStyles}
          />
        ),
        handler: () => {
          languageDropdown.current?.open();
        },
      },
      {
        key: 'theme',
        title: t('settings.colorSchemeLabel'),
        description: t('settings.colorSchemeDesc'),
        iconName: 'paint-brush',
        rightComponent: (
          <Dropdown
            data={dropdownThemeData}
            onChange={item => {
              if (item.value === 'light' || item.value === 'dark') {
                Appearance.setColorScheme(item.value);
              } else if (item.value === 'auto') {
                Appearance.setColorScheme(undefined);
              }
              DatabaseManager.set('colorScheme', item.value);
            }}
            ref={appThemeDropdown}
            value={appTheme}
            labelField="label"
            valueField="value"
            maxHeight={300}
            activeColor={theme.colors.primaryContainer}
            placeholderStyle={{ color: theme.colors.onSurfaceVariant }}
            {...dropdownStyles}
          />
        ),
        handler: () => {
          appThemeDropdown.current?.open();
        },
      },
      {
        key: 'audioMixing',
        title: t('settings.audioMixingLabel'),
        description: t('settings.audioMixingDesc'),
        iconName: 'music',
        rightComponent: (
          <Dropdown
            data={dropdownAudioMixingData}
            onChange={item => {
              DatabaseManager.set('audioMixingMode', item.value);
            }}
            ref={AMMDropdown}
            value={audioMixingMode}
            labelField="label"
            valueField="value"
            maxHeight={300}
            activeColor={theme.colors.primaryContainer}
            placeholderStyle={{ color: theme.colors.onSurfaceVariant }}
            {...dropdownStyles}
          />
        ),
        handler: () => {
          AMMDropdown.current?.open();
        },
      },
      {
        key: 'batteryTime',
        title: t('settings.batteryTimeLabel'),
        description: t('settings.batteryTimeDesc'),
        iconName: 'battery-3',
        rightComponent: (
          <Switch value={batteryTimeInfoSwitch} onValueChange={batteryTimeSwitchHandler} />
        ),
        handler: batteryTimeSwitchHandler,
      },
      {
        key: 'nowPlaying',
        title: t('settings.nowPlayingLabel'),
        description: t('settings.nowPlayingDesc'),
        iconName: 'bell',
        rightComponent: (
          <Switch
            value={nowPlayingNotificationSwitch}
            onValueChange={nowPlayingNotificationSwitchHandler}
          />
        ),
        handler: nowPlayingNotificationSwitchHandler,
      },
      {
        key: 'forumChat',
        title: t('settings.forumChatLabel'),
        description: t('settings.forumChatDesc'),
        iconName: 'comments',
        rightComponent: <Switch value={forumChatSwitch} onValueChange={forumChatSwitchHandler} />,
        handler: forumChatSwitchHandler,
      },
      {
        key: 'backup',
        title: t('settings.backupBtn'),
        description: t('settings.backupDesc'),
        iconName: 'cloud-upload',
        handler: backupData,
      },
      {
        key: 'restore',
        title: t('settings.restoreBtn'),
        description: t('settings.restoreDesc'),
        iconName: 'history',
        handler: restoreData,
      },
      {
        key: 'clearHistory',
        title: t('settings.clearHistoryBtn'),
        description: t('settings.clearHistoryDesc'),
        iconName: 'trash',
        iconColor: theme.colors.error,
        handler: clearHistory,
      },
      {
        key: 'reload',
        title: t('settings.reloadBtn'),
        description: t('settings.reloadDesc'),
        iconName: 'refresh',
        handler: () => {
          DialogManager.alert(t('settings.reloadTitle'), t('settings.reloadConfirm'), [
            {
              text: t('common.cancel'),
            },
            {
              text: t('common.ok'),
              onPress: () => {
                reloadAppAsync('setting.restart');
              },
            },
          ]);
        },
      },
      {
        key: 'homePrefs',
        title: t('settings.homePrefsBtn'),
        description: t('settings.homePrefsDesc'),
        iconName: 'home',
        handler: () => {
          _props.navigation.navigate('HomePreferences');
        },
      },
      {
        key: 'sourcePrefs',
        title: t('settings.sourcePrefsBtn'),
        description: t('settings.sourcePrefsDesc'),
        iconName: 'plug',
        handler: () => {
          _props.navigation.navigate('ExtensionManager');
        },
      },
      {
        key: 'donate',
        title: t('settings.donateTitle'),
        description: t('settings.donateDesc'),
        iconName: 'heart',
        iconColor: theme.colors.error,
        handler: () => {
          Linking.openURL('https://saweria.co/naotica');
        },
      },
      {
        key: 'about',
        title: t('settings.aboutBtnTitle'),
        description: t('settings.aboutBtnDesc'),
        iconName: 'info-circle',
        handler: () => {
          _props.navigation.navigate('About');
        },
      },
      {
        key: 'changelog',
        title: t('settings.changelogBtn'),
        description: t('settings.changelogDesc'),
        iconName: 'list-alt',
        handler: () => {
          _props.navigation.navigate('Changelog');
        },
      },
    ],
    [
      _props.navigation,
      appTheme,
      audioMixingMode,
      backupData,
      batteryTimeInfoSwitch,
      batteryTimeSwitchHandler,
      clearHistory,
      dropdownAudioMixingData,
      dropdownLanguageData,
      dropdownStyles,
      dropdownThemeData,
      forumChatSwitch,
      forumChatSwitchHandler,
      language,
      nowPlayingNotificationSwitch,
      nowPlayingNotificationSwitchHandler,
      restoreData,
      setLanguage,
      t,
      theme.colors.error,
      theme.colors.onSurfaceVariant,
      theme.colors.primaryContainer,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Portal>
        <Modal
          visible={modalVisible}
          contentContainerStyle={{
            backgroundColor: theme.colors.surface,
            margin: 20,
            padding: 24,
            borderRadius: 16,
            alignItems: 'center',
          }}>
          <ActivityIndicator size={24} style={{ marginBottom: 16 }} />
          <ReText
            style={{
              color: theme.colors.onSurface,
              textAlign: 'center',
              fontWeight: 'bold',
            }}
            text={modalText}
          />
        </Modal>
      </Portal>

      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        <UserStatsDash />

        {settingsData.map((item, index) => (
          <Surface
            key={item.key}
            elevation={0}
            style={{ backgroundColor: theme.colors.background }}>
            <TouchableRipple
              onPress={item.handler}
              rippleColor={theme.colors.primaryContainer}
              background={{ color: theme.colors.primaryContainer, foreground: true }}>
              <View>
                <List.Item
                  title={item.title}
                  description={item.description}
                  titleStyle={{
                    fontSize: 16,
                    fontWeight: '500',
                    color: item.iconColor || theme.colors.onSurface,
                  }}
                  descriptionStyle={{
                    color: theme.colors.onSurfaceVariant,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                  descriptionNumberOfLines={3}
                  left={() => (
                    <View style={{ justifyContent: 'center', paddingLeft: 8, paddingRight: 8 }}>
                      <Icon
                        name={item.iconName}
                        size={20}
                        color={item.iconColor || theme.colors.primary}
                      />
                    </View>
                  )}
                  right={() =>
                    item.rightComponent ? (
                      <View style={{ justifyContent: 'center', paddingRight: 8 }}>
                        {item.rightComponent}
                      </View>
                    ) : null
                  }
                />
                {index < settingsData.length - 1 && <Divider style={{ marginLeft: 56 }} />}
              </View>
            </TouchableRipple>
          </Surface>
        ))}

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: theme.colors.elevation.level1,
              borderColor: theme.colors.outlineVariant,
            },
          ]}>
          <View style={styles.infoCardHeader}>
            <Icon name="info-circle" size={16} color={theme.colors.primary} />
            <Text style={[styles.infoCardTitle, { color: theme.colors.onSurface }]}>
              {t('settings.storageInfoTitle')}
            </Text>
          </View>
          <Text style={[styles.infoCardItem, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.storageInfoUpdate')}
          </Text>
          <Text style={[styles.infoCardItem, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.storageInfoClearData')}
          </Text>
          <Text style={[styles.infoCardItem, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.storageInfoBackup')}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  infoCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  infoCardItem: {
    fontSize: 12,
    lineHeight: 18,
  },
});

export default memo(Setting);
