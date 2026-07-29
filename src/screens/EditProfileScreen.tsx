import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ToastAndroid,
  ScrollView,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../config/supabaseClient';
import { useAuth } from '../misc/AuthContext';
import { uploadAvatar, uploadBanner } from '../utils/profileStorage';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = width * (9 / 16);
const AVATAR_SIZE = 96;

function EditProfileScreen() {
  const { profile, user, refreshProfile } = useAuth();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url || null);
  const [bannerUri, setBannerUri] = useState<string | null>(profile?.banner_url || null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [bannerChanged, setBannerChanged] = useState(false);

  const pickImage = async (type: 'avatar' | 'banner') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileSize = result.assets[0].size || 0;
      const sizeInMB = fileSize / (1024 * 1024);

      if (type === 'avatar') {
        if (sizeInMB > 4) {
          ToastAndroid.show('Avatar maksimal 4MB', ToastAndroid.LONG);
          return;
        }
        setAvatarUri(fileUri);
        setAvatarChanged(true);
      } else {
        if (sizeInMB > 6) {
          ToastAndroid.show('Banner maksimal 6MB', ToastAndroid.LONG);
          return;
        }
        setBannerUri(fileUri);
        setBannerChanged(true);
      }
    } catch (err) {
      console.warn('Error picking image:', err);
    }
  };

  const handleSave = useCallback(async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      let finalAvatarUrl = profile?.avatar_url;
      let finalBannerUrl = profile?.banner_url;

      if (avatarChanged && avatarUri) {
        const { url, error } = await uploadAvatar(user.id, avatarUri);
        if (error) throw new Error(error);
        if (url) finalAvatarUrl = url;
      }

      if (bannerChanged && bannerUri) {
        const { url, error } = await uploadBanner(user.id, bannerUri);
        if (error) throw new Error(error);
        if (url) finalBannerUrl = url;
      }

      const { error } = await supabase.from('profiles').update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || '',
        avatar_url: finalAvatarUrl,
        banner_url: finalBannerUrl,
      }).eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      ToastAndroid.show('Profil berhasil diperbarui!', ToastAndroid.SHORT);
      navigation.goBack();
    } catch (e: any) {
      ToastAndroid.show(`Gagal menyimpan: ${e.message}`, ToastAndroid.LONG);
    } finally {
      setIsSaving(false);
    }
  }, [user, profile, avatarUri, bannerUri, avatarChanged, bannerChanged, displayName, bio, navigation, refreshProfile]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={24} color={isDark ? '#fff' : '#111'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profil</Text>
        <TouchableOpacity 
          style={styles.saveBtn} 
          onPress={handleSave} 
          disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <Text style={styles.saveBtnText}>Simpan</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Banner Section */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: isDark ? '#aaa' : '#666' }]}>Banner Profil (Maks 6MB, GIF support)</Text>
          <TouchableOpacity 
            style={[styles.bannerContainer, { backgroundColor: isDark ? '#1a1a1a' : '#e0e0e0' }]} 
            activeOpacity={0.8}
            onPress={() => pickImage('banner')}>
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={styles.bannerImg} />
            ) : (
              <MaterialIcons name="add-photo-alternate" size={40} color={isDark ? '#444' : '#999'} />
            )}
            <View style={styles.editOverlay}>
              <MaterialIcons name="edit" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Avatar Section */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: isDark ? '#aaa' : '#666' }]}>Avatar Profil (Maks 4MB, GIF support)</Text>
          <TouchableOpacity 
            style={[styles.avatarContainer, { backgroundColor: isDark ? '#1a1a1a' : '#ddd' }]} 
            activeOpacity={0.8}
            onPress={() => pickImage('avatar')}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarPlaceholderText}>
                {(displayName || profile?.username || '?').charAt(0).toUpperCase()}
              </Text>
            )}
            <View style={styles.editOverlay}>
              <MaterialIcons name="edit" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Display Name Section */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: isDark ? '#aaa' : '#666' }]}>Nama Tampilan</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: isDark ? '#111' : '#fff',
              color: isDark ? '#fff' : '#111',
              borderColor: isDark ? '#333' : '#ddd'
            }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Masukkan nama tampilan"
            placeholderTextColor={isDark ? '#555' : '#999'}
            maxLength={30}
          />
        </View>

        {/* Bio Section */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: isDark ? '#aaa' : '#666' }]}>Bio (Maks 160 Karakter)</Text>
          <TextInput
            style={[styles.input, styles.bioInput, { 
              backgroundColor: isDark ? '#111' : '#fff',
              color: isDark ? '#fff' : '#111',
              borderColor: isDark ? '#333' : '#ddd'
            }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tulis sesuatu tentang dirimu..."
            placeholderTextColor={isDark ? '#555' : '#999'}
            maxLength={160}
            multiline
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: isDark ? '#555' : '#999' }]}>
            {bio.length}/160
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#000000' : '#f8f9fa' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#333' : '#ddd',
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#111' },
    saveBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    saveBtnText: { color: '#6366f1', fontWeight: '700', fontSize: 16 },
    content: { padding: 16, paddingBottom: 40 },
    section: { marginBottom: 24 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
    bannerContainer: {
      width: '100%',
      height: BANNER_HEIGHT,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    bannerImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarContainer: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarPlaceholderText: { fontSize: 36, fontWeight: '700', color: '#fff' },
    editOverlay: {
      position: 'absolute',
      bottom: '10%',
      right: '10%',
      backgroundColor: 'rgba(0,0,0,0.6)',
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#000',
    },
    input: {
      width: '100%',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
    },
    bioInput: {
      height: 100,
      paddingTop: 12,
    },
    charCount: {
      alignSelf: 'flex-end',
      fontSize: 12,
      marginTop: 4,
    },
  });
}

export default memo(EditProfileScreen);
