import { StyleSheet, useColorScheme } from 'react-native';

export const darkText = '#dadada';
export const lightText = '#0f0f0f';

const darkStyles = StyleSheet.create({
  text: {
    color: darkText,
  },
});

const lightStyles = StyleSheet.create({
  text: {
    color: lightText,
  },
});

export default function useGlobalStyles() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkStyles : lightStyles;
}
