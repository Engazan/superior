import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { MobileUsage } from '@shared/mobileRelay';
import { Card, IconBox, Label } from '../../../ui/components';
import { ConnectionBar, providerSymbol, UsageBar } from '../../../ui/kit';
import { useApp, useRelay, useUsageRefresh } from '../../../ui/provider';
const time = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
function Account({ account }: { account: MobileUsage }) {
  const { t, colors } = useApp();
  return (
    <Card style={{ padding: 14, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBox symbol={providerSymbol(account.provider)} />
        <View style={{ flex: 1 }}>
          <Label style={{ fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
            {account.name}
          </Label>
          <Label muted style={{ fontSize: 13 }} numberOfLines={1}>
            {[
              account.provider === 'claude' ? 'Claude' : 'Codex',
              account.plan ?? t(account.status),
            ].join(' · ')}
          </Label>
        </View>
      </View>
      {account.windows.map((window) => (
        <View key={window.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Label style={{ flex: 1, fontWeight: '600' }}>{window.label}</Label>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
              {Math.round(window.usedPercent)}%
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <UsageBar percent={window.usedPercent} height={8} />
          </View>
          {window.resetsAt && (
            <Label muted style={{ fontSize: 13 }}>
              {t('resets')}: {time(window.resetsAt)}
            </Label>
          )}
        </View>
      ))}
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Label muted style={{ flex: 1, fontSize: 12 }}>
          {t('updated')}: {time(account.updatedAt)}
        </Label>
        {account.resetCredits && (
          <Label muted style={{ fontSize: 12 }}>
            {t('credits')}: {account.resetCredits.availableCount}
          </Label>
        )}
      </View>
    </Card>
  );
}
export default function Usage() {
  const { t, colors } = useApp();
  const { usage, connection, capabilities } = useRelay();
  const { refresh } = useUsageRefresh();
  const [pulling, setPulling] = useState(false);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          tintColor={colors.muted}
          enabled={connection === 'online' && !!capabilities}
          onRefresh={() => {
            setPulling(true);
            void refresh(true)
              .catch(() => {})
              .finally(() => setPulling(false));
          }}
        />
      }
    >
      {connection !== 'online' && <ConnectionBar />}
      {connection === 'online' && !capabilities && (
        <Card>
          <Label muted>{t('updateDesktop')}</Label>
        </Card>
      )}
      {usage.map((account) => (
        <Account key={account.id} account={account} />
      ))}
      {!usage.length && capabilities && (
        <Card>
          <Label muted>{t('emptyUsage')}</Label>
        </Card>
      )}
    </ScrollView>
  );
}
