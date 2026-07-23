import React, { memo, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useBatteryLevel } from 'react-native-nitro-device-info';
import { useTheme } from 'react-native-paper';
import { useSharedValue } from 'react-native-reanimated';
import { OTAJSVersion, version } from '../../../package.json';
import { useFocusEffect } from '@react-navigation/native';
import ReText from '../misc/ReText';

function useLocalTime() {
  const time = useSharedValue(new Date().toLocaleTimeString());
  const currTime = useRef<string>('');
  useFocusEffect(
    useCallback(() => {
      time.set(new Date().toLocaleTimeString());
      const interval = setInterval(() => {
        const string = new Date().toLocaleTimeString();
        if (currTime.current !== string) {
          time.set(string);
          currTime.current = string;
        }
      }, 500);
      return () => clearInterval(interval);
    }, [time]),
  );
  return time;
}

function HeaderInfoComponent() {
  const isDark = useColorScheme() === 'dark';
  const theme = useTheme();
  const localTime = useLocalTime();
  const battery = useBatteryLevel();

  const styles = useMemo(() => makeStyles(isDark, theme), [isDark, theme]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.logo}>NaoFlix</Text>
        <View style={styles.infoRow}>
          <ReText style={styles.infoText} text={localTime} />
          <View style={styles.dot} />
          <Text style={styles.infoText}>{Math.round((battery ?? 0) * 100)}%</Text>
          <View style={styles.dot} />
          <Text style={styles.versionText}>{version}</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(isDark: boolean, theme: any) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    logo: {
      fontSize: 22,
      fontWeight: '800',
      color: theme?.colors?.primary ?? '#3b82f6',
      letterSpacing: -0.5,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    infoText: {
      fontSize: 12,
      color: isDark ? '#888' : '#999',
      fontWeight: '500',
    },
    versionText: {
      fontSize: 11,
      color: isDark ? '#555' : '#bbb',
      fontWeight: '500',
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: isDark ? '#444' : '#ccc',
    },
  });
}

export default memo(HeaderInfoComponent);
