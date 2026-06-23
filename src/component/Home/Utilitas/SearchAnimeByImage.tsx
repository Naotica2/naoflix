import Icon from '@react-native-vector-icons/fontawesome';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { memo, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
  ScrollView,
} from 'react-native';
import { TouchableNativeFeedback } from 'react-native-gesture-handler';
import useGlobalStyles from '../../../assets/style';
import ImageLoading from '../../misc/ImageLoading';

interface TagConfidence {
  label: string;
  confidence: number;
}

interface FruatreFinderResult {
  status: boolean;
  creator: string;
  error?: string;
  result?: {
    prompt: string;
    rating: TagConfidence[];
    character: {
      name: string;
      list: TagConfidence[];
    };
    tags: {
      name: string;
      list: TagConfidence[];
    };
  };
}

function SearchAnimeByImage() {
  const globalStyles = useGlobalStyles();
  const [searchResult, setSearchResult] = useState<FruatreFinderResult | null>(null);
  const [choosenImage, setChoosenImage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const styles = useStyles();
  const colorScheme = useColorScheme();

  const handlePickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: false,
      });

      if (result.canceled) return;

      const uri = result.assets?.[0].uri;
      setChoosenImage(uri);
      setIsLoading(true);
      setSearchResult(null);

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'image.png',
        type: 'image/png',
      } as any);

      const response = await fetch('https://api.fruatre.my.id/api/anime/anime-finder', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      if (!json.status) {
        ToastAndroid.show(json.error || 'Terjadi kesalahan!', ToastAndroid.SHORT);
      }
      setSearchResult(json);
    } catch (e) {
      ToastAndroid.show('Gagal menghubungi server', ToastAndroid.SHORT);
    } finally {
      setIsLoading(false);
    }
  };

  const highestRating = searchResult?.result?.rating?.sort((a, b) => b.confidence - a.confidence)[0];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <TouchableNativeFeedback
          background={TouchableNativeFeedback.Ripple(
            colorScheme === 'dark' ? '#3a3a3a' : '#e0e0e0',
            false,
          )}
          onPress={handlePickImage}>
          <View style={styles.imagePicker}>
            <Icon
              name="image"
              size={32}
              color={colorScheme === 'dark' ? '#BB86FC' : '#6200EE'}
            />
            <Text style={styles.imagePickerText}>Pilih Gambar</Text>
            <Text style={styles.imagePickerSubtext}>Gunakan API Fruatre Finder</Text>
          </View>
        </TouchableNativeFeedback>
      </View>

      <View style={styles.imagePreviewContainer}>
        {choosenImage ? (
          <ImageLoading
            source={{ uri: choosenImage }}
            style={styles.selectedImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <Icon name="image" size={48} color={colorScheme === 'dark' ? '#555' : '#aaa'} />
            <Text style={styles.placeholderText}>Pilih gambar karakter anime</Text>
          </View>
        )}
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colorScheme === 'dark' ? '#BB86FC' : '#6200EE'} />
          <Text style={styles.loadingText}>Menganalisis gambar...</Text>
        </View>
      )}

      {searchResult?.result && !isLoading && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.resultContainer}>
              <Text style={styles.sectionTitle}>Karakter Terdeteksi</Text>
              {searchResult.result!.character?.list?.length > 0 ? (
                searchResult.result!.character.list.slice(0, 5).map((char, i) => (
                  <View key={i} style={styles.tagRow}>
                    <Text style={styles.tagLabel}>{char.label}</Text>
                    <Text style={styles.tagConfidence}>{(char.confidence * 100).toFixed(1)}%</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.unknownText}>Tidak ada karakter spesifik yang terdeteksi</Text>
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Rating Konten</Text>
              <View style={styles.tagRow}>
                <Text style={[styles.tagLabel, { textTransform: 'capitalize', color: highestRating?.label === 'explicit' ? '#ef4444' : globalStyles.text.color }]}>
                  {highestRating?.label || 'Unknown'}
                </Text>
                <Text style={styles.tagConfidence}>{((highestRating?.confidence || 0) * 100).toFixed(1)}%</Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>Atribut Terdeteksi</Text>
              <View style={styles.tagsWrapper}>
                {searchResult.result!.tags?.list?.slice(0, 15).map((tag, i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{tag.label}</Text>
                  </View>
                ))}
              </View>
            </View>
        </ScrollView>
      )}
    </View>
  );
}

function useStyles() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          paddingHorizontal: 16,
          backgroundColor: isDark ? '#121212' : '#f5f5f7',
        },
        card: {
          backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          borderRadius: 12,
          overflow: 'hidden',
          elevation: 2,
          marginBottom: 16,
          marginTop: 16,
        },
        imagePicker: {
          padding: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        imagePickerText: {
          fontSize: 18,
          fontWeight: '500',
          color: isDark ? '#E0E0E0' : '#333',
          marginTop: 4,
        },
        imagePickerSubtext: {
          fontSize: 12,
          color: isDark ? '#AAA' : '#777',
          marginTop: 2,
        },
        imagePreviewContainer: {
          width: '100%',
          height: 180,
          backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          borderRadius: 12,
          marginBottom: 16,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          elevation: 2,
        },
        selectedImage: {
          width: '100%',
          height: '100%',
        },
        placeholderContainer: {
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        },
        placeholderText: {
          fontSize: 14,
          color: isDark ? '#777' : '#AAA',
          marginTop: 12,
          textAlign: 'center',
        },
        loadingContainer: {
          alignItems: 'center',
          padding: 24,
        },
        loadingText: {
          marginTop: 12,
          color: isDark ? '#E0E0E0' : '#555',
          fontSize: 14,
        },
        resultContainer: {
          backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          elevation: 2,
        },
        sectionTitle: {
          fontSize: 15,
          fontWeight: 'bold',
          color: isDark ? '#E0E0E0' : '#333',
          marginBottom: 10,
        },
        tagRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        },
        tagLabel: {
          fontSize: 14,
          color: isDark ? '#ccc' : '#444',
          flex: 1,
          textTransform: 'capitalize',
        },
        tagConfidence: {
          fontSize: 13,
          fontWeight: 'bold',
          color: isDark ? '#BB86FC' : '#6200EE',
        },
        unknownText: {
          fontSize: 13,
          color: isDark ? '#888' : '#aaa',
          fontStyle: 'italic',
        },
        divider: {
          height: 1,
          backgroundColor: isDark ? '#333' : '#eee',
          marginVertical: 12,
        },
        tagsWrapper: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        chip: {
          backgroundColor: isDark ? '#2C2C2C' : '#EAEAEA',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 16,
        },
        chipText: {
          fontSize: 12,
          color: isDark ? '#E0E0E0' : '#333',
        },
      }),
    [isDark],
  );
}

export default memo(SearchAnimeByImage);
