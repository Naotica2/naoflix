import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { useAuth } from '../misc/AuthContext';
import { supabase } from '../config/supabaseClient';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function UsernameSetupScreen() {
  const { user, hasProfile, refreshProfile, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasProfile) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('connectToServer');
      }
    }
  }, [hasProfile, navigation]);

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? '';

  useEffect(() => {
    setErrorMsg('');
    setIsAvailable(null);

    if (username.length === 0) return;
    if (username.length < 3) {
      setErrorMsg('Minimal 3 karakter');
      return;
    }
    if (username.length > 20) {
      setErrorMsg('Maksimal 20 karakter');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setErrorMsg('Hanya huruf, angka, dan underscore');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsChecking(true);
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .maybeSingle();
      setIsAvailable(!data);
      if (data) setErrorMsg('Username sudah dipakai');
      setIsChecking(false);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  const handleSubmit = useCallback(async () => {
    if (!user || username.length < 3 || !isAvailable) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        username: username.toLowerCase(),
        avatar_url: avatarUrl ?? null,
        display_name: fullName || null,
      });
      if (error) {
        const msg = error.code === '23505' ? 'Username sudah dipakai' : error.message;
        setErrorMsg(msg);
        ToastAndroid.show(msg, ToastAndroid.LONG);
      } else {
        await refreshProfile();
      }
    } catch (e) {
      ToastAndroid.show('Gagal menyimpan username', ToastAndroid.LONG);
    } finally {
      setIsSubmitting(false);
    }
  }, [user, username, isAvailable, avatarUrl, fullName, refreshProfile]);

  const canSubmit = username.length >= 3 && isAvailable === true && !isChecking && !errorMsg;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.greeting}>Halo, {fullName || 'User'}!</Text>
        <Text style={styles.subtitle}>Pilih username untuk profilmu</Text>
        <Text style={styles.warning}>Username tidak bisa diubah setelah disimpan</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor="#555"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          {isChecking && <ActivityIndicator size="small" color="#888" />}
          {!isChecking && isAvailable === true && username.length >= 3 && (
            <Text style={styles.checkOk}>✓</Text>
          )}
        </View>

        {errorMsg !== '' && <Text style={styles.errorText}>{errorMsg}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.7}>
          {isSubmitting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.submitText}>Lanjutkan</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Gunakan akun lain</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 20, borderWidth: 2, borderColor: '#222' },
  avatarPlaceholder: { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#fff' },
  greeting: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 4 },
  warning: { fontSize: 12, color: '#ef4444', marginBottom: 30, fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4,
    width: '100%', borderWidth: 1, borderColor: '#222',
  },
  atSign: { fontSize: 18, color: '#555', marginRight: 4, fontWeight: '600' },
  input: { flex: 1, fontSize: 18, color: '#fff', paddingVertical: 12 },
  checkOk: { fontSize: 18, color: '#22c55e', fontWeight: '700' },
  errorText: { color: '#ef4444', fontSize: 13, marginTop: 8, alignSelf: 'flex-start' },
  submitButton: {
    backgroundColor: '#fff', borderRadius: 28, paddingVertical: 14, width: '100%',
    alignItems: 'center', marginTop: 24,
  },
  submitDisabled: { opacity: 0.3 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#000' },
  signOutButton: { marginTop: 20, padding: 10 },
  signOutText: { color: '#555', fontSize: 13 },
});

export default memo(UsernameSetupScreen);
