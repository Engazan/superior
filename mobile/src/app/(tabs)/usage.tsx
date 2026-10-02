import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import {
  Button,
  Card,
  ConnectionBar,
  Label,
  Page,
  Row,
} from '../../ui/components';
import { client, useApp, useRelay } from '../../ui/provider';
export default function Usage() {
  const { t, colors } = useApp();
  const state = useRelay();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (force = false) => {
    setBusy(true);
    try {
      await client.usage(force);
    } finally {
      setBusy(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (state.connection !== 'online' || !state.capabilities) return;
      void refresh();
      const timer = setInterval(() => void refresh(), 60000);
      return () => clearInterval(timer);
    }, [state.connection, state.capabilities, refresh]),
  );
  return (
    <Page>
      <ConnectionBar />
      <Button
        title={t('refresh')}
        disabled={busy || state.connection !== 'online' || !state.capabilities}
        onPress={() => void refresh(true)}
      />
      {busy && <ActivityIndicator color={colors.accent} />}
      {state.usage.map((account) => (
        <Card key={account.id}>
          <Row>
            <Label style={{ fontWeight: '700', fontSize: 18, flex: 1 }}>
              {account.name}
            </Label>
            <Label muted>{account.provider}</Label>
          </Row>
          <Label muted>{account.plan ?? t(account.status)}</Label>
          {account.windows.map((window) => (
            <View key={window.id} style={{ gap: 6 }}>
              <Row>
                <Label style={{ flex: 1 }}>{window.label}</Label>
                <Label>{Math.round(window.usedPercent)}%</Label>
              </Row>
              <View
                style={{
                  height: 6,
                  borderRadius: 6,
                  backgroundColor: colors.bg,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${Math.min(100, Math.max(0, window.usedPercent))}%`,
                    backgroundColor:
                      window.usedPercent >= 90 ? colors.danger : colors.accent,
                  }}
                />
              </View>
              {window.resetsAt && (
                <Label muted>
                  {t('resets')}: {new Date(window.resetsAt).toLocaleString()}
                </Label>
              )}
            </View>
          ))}
          {account.resetCredits && (
            <Label muted>
              {t('credits')}: {account.resetCredits.availableCount}
            </Label>
          )}
          <Label muted style={{ fontSize: 12 }}>
            {t('updated')}: {new Date(account.updatedAt).toLocaleString()}
          </Label>
        </Card>
      ))}
      {!state.usage.length && <Label muted>{t('emptyUsage')}</Label>}
    </Page>
  );
}
