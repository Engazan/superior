import { useState } from 'react';
import { Stack } from 'expo-router';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import {
  AccountUsage,
  Desktops,
  QuickActions,
  Resume,
  Stats,
} from '../../../ui/home';
import { client, useApp, useUsageRefresh } from '../../../ui/provider';
import { Welcome } from '../../../ui/welcome';
export default function Home() {
  const { t, colors, hosts, loaded } = useApp();
  const { refresh } = useUsageRefresh();
  const [pulling, setPulling] = useState(false);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!hosts.length)
    return (
      <>
        <Stack.Screen options={{ title: 'Superior', headerLargeTitle: false }} />
        <Welcome />
      </>
    );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          tintColor={colors.muted}
          onRefresh={() => {
            setPulling(true);
            void Promise.allSettled([client.refresh(), refresh(true)]).then(() =>
              setPulling(false),
            );
          }}
        />
      }
    >
      <Stack.Screen
        options={{ title: t('welcomeBack'), headerLargeTitle: Platform.OS === 'ios' }}
      />
      <Stats />
      <Desktops />
      <Resume />
      <QuickActions />
      <AccountUsage />
    </ScrollView>
  );
}
