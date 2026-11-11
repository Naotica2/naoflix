import React, { memo, useCallback, useMemo, useState } from 'react';
import { Linking, StyleProp, Text, TextStyle, ToastAndroid } from 'react-native';
import { tSync } from '../../misc/LanguageContext';
import { parseSpoilerAndUrlSegments } from '../../types/forum';

interface Props {
  text: string;
  isDark: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

function ForumRichText({ text, isDark, style, numberOfLines }: Props) {
  const segments = useMemo(() => parseSpoilerAndUrlSegments(text), [text]);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});

  const toggleSpoiler = useCallback((idx: number) => {
    setRevealedSpoilers(prev => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const openUrl = useCallback((rawUrl: string) => {
    if (!/^https?:\/\//i.test(rawUrl)) return;
    Linking.openURL(rawUrl).catch(() => {
      ToastAndroid.show(tSync('common.error'), ToastAndroid.SHORT);
    });
  }, []);

  if (!text) return null;

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, idx) => {
        if (seg.isSpoiler) {
          const isShown = Boolean(revealedSpoilers[idx]);
          return (
            <Text
              key={idx}
              onPress={() => toggleSpoiler(idx)}
              style={{
                backgroundColor: isShown
                  ? isDark
                    ? '#27272a'
                    : '#e4e4e7'
                  : isDark
                    ? '#3f3f46'
                    : '#27272a',
                color: isShown ? (isDark ? '#e4e4e7' : '#18181b') : 'transparent',
                borderRadius: 4,
              }}>
              {isShown ? ` ${seg.text} ` : ` ${seg.text.replace(/\S/g, '\u2588')} `}
            </Text>
          );
        }

        if (seg.isUrl) {
          return (
            <Text
              key={idx}
              onPress={() => openUrl(seg.text)}
              style={{
                color: '#3b82f6',
                textDecorationLine: 'underline',
              }}>
              {seg.text}
            </Text>
          );
        }

        return <Text key={idx}>{seg.text}</Text>;
      })}
    </Text>
  );
}

export default memo(ForumRichText);
