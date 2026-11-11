import { useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import RNFetchBlob from 'react-native-blob-util';
import { tSync } from '../misc/LanguageContext';
import deviceUserAgent from './deviceUserAgent';
import DialogManager from './dialogManager';
import getStreamHeaders from './streamHeaders';

function useDownloadAnime() {
  const downloadAnime = useCallback(
    async (
      source: string,
      downloadSource: string[],
      _Title: string,
      resolution: string,
      force: boolean | undefined = false,
      callback: () => any,
    ) => {
      let Title = _Title.replace(/[/\\:*?"<>|]/g, '_');
      if (downloadSource.includes(source) && force === false) {
        DialogManager.alert(
          tSync('downloadAnime.continueTitle'),
          tSync('downloadAnime.continueDesc'),
          [
            {
              text: tSync('common.cancel'),
              onPress: () => null,
            },
            {
              text: tSync('downloadAnime.continueTitle').replace('?', ''),
              onPress: () => {
                downloadAnime(source, downloadSource, Title, resolution, true, callback);
              },
            },
          ],
        );
        return;
      }
      const sourceLength = downloadSource.filter(z => z === source).length;
      if (force === true && sourceLength > 0) {
        Title += ' (' + sourceLength + ')';
      }

      const isGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      if (isGranted || Number(Platform.Version) >= 29) {
        download();
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          download();
        } else {
          DialogManager.alert(
            tSync('downloadAnime.permissionDeniedTitle'),
            tSync('downloadAnime.permissionDeniedDesc'),
          );
        }
      }

      async function download() {
        if (source.includes('mp4upload')) {
          DialogManager.alert(
            tSync('downloadAnime.mp4uploadWarningTitle'),
            tSync('downloadAnime.mp4uploadWarningDesc'),
          );
        }
        RNFetchBlob.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            mime: 'video/mp4',
            title: Title + ' ' + resolution + '.mp4',
            path: RNFetchBlob.fs.dirs.LegacySDCardDir + '/Download/' + `${Title} ${resolution}.mp4`,
          },
        })
          .fetch('GET', source, {
            'User-Agent': deviceUserAgent,
            ...(getStreamHeaders(source) || {}),
          })
          .catch(() => {});
        callback?.();
      }
    },
    [],
  );
  return downloadAnime;
}

export default useDownloadAnime;
