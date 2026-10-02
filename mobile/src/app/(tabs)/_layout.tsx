import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../../ui/provider';
export default function Layout() {
  const { colors, t } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('projects'),
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>▦</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="usage"
        options={{
          title: t('usage'),
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>◔</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>⚙</Text>
          ),
        }}
      />
    </Tabs>
  );
}
