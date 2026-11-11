import React, { memo } from 'react';
import { Image, StyleSheet, useColorScheme, View, ViewStyle } from 'react-native';
import { NAOFLIX_LOGO_DATA_URI } from '../../assets/naoflixLogoData';

interface NaoFlixLogoProps {
  size?: number;
  style?: ViewStyle;
}

function NaoFlixLogo({ size = 80, style }: NaoFlixLogoProps) {
  const isDark = useColorScheme() === 'dark';
  const radius = Math.round(size * 0.24);
  const innerImageSize = Math.round(size * 1.38);

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
        },
        style,
      ]}>
      <Image
        source={{ uri: NAOFLIX_LOGO_DATA_URI }}
        style={{
          width: innerImageSize,
          height: innerImageSize,
        }}
        resizeMode="cover"
        fadeDuration={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071529',
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
});

export default memo(NaoFlixLogo);
