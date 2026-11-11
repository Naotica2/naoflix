import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, useColorScheme } from 'react-native';
import { Appbar, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { UtilsStackNavigator, RootStackNavigator } from '../../types/navigation';
import { TranslationKey, useLanguage } from '../../misc/LanguageContext';
import About from './Utilitas/About';
import Changelog from './Utilitas/Changelog';
import SearchAnimeByImage from './Utilitas/SearchAnimeByImage';
import Setting from './Utilitas/Setting';
import ExtensionManager from './Utilitas/ExtensionManager';
import HomePreferences from './Utilitas/HomePreferences';

const Stack = createNativeStackNavigator<UtilsStackNavigator>();

function Utils({ route }: NativeStackScreenProps<RootStackNavigator, 'Utils'>) {
  const { t } = useLanguage();
  const initialScreen = route?.params?.screen ?? 'ChooseScreen';
  return (
    <Stack.Navigator
      screenOptions={{
        header: props => (
          <Appbar.Header>
            {props.back && (
              <Appbar.BackAction
                onPress={() => {
                  props.navigation.goBack();
                }}
              />
            )}
            <Appbar.Content
              titleStyle={{ fontWeight: 'bold' }}
              title={
                typeof props.options.headerTitle === 'string'
                  ? props.options.headerTitle
                  : (props.options.title ?? '')
              }
            />
          </Appbar.Header>
        ),
      }}
      initialRouteName={initialScreen as keyof UtilsStackNavigator}>
      <Stack.Screen
        name="ChooseScreen"
        component={ChooseScreen}
        options={{ title: t('utils.chooseUtility') }}
      />
      <Stack.Screen
        name="SearchAnimeByImage"
        component={SearchAnimeByImage}
        options={{ title: t('utils.searchImageTitle') }}
      />
      <Stack.Screen name="Changelog" component={Changelog} options={{ title: t('utils.changelogTitle') }} />
      <Stack.Screen name="Setting" component={Setting} options={{ title: t('settings.title') }} />
      <Stack.Screen name="About" component={About} options={{ title: t('settings.aboutBtnTitle') }} />
      <Stack.Screen name="ExtensionManager" component={ExtensionManager} options={{ title: t('utils.extNavTitle') }} />
      <Stack.Screen name="HomePreferences" component={HomePreferences} options={{ title: t('utils.homePrefsNavTitle') }} />
    </Stack.Navigator>
  );
}

export default memo(Utils);

const Screens: readonly {
  titleKey: TranslationKey;
  descKey: TranslationKey;
  icon: 'public' | 'image' | 'history' | 'settings' | 'info';
  color: string;
  screen: keyof UtilsStackNavigator;
}[] = [
  {
    titleKey: 'utils.extTitleCard',
    descKey: 'utils.extDescCard',
    icon: 'public',
    color: '#d84b3e',
    screen: 'ExtensionManager',
  },
  {
    titleKey: 'utils.searchImageTitle',
    descKey: 'utils.searchImageDesc',
    icon: 'image',
    color: '#3a8fac',
    screen: 'SearchAnimeByImage',
  },
  {
    titleKey: 'utils.changelogTitle',
    descKey: 'utils.changelogDesc',
    icon: 'history',
    color: '#417e3b',
    screen: 'Changelog',
  },
  {
    titleKey: 'settings.title',
    descKey: 'utils.settingsDescCard',
    icon: 'settings',
    color: '#615e58',
    screen: 'Setting',
  },
  {
    titleKey: 'settings.aboutBtnTitle',
    descKey: 'utils.aboutDescCard',
    icon: 'info',
    color: '#166db4',
    screen: 'About',
  },
];

function ChooseScreen(props: NativeStackScreenProps<UtilsStackNavigator, 'ChooseScreen'>) {
  const styles = useStyles();
  const { t } = useLanguage();

  return (
    <ScrollView
      contentContainerStyle={[styles.container]}>
      {Screens.map((screen, index) => (
        <Surface key={index} style={styles.surface} elevation={0}>
          <TouchableRipple
            background={{ color: 'white', foreground: true }}
            onPress={() => props.navigation.navigate(screen.screen as any)}
            style={styles.touchable}
            rippleColor="rgba(59, 130, 246, 0.2)">
            <View style={styles.content}>
              <View
                style={[
                  styles.iconContainer,
                ]}>
                <MaterialIcons name={screen.icon} size={28} color={screen.color} />
              </View>
              <Text
                style={[styles.titleText]}>
                {t(screen.titleKey)}
              </Text>
              <Text
                style={[styles.descText]}>
                {t(screen.descKey)}
              </Text>
            </View>
          </TouchableRipple>
        </Surface>
      ))}
    </ScrollView>
  );
}

function useStyles() {
  const dimensions = useWindowDimensions();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const GAP = 12;
  const devidedWidth = (dimensions.width - GAP * 3) / 2;

  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          padding: GAP,
          gap: GAP,
          paddingBottom: 24,
          backgroundColor: isDark ? '#0f0f0f' : '#fafafa',
        },
        surface: {
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
          width: devidedWidth < 150 ? '100%' : devidedWidth,
          minHeight: 140,
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : '#e0e0e0',
        },
        touchable: {
          flex: 1,
        },
        content: {
          padding: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
        },
        iconContainer: {
          width: 50,
          height: 50,
          borderRadius: 25,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 12,
          backgroundColor: isDark ? '#222' : '#f0f0f0',
        },
        titleText: {
          textAlign: 'center',
          fontWeight: '700',
          marginBottom: 6,
          color: isDark ? '#f0f0f0' : '#111',
          fontSize: 15,
        },
        descText: {
          textAlign: 'center',
          color: isDark ? '#aaa' : '#666',
          fontSize: 12,
        },
      }),
    [theme.colors.surface, devidedWidth, isDark],
  );
}
