import {
  LinkingOptions,
  NavigationContainer,
  DarkTheme as ReactNavigationDarkTheme,
  DefaultTheme as ReactNavigationDefaultTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Appearance, Linking, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import ErrorBoundary from 'react-native-error-boundary';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  adaptNavigationTheme,
  Appbar,
  Button,
  Dialog,
  PaperProvider,
  Portal,
} from 'react-native-paper';

import ReactNativeBlobUtil from 'react-native-blob-util';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { MDDark, MDLight } from './src/assets/MaterialTheme';
import useGlobalStyles from './src/assets/style';
import ErrorScreen from './src/component/misc/ErrorScreen';
import FallbackComponent from './src/component/misc/FallbackErrorBoundary';
import SafeAreaWrapper from './src/component/misc/SafeAreaWrapper';
import SuspenseLoading from './src/component/misc/SuspenseLoading';
import {
  ComicsListContext,
  EpisodeBaruHomeContext,
  MovieListHomeContext,
  NovelListContext,
} from './src/misc/context';
import { AuthProvider, useAuth } from './src/misc/AuthContext';
import { LevelProvider } from './src/misc/LevelContext';
import { navigationRef, replaceAllWith } from './src/misc/NavigationService';
import { EpisodeBaruHome, NewAnimeList } from './src/types/anime';
import { RootStackNavigator } from './src/types/navigation';
import { cleanCbzDir } from './src/utils/cbzCleaner.ts';
import { CFBypassIsOpenContext, setWebViewOpen } from './src/utils/CFBypass';
import { DatabaseManager } from './src/utils/DatabaseManager';
import DialogManager from './src/utils/dialogManager';
import ChatForum from './src/component/misc/ChatForum';

import { LatestComicsRelease } from './src/utils/scrapers/comicsv2';
import { LatestNovel } from './src/utils/scrapers/meionovel';
import LoginScreen from './src/screens/LoginScreen';
import UsernameSetupScreen from './src/screens/UsernameSetupScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import SearchUsersScreen from './src/screens/SearchUsersScreen';
import FollowListScreen from './src/screens/FollowListScreen';
import DMChatScreen from './src/screens/DMChatScreen';
import { OneSignal } from 'react-native-onesignal';
import { ONESIGNAL_APP_ID } from '@env';

cleanCbzDir();

try {
  OneSignal.initialize(ONESIGNAL_APP_ID);
  OneSignal.Notifications.requestPermission(false);
} catch (e) {
  console.warn('OneSignal init failed:', e);
}

const { DarkTheme, LightTheme } = adaptNavigationTheme({
  reactNavigationLight: ReactNavigationDefaultTheme,
  reactNavigationDark: ReactNavigationDarkTheme,
});

const CombinedDefaultTheme = {
  ...MDLight,
  ...LightTheme,
  colors: {
    ...LightTheme.colors,
    ...MDLight.colors,
  },
};
const CombinedDarkTheme = {
  ...MDDark,
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    ...MDDark.colors,
  },
};
const CbzReader = lazy(() => import('./src/component/WatchNRead/CbzReader.tsx'));
const AniDetail = lazy(() => import('./src/component/EpisodeDetail/AniDetail'));
const Home = lazy(() => import('./src/component/Home/Home'));
const Video = lazy(() => import('./src/component/WatchNRead/Video'));
const FailedToConnect = lazy(() => import('./src/component/NeedAttention/FailedToConnect'));
const NeedUpdate = lazy(() => import('./src/component/NeedAttention/NeedUpdate'));

const ComicsDetail = lazy(() => import('./src/component/EpisodeDetail/ComicsDetail'));
const ComicsReading = lazy(() => import('./src/component/WatchNRead/ComicsReading'));
const CFBypassWebView = lazy(() => import('./src/utils/CFBypassWebview'));
const Connecting = lazy(() => import('./src/component/Loading Screen/Connect'));
const FromUrl = lazy(() => import('./src/component/Loading Screen/FromUrl'));
const SeeMore = lazy(() => import('./src/component/Home/SeeMore'));
const GenreSelectionScreen = lazy(() => import('./src/component/Home/GenreSelectionScreen'));
const NovelDetail = lazy(() => import('./src/component/EpisodeDetail/NovelDetail'));
const NovelReading = lazy(() => import('./src/component/WatchNRead/NovelReading'));
const FilmDetail = lazy(() => import('./src/component/EpisodeDetail/FilmDetail'));
const FilmPlayer = lazy(() => import('./src/component/WatchNRead/FilmPlayer'));
const Utils = lazy(() => import('./src/component/Home/Utils'));
const JoinNobarScreen = lazy(() => import('./src/screens/JoinNobarScreen'));

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator<RootStackNavigator>();

const linking: LinkingOptions<RootStackNavigator> = {
  prefixes: ['aniflix://', 'naoflix://'],
  config: {
    initialRouteName: 'connectToServer',
    screens: {
      CbzReader: 'cbzReader',
      JoinNobar: 'nobar',
    },
  },

  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (
      url &&
      (url.startsWith('file://') || url.startsWith('content://')) &&
      (await ReactNativeBlobUtil.fs.stat(url)).filename.endsWith('.cbz')
    ) {
      const encodedUrl = encodeURIComponent(url);
      return `aniflix://cbzReader?fileUrl=${encodedUrl}`;
    }
    return null;
  },

  subscribe(listener) {
    const onReceiveURL = async ({ url }: { url: string }) => {
      if (
        url &&
        (url.startsWith('file://') || url.startsWith('content://')) &&
        (await ReactNativeBlobUtil.fs.stat(url)).filename.endsWith('.cbz')
      ) {
        const encodedUrl = encodeURIComponent(url);
        listener(`aniflix://cbzReader?fileUrl=${encodedUrl}`);
      }
    };

    const subscription = Linking.addEventListener('url', onReceiveURL);
    return () => subscription.remove();
  },
};

export const withSuspenseAndSafeArea = (
  Component: React.ComponentType<any>,
  safeArea = true,
  ignoreTop = false,
  ignoreBottom = false,
) => {
  const SuspenseComponent = (props: any) => (
    <SuspenseLoading>
      <Component {...props} />
    </SuspenseLoading>
  );
  return (props: any) =>
    safeArea ? (
      <SafeAreaWrapper ignoreTop={ignoreTop} ignoreBottom={ignoreBottom}>
        {<SuspenseComponent {...props} />}
      </SafeAreaWrapper>
    ) : (
      <SuspenseComponent {...props} />
    );
};

if (!__DEV__) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (error instanceof Error && isFatal) {
      replaceAllWith('ErrorScreen', { error });
    }
  });
}

type Screens = {
  name: keyof RootStackNavigator;
  component: (props: any) => React.JSX.Element;
  options?: NativeStackNavigationOptions;
}[];

const screens: Screens = [
  { name: 'CbzReader', component: withSuspenseAndSafeArea(CbzReader, true, true) },
  { name: 'Home', component: withSuspenseAndSafeArea(Home, false), options: undefined },
  { name: 'AnimeDetail', component: withSuspenseAndSafeArea(AniDetail, false), options: undefined },

  {
    name: 'ComicsDetail',
    component: withSuspenseAndSafeArea(ComicsDetail, false),
    options: undefined,
  },
  {
    name: 'ComicsReading',
    component: withSuspenseAndSafeArea(ComicsReading, true, true),
    options: undefined,
  },
  { name: 'FromUrl', component: withSuspenseAndSafeArea(FromUrl), options: { headerShown: true } },
  { name: 'Video', component: withSuspenseAndSafeArea(Video, false), options: undefined },
  { name: 'connectToServer', component: withSuspenseAndSafeArea(Connecting), options: undefined },
  { name: 'NeedUpdate', component: withSuspenseAndSafeArea(NeedUpdate), options: undefined },
  {
    name: 'FailedToConnect',
    component: withSuspenseAndSafeArea(FailedToConnect),
    options: undefined,
  },
  { name: 'JoinNobar', component: withSuspenseAndSafeArea(JoinNobarScreen), options: undefined },
  {
    name: 'NovelDetail',
    component: withSuspenseAndSafeArea(NovelDetail, false),
    options: undefined,
  },
  {
    name: 'NovelReading',
    component: withSuspenseAndSafeArea(NovelReading, true, true),
    options: undefined,
  },
  {
    name: 'FilmDetail',
    component: withSuspenseAndSafeArea(FilmDetail, false),
    options: undefined,
  },
  {
    name: 'FilmPlayer',
    component: withSuspenseAndSafeArea(FilmPlayer, false),
    options: { headerShown: true },
  },
  {
    name: 'SeeMore',
    component: withSuspenseAndSafeArea(SeeMore, false),
    options: { headerShown: true },
  },
  {
    name: 'GenreSelectionScreen',
    component: withSuspenseAndSafeArea(GenreSelectionScreen, false),
    options: { headerShown: false },
  },
  {
    name: 'Utils',
    component: withSuspenseAndSafeArea(Utils, false),
    options: { headerShown: false },
  },
  {
    name: 'LoginScreen',
    component: withSuspenseAndSafeArea(LoginScreen),
    options: undefined,
  },
  {
    name: 'UsernameSetupScreen',
    component: withSuspenseAndSafeArea(UsernameSetupScreen),
    options: { headerShown: false, navigationBarColor: '#000' },
  },
  {
    name: 'EditProfile',
    component: withSuspenseAndSafeArea(EditProfileScreen),
    options: { headerShown: false },
  },
  {
    name: 'UserProfile',
    component: withSuspenseAndSafeArea(UserProfileScreen),
    options: { headerShown: false },
  },
  {
    name: 'SearchUsers',
    component: withSuspenseAndSafeArea(SearchUsersScreen),
    options: { headerShown: false },
  },
  {
    name: 'FollowList',
    component: withSuspenseAndSafeArea(FollowListScreen),
    options: { headerShown: false },
  },
  {
    name: 'DMChat',
    component: withSuspenseAndSafeArea(DMChatScreen, true, true),
    options: { headerShown: false },
  },
  {
    name: 'ErrorScreen',
    component: ErrorScreen,
  },
];

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [cfUrl, setCfUrl] = useState('');

  const { isLoading: authLoading } = useAuth();

  const [paramsState, setParamsState] = useState<EpisodeBaruHome>({
    jadwalAnime: {},
    newAnime: [],
  });
  const [movieParamsState, setMovieParamsState] = useState<NewAnimeList[]>([]);
  const [comicsData, setComicsData] = useState<LatestComicsRelease[] | undefined>(undefined);
  const [novelData, setNovelData] = useState<LatestNovel[] | undefined>(undefined);

  const colorScheme = useColorScheme();
  const globalStyles = useGlobalStyles();

  useEffect(() => {
    setWebViewOpen.openWebViewCF = (isOpenCF: boolean, url: string) => {
      setIsOpen(isOpenCF);
      setCfUrl(url);
    };
  }, []);

  useEffect(() => {
    const colorSchemeValue = DatabaseManager.getSync('colorScheme');
    if (
      colorSchemeValue !== 'auto' &&
      (colorSchemeValue === 'light' || colorSchemeValue === 'dark')
    ) {
      Appearance.setColorScheme(colorSchemeValue);
    }
    SystemBars.setHidden(false);
    SystemNavigationBar.fullScreen(false);
    SystemNavigationBar.navigationShow();
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    SystemBars.setStyle(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogContent, setDialogContent] = useState({
    title: '',
    message: '',
    buttons: [] as { text: string; onPress: () => void }[],
  });
  useEffect(() => {
    DialogManager.setupDialog(setDialogVisible, setDialogContent);
  }, []);

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ErrorBoundary FallbackComponent={FallbackComponent}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <EpisodeBaruHomeContext
              value={useMemo(() => ({ paramsState, setParamsState }), [paramsState])}>
                <MovieListHomeContext
                  value={useMemo(
                    () => ({
                      paramsState: movieParamsState,
                      setParamsState: setMovieParamsState,
                    }),
                    [movieParamsState],
                  )}>
                  <ComicsListContext
                    value={useMemo(
                      () => ({
                        paramsState: comicsData,
                        setParamsState: setComicsData,
                      }),
                      [comicsData],
                    )}>
                    <NovelListContext
                      value={useMemo(
                        () => ({
                          paramsState: novelData,
                          setParamsState: setNovelData,
                        }),
                        [novelData],
                      )}>
                      <PaperProvider theme={colorScheme === 'dark' ? MDDark : MDLight}>
                      <NavigationContainer
                        linking={linking}
                        ref={navigationRef}
                        theme={colorScheme === 'dark' ? CombinedDarkTheme : CombinedDefaultTheme}>
                        <Portal>
                          <Dialog
                            visible={dialogVisible}
                            dismissable={false}
                            dismissableBackButton
                            onDismiss={() => setDialogVisible(false)}>
                            <Dialog.Title>{dialogContent.title}</Dialog.Title>
                            <Dialog.Content>
                              <Text style={globalStyles.text}>{dialogContent.message}</Text>
                            </Dialog.Content>
                            <Dialog.Actions>
                              {dialogContent.buttons.map((button, index) => (
                                <Button
                                  key={index}
                                  onPress={() => {
                                    button.onPress();
                                    setDialogVisible(false);
                                  }}>
                                  {button.text}
                                </Button>
                              ))}
                            </Dialog.Actions>
                          </Dialog>
                        </Portal>
                        <Stack.Navigator
                          initialRouteName="connectToServer"
                          screenOptions={{
                            headerShown: false,
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
                                      : ''
                                  }
                                />
                              </Appbar.Header>
                            ),
                          }}>
                          {screens.map(({ name, component, options }) => (
                            <Stack.Screen key={name} name={name} options={options}>
                              {component}
                            </Stack.Screen>
                          ))}
                        </Stack.Navigator>
                        <CFBypassIsOpenContext
                          value={useMemo(
                            () => ({ isOpen, url: cfUrl, setIsOpen }),
                            [isOpen, cfUrl],
                          )}>
                          {isOpen && (
                            <Suspense>
                              <CFBypassWebView />
                            </Suspense>
                          )}
                        </CFBypassIsOpenContext>
                        {__DEV__ && (
                          <View style={styles.Dev} pointerEvents="none">
                            <Text style={[globalStyles.text, styles.DevText]}>Dev</Text>
                          </View>
                        )}
                      </NavigationContainer>
                      <ChatForum />
                    </PaperProvider>
                    </NovelListContext>
                  </ComicsListContext>
                </MovieListHomeContext>
            </EpisodeBaruHomeContext>
          </GestureHandlerRootView>
        </ErrorBoundary>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  Dev: {
    position: 'absolute',
    bottom: 40,
    zIndex: 100,
    backgroundColor: '#c2c2047e',
    padding: 5,
    paddingHorizontal: 20,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
  },
  DevText: {
    fontWeight: 'bold',
    fontSize: 17,
  },
});

function AppWithAuth() {
  return (
    <AuthProvider>
      <LevelProvider>
        <App />
      </LevelProvider>
    </AuthProvider>
  );
}

export default AppWithAuth;
