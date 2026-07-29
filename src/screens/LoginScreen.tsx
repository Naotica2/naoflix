import React, { memo, useCallback, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import { supabase } from '../config/supabaseClient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackNavigator } from '../types/navigation';
import { useAuth } from '../misc/AuthContext';
import { useColorScheme } from 'react-native';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { user, hasProfile, confirmedNoProfile } = useAuth();
  const isDark = useColorScheme() === 'dark';

  useEffect(() => {
    if (user) {
      if (confirmedNoProfile) {
        navigation.replace('UsernameSetupScreen');
      } else if (hasProfile) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.replace('connectToServer');
        }
      }
    }
  }, [user, hasProfile, confirmedNoProfile, navigation]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();

      let idToken: string | null = null;
      if (signInResult && 'data' in signInResult && signInResult.data) {
        idToken = signInResult.data.idToken;
      }
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) {
        ToastAndroid.show('Login gagal: ' + error.message, ToastAndroid.LONG);
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: string }).code;
        if (code === statusCodes.SIGN_IN_CANCELLED) {
          return;
        }
        if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          ToastAndroid.show('Google Play Services tidak tersedia', ToastAndroid.LONG);
          return;
        }
      }
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      ToastAndroid.show(msg, ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <View style={styles.content}>
        <View style={[styles.logoContainer, { backgroundColor: isDark ? '#111' : '#f5f5f5', borderColor: isDark ? '#222' : '#ddd' }]}>
          <Text style={[styles.logoText, { color: isDark ? '#fff' : '#000' }]}>N</Text>
          <View style={styles.logoGlow} />
        </View>
        <Text style={[styles.appName, { color: isDark ? '#fff' : '#000' }]}>NaoFlix</Text>
        <Text style={styles.tagline}>Stream anime favoritmu</Text>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.googleButtonDisabled, !isDark && styles.googleButtonLight]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.7}>
            {loading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            Dengan masuk, kamu menyetujui ketentuan layanan NaoFlix
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  logoContainer: {
    width: 100, height: 100, borderRadius: 24, backgroundColor: '#111',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#222',
  },
  logoGlow: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  logoText: { fontSize: 48, fontWeight: '800', color: '#ffffff', letterSpacing: -2 },
  appName: { fontSize: 32, fontWeight: '700', color: '#ffffff', letterSpacing: 1, marginBottom: 8 },
  tagline: { fontSize: 14, color: '#666', letterSpacing: 0.5, marginBottom: 60 },
  bottomSection: { position: 'absolute', bottom: 60, left: 40, right: 40, alignItems: 'center' },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 24,
    width: '100%', elevation: 2,
  },
  googleButtonLight: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', elevation: 0 },
  googleButtonDisabled: { opacity: 0.6 },
  googleIcon: { width: 20, height: 20, marginRight: 12 },
  googleButtonText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  disclaimer: { fontSize: 11, color: '#888', marginTop: 16, textAlign: 'center' },
});

export default memo(LoginScreen);
