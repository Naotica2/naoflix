import { Suspense } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import useGlobalStyles from '../../assets/style';
import { useLanguage } from '../../misc/LanguageContext';

function Loading() {
  const globalStyles = useGlobalStyles();
  const { t } = useLanguage();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text style={globalStyles.text}>{t('utils.suspenseLoading')}</Text>
    </View>
  );
}

export default function SuspenseLoading({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
