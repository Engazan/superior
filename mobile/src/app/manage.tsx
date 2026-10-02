import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import type { MobileMutation } from '@shared/mobileRelay';
import { client, storage, useApp, useRelay, type Key } from '../ui/provider';
import {
  Field,
  Label,
  SectionTitle,
  SolidButton,
  useError,
} from '../ui/components';
import { Group, ListRow } from '../ui/kit';
const palette = [
  '#6d42cc',
  '#2563eb',
  '#0891b2',
  '#16794c',
  '#ca8a04',
  '#c2410c',
  '#be185d',
  '#64748b',
];
const hex = /^#[0-9a-f]{6}$/i;
const titles: Record<string, Key> = {
  'profiles.create': 'newProfile',
  profile: 'profile',
  'projects.add': 'addProject',
  'workspaces.create': 'newWorkspace',
  'worktrees.create': 'newWorktree',
  'terminals.create': 'newTerminal',
  host: 'hostName',
};
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange(color: string): void;
}) {
  const { colors, t } = useApp();
  const swatch = (color: string, label: string) => {
    const active = value.toLowerCase() === color.toLowerCase();
    return (
      <Pressable
        key={color || 'none'}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: active }}
        onPress={() => onChange(color)}
        hitSlop={4}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          padding: 3,
          borderWidth: 2,
          borderColor: active ? (color || colors.muted) : 'transparent',
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            backgroundColor: color || colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!color && (
            <SymbolView
              name={{ ios: 'circle.slash', android: 'block' }}
              size={16}
              tintColor={colors.muted}
              fallback={null}
            />
          )}
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ padding: 16, gap: 14 }}>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
      >
        {swatch('', t('auto'))}
        {palette.map((color) => swatch(color, color))}
      </View>
      <Field
        label="#RRGGBB"
        value={value}
        onChangeText={onChange}
        maxLength={7}
      />
    </View>
  );
}
export default function Manage() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { mode, id, path, workspaceId, profileId } = params;
  const { t, reload, selected, select, colors } = useApp();
  const { catalog: c, connection } = useRelay();
  const fail = useError();
  const [name, setName] = useState(params.name ?? '');
  const [color, setColor] = useState(params.color ?? '');
  const [projectPath, setPath] = useState('');
  const [branch, setBranch] = useState('');
  const [createBranch, setCreate] = useState(true);
  const [branches, setBranches] = useState<string[]>([]);
  const [presetId, setPreset] = useState(c.presets[0]?.id ?? '');
  const [tabId, setTab] = useState(
    c.tabs.find((tab) => tab.workspaceId === workspaceId)?.id ?? '',
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'worktrees.create') return;
    let active = true;
    void (async () => {
      let offset = 0;
      const list: string[] = [];
      do {
        const r = await client.request('branches.list', { path, offset });
        list.push(...(r.list as string[]));
        if (r.nextOffset === null) break;
        offset = r.nextOffset as number;
      } while (offset < 100000);
      if (active) setBranches(list);
    })().catch(fail);
    return () => {
      active = false;
    };
  }, [mode, path]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (...actions: MobileMutation[]) => {
    setBusy(true);
    try {
      for (const action of actions) {
        const operation = await client.mutate(action);
        if (operation.state === 'failed') throw new Error(operation.code);
      }
      await client.refresh();
      router.dismiss();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (mode === 'host') {
      setBusy(true);
      try {
        await storage.rename(id, name);
        await reload();
        if (selected?.id === id)
          await select((await storage.list()).find((h) => h.id === id) ?? null);
        router.dismiss();
      } catch (error) {
        fail(error);
      } finally {
        setBusy(false);
      }
      return;
    }
    let action: MobileMutation;
    switch (mode) {
      case 'profiles.create':
        action = { type: mode, name };
        break;
      case 'profile': {
        const changes: MobileMutation[] = [];
        if (name !== params.name) changes.push({ type: 'profiles.rename', id, name });
        if (color !== (params.color ?? ''))
          changes.push({ type: 'profiles.color', id, color: color || null });
        if (!changes.length) return router.dismiss();
        return run(...changes);
      }
      case 'project':
        action = { type: 'projects.update', path, name, color: color || null };
        break;
      case 'workspace':
        action = { type: 'workspaces.rename', id, name };
        break;
      case 'projects.add':
        action = { type: mode, profileId, path: projectPath };
        break;
      case 'workspaces.create':
        action = { type: mode, path, name };
        break;
      case 'worktrees.create':
        action = { type: mode, path, name, branch, createBranch };
        break;
      case 'terminals.create':
        action = {
          type: mode,
          workspaceId,
          presetId,
          ...(tabId ? { tabId } : {}),
        };
        break;
      default:
        return;
    }
    await run(action);
  };
  const remove = async () => {
    const target =
      mode === 'profile'
        ? { type: 'profiles.remove' as const, id }
        : mode === 'project'
          ? { type: 'projects.remove' as const, path }
          : { type: 'workspaces.remove' as const, id };
    setBusy(true);
    try {
      const response = await client.request('removal.preview', { target });
      const preview = response as unknown as {
        sessionCount: number;
        workspaceCount: number;
        dirty: boolean;
        worktrees: { name: string }[];
      };
      const warning = `${t('deleteWarning')}\n\n${t('workspaces')}: ${preview.workspaceCount} · Terminal: ${preview.sessionCount}${preview.dirty ? `\n${preview.worktrees.map((w) => w.name).join('\n')}` : ''}`;
      Alert.alert(t('delete'), warning, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: preview.dirty ? t('force') : t('delete'),
          style: 'destructive',
          onPress: () => {
            const action = {
              ...target,
              confirmed: true as const,
              force: preview.dirty,
            };
            if (preview.dirty)
              Alert.alert(t('force'), t('deleteWarning'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('force'),
                  style: 'destructive',
                  onPress: () => void run(action),
                },
              ]);
            else void run(action);
          },
        },
      ]);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const form = mode !== 'terminals.create' && mode !== 'projects.add';
  const colored = mode === 'profile' || mode === 'project';
  const tabs = c.tabs.filter((tab) => tab.workspaceId === workspaceId);
  const invalid =
    busy ||
    (mode !== 'host' && connection !== 'online') ||
    (form && !name.trim()) ||
    (mode === 'projects.add' && !projectPath.trim()) ||
    (mode === 'worktrees.create' && !branch.trim()) ||
    (mode === 'terminals.create' && !presetId) ||
    (colored && !!color && !hex.test(color));
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Stack.Screen
        options={{ title: titles[mode] ? t(titles[mode]) : params.name || t('rename') }}
      />
      {(form || mode === 'projects.add') && (
        <Group>
          <View style={{ padding: 16, gap: 12 }}>
            {form && (
              <Field
                label={t('name')}
                value={name}
                onChangeText={setName}
                maxLength={100}
                autoFocus={!params.name}
              />
            )}
            {mode === 'projects.add' && (
              <Field
                label={t('path')}
                value={projectPath}
                onChangeText={setPath}
                placeholder="/Users/you/projects/example"
                autoFocus
              />
            )}
          </View>
        </Group>
      )}
      {colored && (
        <>
          <SectionTitle>{t('color')}</SectionTitle>
          <Group>
            <ColorPicker value={color} onChange={setColor} />
          </Group>
        </>
      )}
      {mode === 'worktrees.create' && (
        <>
          <SectionTitle>{t('branch')}</SectionTitle>
          <Group>
            <ListRow
              title={t('newBranch')}
              trailing={<Switch value={createBranch} onValueChange={setCreate} />}
            />
            {createBranch && (
              <View style={{ padding: 16 }}>
                <Field
                  label={t('branch')}
                  value={branch}
                  onChangeText={setBranch}
                />
              </View>
            )}
          </Group>
          {!createBranch && (
            <>
              <SectionTitle>{t('existingBranch')}</SectionTitle>
              <Group>
                {branches.map((b) => (
                  <ListRow
                    key={b}
                    title={b}
                    symbol={{ ios: 'arrow.triangle.branch', android: 'fork_right' }}
                    checked={branch === b}
                    onPress={() => setBranch(b)}
                  />
                ))}
              </Group>
            </>
          )}
        </>
      )}
      {mode === 'terminals.create' && (
        <>
          <SectionTitle>{t('preset')}</SectionTitle>
          <Group>
            {c.presets.map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                symbol={{ ios: 'apple.terminal', android: 'terminal' }}
                checked={p.id === presetId}
                onPress={() => setPreset(p.id)}
              />
            ))}
          </Group>
          {tabs.length > 0 && (
            <>
              <SectionTitle>{t('tab')}</SectionTitle>
              <Group>
                {tabs.map((tab) => (
                  <ListRow
                    key={tab.id}
                    title={tab.name}
                    checked={tab.id === tabId}
                    onPress={() => setTab(tab.id)}
                  />
                ))}
              </Group>
            </>
          )}
        </>
      )}
      <View style={{ marginTop: 8 }}>
        <SolidButton
          title={t('save')}
          disabled={invalid}
          onPress={() => void save()}
        />
      </View>
      {['profile', 'project', 'workspace'].includes(mode) && (
        <View style={{ marginTop: 12 }}>
          <Group>
            <ListRow
              tone="danger"
              title={t('remove')}
              symbol={{ ios: 'trash', android: 'delete' }}
              onPress={
                busy || connection !== 'online' ? undefined : () => void remove()
              }
            />
          </Group>
        </View>
      )}
      {mode !== 'host' && connection !== 'online' && (
        <Label muted style={{ textAlign: 'center' }}>
          {t('offline')}
        </Label>
      )}
    </ScrollView>
  );
}
