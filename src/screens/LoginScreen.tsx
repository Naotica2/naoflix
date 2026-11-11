import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import { supabase } from '../config/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigator } from '../types/navigation';
import { useAuth } from '../misc/AuthContext';
import { tSync, useLanguage } from '../misc/LanguageContext';
import NaoFlixLogo from '../component/misc/NaoFlixLogo';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackNavigator>>();
  const { user, hasProfile, confirmedNoProfile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isCompact = width < 360 || height < 640;
  const logoSize = Math.round(Math.min(96, Math.max(76, width * 0.22)));
  const horizontalPad = isCompact ? 24 : 32;

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
        ToastAndroid.show(tSync('auth.loginFailed', { message: error.message }), ToastAndroid.LONG);
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: string }).code;
        if (code === statusCodes.SIGN_IN_CANCELLED) {
          return;
        }
        if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          ToastAndroid.show(tSync('auth.googlePlayUnavailable'), ToastAndroid.LONG);
          return;
        }
      }
      const msg = error instanceof Error ? error.message : tSync('common.unknown');
      ToastAndroid.show(tSync('auth.loginSystemError', { message: msg }), ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  }, []);

  const bgColors = isDark
    ? (['#0b1526', '#060911', '#040508'] as const)
    : (['#eef4fc', '#f8fafc', '#ffffff'] as const);

  return (
    <LinearGradient colors={bgColors} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPad,
            paddingTop: insets.top + (isCompact ? 20 : 28),
            paddingBottom: Math.max(insets.bottom + 20, 28),
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.topSpacer} />

        <View style={styles.brandSection}>
          <NaoFlixLogo size={logoSize} style={styles.logoMargin} />
          <Text
            style={[
              styles.appName,
              {
                fontSize: isCompact ? 26 : 30,
                color: isDark ? '#f8fafc' : '#0f172a',
              },
            ]}>
            NaoFlix
          </Text>
          <Text style={[styles.tagline, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            {t('auth.loginSubtitle')}
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[
              styles.googleButton,
              loading && styles.googleButtonDisabled,
              !isDark && styles.googleButtonLight,
            ]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.78}>
            {loading ? (
              <ActivityIndicator color="#111827" size="small" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>{t('auth.signInWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={[styles.disclaimer, { color: isDark ? '#64748b' : '#94a3b8' }]}>
            {t('auth.loginTerms')}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topSpacer: {
    height: 16,
  },
  brandSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 340,
    paddingVertical: 16,
  },
  logoMargin: {
    marginBottom: 18,
  },
  appName: {
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSection: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingBottom: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    elevation: 2,
  },
  googleButtonLight: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    elevation: 0,
  },
  googleButtonDisabled: { opacity: 0.6 },
  googleIcon: { width: 20, height: 20, marginRight: 12 },
  googleButtonText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  disclaimer: {
    fontSize: 11,
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default memo(LoginScreen);
