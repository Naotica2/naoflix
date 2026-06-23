import MaterialIcons from '@react-native-vector-icons/material-icons';
import {
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { lazy, memo, useCallback, useContext, useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { AndroidSoftInputModes, KeyboardController } from 'react-native-keyboard-controller';
import { BottomNavigation, useTheme } from 'react-native-paper';
import { withSuspenseAndSafeArea } from '../../../App';
import { EpisodeBaruHomeContext } from '../../misc/context';
import { HomeNavigator, RootStackNavigator } from '../../types/navigation';

const HomePage = lazy(() => import('./HomePage'));
const BrowsePage = lazy(() => import('./BrowsePage'));
const MyListsPage = lazy(() => import('./MyListsPage'));
const AccountPage = lazy(() => import('./AccountPage'));

type Props = NativeStackScreenProps<RootStackNavigator, 'Home'>;
const Tab = createBottomTabNavigator<HomeNavigator>();

const tabScreens: {
  name: keyof HomeNavigator;
  component: (props: any) => React.JSX.Element;
  options: BottomTabNavigationOptions;
}[] = [
  {
    name: 'HomePage',
    component: withSuspenseAndSafeArea(HomePage, false, true, true),
    options: {
      tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
      tabBarLabel: 'Home',
    },
  },
  {
    name: 'BrowsePage',
    component: withSuspenseAndSafeArea(BrowsePage, false, true, true),
    options: {
      tabBarIcon: ({ color, size }) => <MaterialIcons name="explore" size={size} color={color} />,
      tabBarLabel: 'Browse',
    },
  },
  {
    name: 'MyListsPage',
    component: withSuspenseAndSafeArea(MyListsPage, false, true, true),
    options: {
      tabBarIcon: ({ color, size }) => <MaterialIcons name="bookmark" size={size} color={color} />,
      tabBarLabel: 'My Lists',
    },
  },
  {
    name: 'AccountPage',
    component: withSuspenseAndSafeArea(AccountPage, false, true),
    options: {
      tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} />,
      tabBarLabel: 'Account',
    },
  },
];

function BottomTabs(props: Props) {
  const { setParamsState: setAnimeData } = useContext(EpisodeBaruHomeContext);
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  useEffect(() => {
    setAnimeData?.(props.route.params.data);
  }, [props.route.params.data, setAnimeData]);
  useFocusEffect(
    useCallback(() => {
      KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_PAN);
      return () => {
        KeyboardController.setDefaultMode();
      };
    }, []),
  );
  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: isDark ? '#666' : '#999',
        tabBarStyle: {
          backgroundColor: isDark ? '#0f0f0f' : '#fff',
          borderTopWidth: 0,
          elevation: 0,
          height: 56,
          paddingBottom: 4,
        },
      }}
      tabBar={({ navigation, state, descriptors, insets }) => (
        <BottomNavigation.Bar
          navigationState={state}
          safeAreaInsets={insets}
          compact
          activeColor="#3b82f6"
          inactiveColor={isDark ? '#666' : '#999'}
          activeIndicatorStyle={{ backgroundColor: isDark ? '#1a2a4a' : '#eff6ff' }}
          style={{ backgroundColor: isDark ? '#0f0f0f' : '#fff', elevation: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? '#222' : '#eee' }}
          onTabPress={({ route, preventDefault }) => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) {
              preventDefault();
            } else {
              navigation.dispatch({
                ...CommonActions.navigate(route.name, route.params),
                target: state.key,
              });
            }
          }}
          renderIcon={({ route, focused, color }) =>
            descriptors[route.key].options.tabBarIcon?.({
              focused,
              color,
              size: 22,
            }) || null
          }
          getLabelText={({ route }) => {
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : typeof options.title === 'string'
                  ? options.title
                  : route.name;

            return label;
          }}
        />
      )}>
      {tabScreens.map(({ name, component: Component, options }) => (
        <Tab.Screen key={name} name={name} options={options}>
          {Component}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
  );
}

export default memo(BottomTabs);
