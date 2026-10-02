import { router } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { Label, SectionTitle, useError } from '../../../ui/components';
import { Group, ListRow, MoreButton, Segmented } from '../../../ui/kit';
import {
  accents,
  client,
  storage,
  useApp,
  useRelay,
  type Accent,
  type Key,
  type Language,
  type Theme,
} from '../../../ui/provider';
import type { SavedHost } from '../../../relay/storage';
const languages: { value: Language | 'auto'; label?: string }[] = [
  { value: 'auto' },
  { value: 'en', label: 'English' },
  { value: 'sk', label: 'Slovenčina' },
  { value: 'cs', label: 'Čeština' },
  { value: 'pl', label: 'Polski' },
  { value: 'hu', label: 'Magyar' },
];
const accentNames: Record<Accent, Key> = {
  purple: 'accentPurple',
  blue: 'accentBlue',
  green: 'accentGreen',
  orange: 'accentOrange',
  pink: 'accentPink',
  mono: 'accentMono',
};
function AccentPicker() {
  const { preferences, configure, t, colors, dark } = useApp();
  const fail = useError();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
        padding: 16,
      }}
    >
      {(Object.keys(accents) as Accent[]).map((accent) => {
        const active = preferences.accent === accent;
        const color = dark ? accents[accent].dark : accents[accent].light;
        return (
          <Pressable
            key={accent}
            accessibilityRole="radio"
            accessibilityLabel={t(accentNames[accent])}
            accessibilityState={{ checked: active }}
            onPress={() => void configure({ accent }).catch(fail)}
            hitSlop={4}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              padding: 3,
              borderWidth: 2,
              borderColor: active ? color : 'transparent',
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 20,
                backgroundColor: color,
                borderWidth: accent === 'mono' ? 1 : 0,
                borderColor: colors.border,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
export default function Settings() {
  const { hosts, selected, select, reload, preferences, configure, t, colors } =
    useApp();
  const state = useRelay();
  const fail = useError();
  const forget = (host: SavedHost) =>
    Alert.alert(t('remove'), t('forgetHint'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const active = host.id === selected?.id;
            if (active) client.stop();
            await storage.remove(host.id);
            await reload();
            if (active) await select((await storage.list())[0] ?? null);
          })().catch(fail);
        },
      },
    ]);
  const options = (host: SavedHost) =>
    Alert.alert(host.name, undefined, [
      {
        text: t('rename'),
        onPress: () =>
          router.push({
            pathname: '/manage',
            params: { mode: 'host', id: host.id, name: host.name },
          }),
      },
      { text: t('remove'), style: 'destructive', onPress: () => forget(host) },
      { text: t('cancel'), style: 'cancel' },
    ]);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <SectionTitle>{t('desktops')}</SectionTitle>
      <Group>
        {hosts.map((host) => (
          <ListRow
            key={host.id}
            title={host.name}
            subtitle={host.pairing.url}
            symbol={{ ios: 'desktopcomputer', android: 'computer' }}
            checked={host.id === selected?.id}
            onPress={() => void select(host).catch(fail)}
            onLongPress={() => options(host)}
            trailing={
              <MoreButton label={host.name} onPress={() => options(host)} />
            }
          />
        ))}
        {Platform.OS !== 'web' && (
          <ListRow
            tone="accent"
            title={hosts.length ? t('pairAnother') : t('pair')}
            symbol={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
            onPress={() => router.push('/pair')}
          />
        )}
        {Platform.OS === 'web' && <ListRow title={t('nativeOnly')} />}
      </Group>
      <SectionTitle>{t('theme')}</SectionTitle>
      <Group>
        <View style={{ padding: 12 }}>
          <Segmented<Theme>
            value={preferences.theme}
            options={(['auto', 'light', 'dark'] as Theme[]).map((value) => ({
              value,
              label: t(value),
            }))}
            onChange={(theme) => void configure({ theme }).catch(fail)}
          />
        </View>
      </Group>
      <SectionTitle>{t('accent')}</SectionTitle>
      <Group>
        <AccentPicker />
      </Group>
      <SectionTitle>{t('language')}</SectionTitle>
      <Group>
        {languages.map(({ value, label }) => (
          <ListRow
            key={value}
            title={label ?? t('auto')}
            checked={preferences.language === value}
            onPress={() => void configure({ language: value }).catch(fail)}
          />
        ))}
      </Group>
      {state.operations.length > 0 && (
        <>
          <SectionTitle>{t('operations')}</SectionTitle>
          <Group>
            {state.operations
              .slice()
              .reverse()
              .map((op) => (
                <ListRow
                  key={op.requestId}
                  title={t(op.state === 'uncertain' ? 'uncertainState' : op.state)}
                  subtitle={[
                    new Date(op.startedAt).toLocaleTimeString(),
                    op.code?.replaceAll('_', ' '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  tone={op.state === 'failed' ? 'danger' : 'default'}
                />
              ))}
          </Group>
        </>
      )}
      <Label muted style={{ textAlign: 'center', fontSize: 12, marginTop: 8 }}>
        Superior Mobile · 1.0.0
        {state.capabilities
          ? ` · Desktop ${state.capabilities.desktopVersion}`
          : ''}
      </Label>
    </ScrollView>
  );
}
