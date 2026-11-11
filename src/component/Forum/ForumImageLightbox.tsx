import MaterialIcons from '@react-native-vector-icons/material-icons';
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ForumMediaItem } from '../../types/forum';
import ForumImage from './ForumImage';

interface Props {
  visible: boolean;
  images: ForumMediaItem[];
  initialIndex: number;
  onClose: () => void;
}

function ForumImageLightbox({ visible, images, initialIndex, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<ForumMediaItem>>(null);

  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: Math.max(0, Math.min(initialIndex, images.length - 1)),
          animated: false,
        });
      }, 30);
    }
  }, [visible, initialIndex, images.length]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {images.length}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <MaterialIcons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, idx) => `${item.url}-${idx}`}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
            setActiveIndex(idx);
          }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
              <ForumImage
                uri={item.url}
                contentFit="contain"
                style={{ width, height: height * 0.84 }}
              />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default memo(ForumImageLightbox);
