import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider, useApp } from '../ui/provider';
function Navigation() {
  const { colors, dark } = useApp();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="pair"
          options={{ title: '', presentation: 'modal' }}
        />
        <Stack.Screen
          name="manage"
          options={{ title: 'Superior', presentation: 'modal' }}
        />
        <Stack.Screen name="terminal/[id]" options={{ title: 'Terminal' }} />
        <Stack.Screen name="terminals" />
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
