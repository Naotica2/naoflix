import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Icon from '@react-native-vector-icons/fontawesome';

type EpisodeBoxProps = {
  number: number;
  isActive: boolean;
  isLastWatched: boolean;
  onPress: () => void;
  width: number;
};

const EpisodeBox = memo(({ number, isActive, isLastWatched, onPress, width }: EpisodeBoxProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = useStyles(isDark);

  const boxStyle = useMemo(() => {
    if (isActive) {
      return [styles.box, styles.boxActive, { width }];
    }
    if (isLastWatched) {
      return [styles.box, styles.boxLastWatched, { width }];
    }
    return [styles.box, { width }];
  }, [isActive, isLastWatched, width, styles]);

  const textStyle = useMemo(() => {
    if (isActive) return [styles.text, styles.textActive];
    if (isLastWatched) return [styles.text, styles.textLastWatched];
    return styles.text;
  }, [isActive, isLastWatched, styles]);

  return (
    <TouchableOpacity style={boxStyle} onPress={onPress} activeOpacity={0.7}>
      <Text style={textStyle} numberOfLines={1}>
        {number}
      </Text>
      {isLastWatched && !isActive && (
        <View style={styles.playIcon}>
          <Icon name="play" size={8} color="#3b82f6" />
        </View>
      )}
    </TouchableOpacity>
  );
});

function useStyles(isDark: boolean) {
  return useMemo(
    () =>
      StyleSheet.create({
        box: {
          height: 44,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isDark ? '#333' : '#ddd',
          backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        },
        boxActive: {
          backgroundColor: '#3b82f6',
          borderColor: '#3b82f6',
          shadowColor: '#3b82f6',
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
        },
        boxLastWatched: {
          borderLeftWidth: 3,
          borderLeftColor: '#3b82f6',
          backgroundColor: isDark ? '#1e2a3a' : '#eef4ff',
        },
        text: {
          fontSize: 14,
          fontWeight: '600',
          color: isDark ? '#e0e0e0' : '#333',
        },
        textActive: {
          color: '#fff',
          fontWeight: '700',
        },
        textLastWatched: {
          color: '#3b82f6',
          fontWeight: '700',
        },
        playIcon: {
          position: 'absolute',
          top: 3,
          right: 3,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [isDark],
  );
}

export default EpisodeBox;
