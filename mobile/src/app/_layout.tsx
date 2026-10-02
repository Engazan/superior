import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider, useApp } from '../ui/provider';
function Navigation() {
  const { colors, dark, t } = useApp();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="pair"
          options={{ title: t('pair'), presentation: 'modal' }}
        />
        <Stack.Screen
          name="manage"
          options={{ title: 'Superior', presentation: 'modal' }}
        />
        <Stack.Screen name="terminal/[id]" options={{ title: 'Terminal' }} />
      </Stack>
    </>
  );
}
export default function RootLayout() {
  return (
    <Provider>
      <Navigation />
    </Provider>
  );
}
