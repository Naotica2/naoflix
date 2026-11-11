import React, { memo } from 'react';
import { Image, ImageStyle, StyleProp, UIManager } from 'react-native';

const hasExpoImageView = (() => {
  try {
    return Boolean(UIManager.getViewManagerConfig('ExpoImage'));
  } catch {
    return false;
  }
})();

const ExpoImageComponent: React.ComponentType<any> | null = (() => {
  if (!hasExpoImageView) return null;
  try {
    return require('expo-image').Image as React.ComponentType<any>;
  } catch {
    return null;
  }
})();

interface ForumImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'scale-down';
  recyclingKey?: string;
  blurRadius?: number;
  autoplay?: boolean;
  accessibilityLabel?: string;
  onError?: () => void;
  onLoad?: () => void;
}

function ForumImage({
  uri,
  style,
  contentFit = 'cover',
  recyclingKey,
  blurRadius = 0,
  autoplay = true,
  accessibilityLabel,
  onError,
  onLoad,
}: ForumImageProps) {
  if (ExpoImageComponent) {
    return (
      <ExpoImageComponent
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey || uri}
        transition={140}
        autoplay={autoplay}
        blurRadius={blurRadius > 0 ? blurRadius : undefined}
        accessibilityLabel={accessibilityLabel}
        onError={onError}
        onLoad={onLoad}
      />
    );
  }

  const resizeMode =
    contentFit === 'contain' ? 'contain' : contentFit === 'fill' ? 'stretch' : 'cover';

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      blurRadius={blurRadius > 0 ? blurRadius : undefined}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
      onLoad={onLoad}
    />
  );
}

export default memo(ForumImage);
