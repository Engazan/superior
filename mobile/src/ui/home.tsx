import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import type { MobileSession, MobileUsage } from '@shared/mobileRelay';
import { Card, IconBox, Label, SectionTitle, useError } from './components';
import {
  Chevron,
  Dot,
  green,
  providerSymbol,
  shortPath,
  Tile,
  remaining,
  UsageBar,
  usageColor,
} from './kit';
import { client, useApp, useRelay } from './provider';
export function Stats() {
  const { t, colors } = useApp();
  const { catalog } = useRelay();
  const count = (state: string) =>
    catalog.sessions.filter((s) => s.agentState === state).length;
  const stats: [number, string, 'all' | 'working' | 'waiting'][] = [
    [catalog.sessions.length, t('terminals'), 'all'],
    [count('working'), t('working'), 'working'],
    [count('waiting'), t('waiting'), 'waiting'],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {stats.map(([value, label, filter]) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={`${value} ${label}`}
          onPress={() => router.push({ pathname: '/terminals', params: { filter } })}
          style={({ pressed }) => ({
            flex: 1,
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>
            {value}
          </Text>
          <Label muted style={{ fontSize: 13 }} numberOfLines={1}>
            {label}
          </Label>
        </Pressable>
      ))}
    </View>
  );
}
export function Desktops() {
  const { t, colors, hosts, selected, select } = useApp();
  const { connection, capabilities, catalog } = useRelay();
  const fail = useError();
  const status =
    connection === 'online'
      ? t('online')
      : connection === 'revoked'
        ? t('pairAgain')
        : ['connecting', 'reconnecting', 'relay'].includes(connection)
          ? t('connecting')
          : t('offline');
  return (
    <>
      <SectionTitle>{t('desktops')}</SectionTitle>
      {hosts.map((host) => {
        const active = host.id === selected?.id;
        return (
          <Tile
            key={host.id}
            onPress={() => {
              if (!active) void select(host).catch(fail);
              else if (connection === 'revoked') router.push('/pair');
              else if (connection !== 'online') {
                client.stop();
                client.resume();
              }
            }}
          >
            <IconBox symbol={{ ios: 'desktopcomputer', android: 'computer' }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Label style={{ fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                {host.name}
              </Label>
              {active ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Dot color={connection === 'online' ? green : colors.muted} />
                    <Label muted>
                      {status}
                      {capabilities ? ` · v${capabilities.desktopVersion}` : ''}
                    </Label>
                  </View>
                  <Label muted>
                    {catalog.projects.length} {t('projects').toLowerCase()} ·{' '}
                    {catalog.workspaces.length} {t('workspaces').toLowerCase()}
                  </Label>
                </>
              ) : (
                <Label muted numberOfLines={1}>
                  {host.pairing.url}
                </Label>
              )}
            </View>
            {active && connection !== 'online' && (
              <SymbolView
                name={{ ios: 'arrow.clockwise', android: 'refresh' }}
                size={18}
                tintColor={colors.muted}
                fallback={null}
              />
            )}
          </Tile>
        );
      })}
    </>
  );
}
export function SessionTile({ session: s }: { session: MobileSession }) {
  const { t, colors } = useApp();
  const { catalog } = useRelay();
  const workspace = catalog.workspaces.find((w) => w.id === s.workspaceId);
  const project = catalog.projects.find((p) => p.path === workspace?.folderPath);
  const state = ['working', 'waiting', 'idle'].includes(s.agentState)
    ? t(s.agentState as 'working' | 'waiting' | 'idle')
    : s.status;
  return (
    <Tile
      onPress={() =>
        router.push({ pathname: '/terminal/[id]', params: { id: s.id } })
      }
    >
      <IconBox symbol={{ ios: 'apple.terminal', android: 'terminal' }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Label style={{ fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
          {s.nickname || s.label}
        </Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Dot color={project?.color ?? colors.accent} />
          <Label muted numberOfLines={1} style={{ flexShrink: 1 }}>
            {[workspace?.name ?? project?.name, workspace?.branch]
              .filter(Boolean)
              .join(' · ')}
          </Label>
        </View>
        {project && project.path !== 'legacy' && (
          <Label muted style={{ fontSize: 12 }} numberOfLines={1} ellipsizeMode="middle">
            {shortPath(project.path)}
          </Label>
        )}
      </View>
      <Label muted style={{ fontSize: 13 }}>
        {state}
      </Label>
      <Chevron />
    </Tile>
  );
}
export function Resume() {
  const { t } = useApp();
  const { catalog } = useRelay();
  const recent = [...catalog.sessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);
  return (
    <>
      <SectionTitle>{t('resume')}</SectionTitle>
      {recent.map((s) => (
        <SessionTile key={s.id} session={s} />
      ))}
      {!recent.length && (
        <Card>
          <Label muted>{t('emptyResume')}</Label>
        </Card>
      )}
    </>
  );
}
export function QuickActions() {
  const { t } = useApp();
  const { catalog, connection, capabilities } = useRelay();
  const profile = catalog.profiles[0];
  const actions: {
    title: string;
    symbol: SymbolViewProps['name'];
    disabled?: boolean;
    onPress(): void;
  }[] = [
    {
      title: t('pair'),
      symbol: { ios: 'qrcode.viewfinder', android: 'qr_code_scanner' },
      onPress: () => router.push('/pair'),
    },
    {
      title: t('addProject'),
      symbol: { ios: 'plus', android: 'add' },
      disabled: connection !== 'online' || !capabilities || !profile,
      onPress: () =>
        router.push({
          pathname: '/manage',
          params: { mode: 'projects.add', profileId: profile?.id ?? '' },
        }),
    },
  ];
  return (
    <>
      <SectionTitle>{t('quickActions')}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {actions.map((a) => (
          <View key={a.title} style={{ flex: 1 }}>
            <Tile onPress={a.onPress} disabled={a.disabled}>
              <IconBox symbol={a.symbol} />
              <Label style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
                {a.title}
              </Label>
            </Tile>
          </View>
        ))}
      </View>
    </>
  );
}
function UsageWindow({ window }: { window: MobileUsage['windows'][number] }) {
  const { colors } = useApp();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Label muted style={{ fontSize: 13 }} numberOfLines={1}>
        {window.label}
      </Label>
      <UsageBar used={window.usedPercent} />
      <Label
        style={{
          fontSize: 13,
          minWidth: 34,
          textAlign: 'right',
          color: usageColor(window.usedPercent, colors.danger),
        }}
      >
        {remaining(window.usedPercent)}%
      </Label>
    </View>
  );
}
export function AccountUsage() {
  const { t, colors } = useApp();
  const { usage } = useRelay();
  if (!usage.length) return null;
  return (
    <>
      <SectionTitle>{t('accountUsage')}</SectionTitle>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/usage')}
        style={({ pressed }) => ({
          gap: 16,
          padding: 14,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {usage.map((account) => (
          <View key={account.id} style={{ flexDirection: 'row', gap: 14 }}>
            <IconBox
              symbol={providerSymbol(account.provider)}
            />
            <View style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
              <Label style={{ fontWeight: '600' }} numberOfLines={1}>
                {account.name}
              </Label>
              {account.windows.length ? (
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {account.windows.slice(0, 2).map((w) => (
                    <UsageWindow key={w.id} window={w} />
                  ))}
                </View>
              ) : (
                <Label muted style={{ fontSize: 13 }}>
                  {account.plan ?? t(account.status)}
                </Label>
              )}
            </View>
          </View>
        ))}
      </Pressable>
    </>
  );
}
