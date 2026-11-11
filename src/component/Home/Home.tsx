import MaterialIcons from '@react-native-vector-icons/material-icons';
import {
  BottomTabBarProps,
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { AndroidSoftInputModes, KeyboardController } from 'react-native-keyboard-controller';
import { EpisodeBaruHomeContext } from '../../misc/context';
import { TranslationKey, useLanguage } from '../../misc/LanguageContext';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';
import offlineDownloadManager from '../../utils/offlineDownloadManager';
import HomePage from './HomePage';
import BrowsePage from './BrowsePage';
import ForumPage from '../../screens/ForumPage';
import MessagesPage from './MessagesPage';
import MyListsPage from './MyListsPage';
import AccountPage from './AccountPage';

type Props = NativeStackScreenProps<RootStackNavigator, 'Home'>;
const Tab = createBottomTabNavigator<HomeNavigator>();

const MyListsTabIcon = memo(function MyListsTabIcon({
  color,
  size,
  isDark,
}: {
  color: string;
  size: number;
  isDark: boolean;
}) {
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);

  useEffect(() => {
    return offlineDownloadManager.subscribeProgress(activeMap => {
      const next = activeMap.size;
      setActiveDownloadCount(prev => (prev === next ? prev : next));
    });
  }, []);

  const iconEl = <MaterialIcons name="bookmark" size={size} color={color} />;
  if (activeDownloadCount === 0) return iconEl;

  return (
    <View style={{ position: 'relative' }}>
      {iconEl}
      <View
        style={{
          position: 'absolute',
          top: -4,
          right: -8,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          paddingHorizontal: 4,
          backgroundColor: '#3b82f6',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: isDark ? '#0f0f0f' : '#ffffff',
        }}>
        <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '700' }}>
          {activeDownloadCount}
        </Text>
      </View>
    </View>
  );
});

const TAB_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  animation: 'fade',
  headerShown: false,
};

const tabScreenBase: {
  name: keyof HomeNavigator;
  component: React.ComponentType<any>;
  iconName: string;
  labelKey: TranslationKey;
}[] = [
  {
    name: 'HomePage',
    component: HomePage,
    iconName: 'home',
    labelKey: 'tabs.home',
  },
  {
    name: 'BrowsePage',
    component: BrowsePage,
    iconName: 'explore',
    labelKey: 'tabs.browse',
  },
  {
    name: 'ForumPage',
    component: ForumPage,
    iconName: 'forum',
    labelKey: 'tabs.forum',
  },
  {
    name: 'MessagesPage',
    component: MessagesPage,
    iconName: 'chat',
    labelKey: 'tabs.messages',
  },
  {
    name: 'MyListsPage',
    component: MyListsPage,
    iconName: 'bookmark',
    labelKey: 'tabs.myLists',
  },
  {
    name: 'AccountPage',
    component: AccountPage,
    iconName: 'person',
    labelKey: 'tabs.account',
  },
];

const NaoFlixTabBar = memo(function NaoFlixTabBar({
  navigation,
  state,
  descriptors,
  insets,
  isDark,
}: BottomTabBarProps & { isDark: boolean }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  return (
    <View
      style={[
        tabStyles.wrapper,
        {
          backgroundColor: isDark ? '#0f0f0f' : '#ffffff',
          borderTopColor: isDark ? '#1e1e24' : '#e4e4e7',
          paddingBottom: Math.max(insets.bottom, 4),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <View style={tabStyles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;
          const color = focused ? '#3b82f6' : isDark ? '#71717a' : '#8a8a93';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({
                ...CommonActions.navigate(route.name, route.params),
                target: state.key,
              });
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              activeOpacity={0.75}
              onPress={onPress}
              onLongPress={onLongPress}
              style={tabStyles.tabItem}>
              <View
                style={[
                  tabStyles.indicatorPill,
                  focused && {
                    backgroundColor: isDark ? '#1a2a4a' : '#eff6ff',
                  },
                ]}>
                {route.name === 'MyListsPage' ? (
                  <MyListsTabIcon color={color} size={20} isDark={isDark} />
                ) : (
                  options.tabBarIcon?.({
                    focused,
                    color,
                    size: 20,
                  }) || null
                )}
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.08}
                style={[
                  tabStyles.tabLabel,
                  {
                    fontSize: isCompact ? 9.5 : 10.5,
                    fontWeight: focused ? '700' : '500',
                    color,
                  },
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

function BottomTabs(props: Props) {
  const { setParamsState: setAnimeData } = useContext(EpisodeBaruHomeContext);
  const isDark = useColorScheme() === 'dark';
  const { t } = useLanguage();

  const tabScreens = useMemo<
    {
      name: keyof HomeNavigator;
      component: React.ComponentType<any>;
      options: BottomTabNavigationOptions;
    }[]
  >(
    () =>
      tabScreenBase.map(item => ({
        name: item.name,
        component: item.component,
        options: {
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name={item.iconName as any} size={size} color={color} />
          ),
          tabBarLabel: t(item.labelKey),
        },
      })),
    [t],
  );

  useEffect(() => {
    if (props.route.params?.data) {
      setAnimeData?.(props.route.params.data);
    }
  }, [props.route.params?.data, setAnimeData]);

  const isHomeFocusedRef = useRef(false);
  const pendingInputModeTaskRef = useRef<{ cancel: () => void } | null>(null);

  useFocusEffect(
    useCallback(() => {
      isHomeFocusedRef.current = true;
      pendingInputModeTaskRef.current?.cancel();
      pendingInputModeTaskRef.current = InteractionManager.runAfterInteractions(() => {
        pendingInputModeTaskRef.current = null;
        if (isHomeFocusedRef.current) {
          KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_PAN);
        }
      });
      return () => {
        isHomeFocusedRef.current = false;
        pendingInputModeTaskRef.current?.cancel();
        pendingInputModeTaskRef.current = InteractionManager.runAfterInteractions(() => {
          pendingInputModeTaskRef.current = null;
          if (!isHomeFocusedRef.current) {
            KeyboardController.setDefaultMode();
          }
        });
      };
    }, []),
  );

  const renderTabBar = useCallback(
    (tabBarProps: BottomTabBarProps) => <NaoFlixTabBar {...tabBarProps} isDark={isDark} />,
    [isDark],
  );

  return (
    <Tab.Navigator
      detachInactiveScreens={true}
      screenOptions={TAB_SCREEN_OPTIONS}
      tabBar={renderTabBar}>
      {tabScreens.map(({ name, component, options }) => (
        <Tab.Screen key={name} name={name} component={component} options={options} />
      ))}
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  indicatorPill: {
    width: '76%',
    maxWidth: 48,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    marginTop: 2,
    textAlign: 'center',
  },
});

export default memo(BottomTabs);
