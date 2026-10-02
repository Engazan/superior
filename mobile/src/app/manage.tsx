import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Switch } from 'react-native';
import type { MobileMutation } from '@shared/mobileRelay';
import { client, storage, useApp, useRelay } from '../ui/provider';
import {
  Button,
  Card,
  Field,
  Label,
  Page,
  Row,
  useError,
} from '../ui/components';
export default function Manage() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { mode, id, path, workspaceId, profileId } = params;
  const { t, reload, selected, select } = useApp();
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
  const run = async (action: MobileMutation) => {
    setBusy(true);
    try {
      const operation = await client.mutate(action);
      if (operation.state === 'failed') throw new Error(operation.code);
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
      case 'profile':
        action = { type: 'profiles.rename', id, name };
        break;
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
  return (
    <Page>
      <Card>
        {form && (
          <Field
            label={t('name')}
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
        )}
        {mode === 'projects.add' && (
          <Field
            label={t('path')}
            value={projectPath}
            onChangeText={setPath}
            placeholder="/Users/you/projects/example"
          />
        )}
        {['profile', 'project'].includes(mode) && (
          <>
            <Field
              label={`${t('color')} (#RRGGBB)`}
              value={color}
              onChangeText={setColor}
              maxLength={7}
            />
            {mode === 'profile' && (
              <Button
                title={t('color')}
                disabled={busy || (!!color && !/^#[0-9a-f]{6}$/i.test(color))}
                onPress={() =>
                  void run({ type: 'profiles.color', id, color: color || null })
                }
              />
            )}
          </>
        )}
        {mode === 'worktrees.create' && (
          <>
            <Row>
              <Label>{t('newBranch')}</Label>
              <Switch value={createBranch} onValueChange={setCreate} />
            </Row>
            {createBranch ? (
              <Field
                label={t('branch')}
                value={branch}
                onChangeText={setBranch}
              />
            ) : (
              <>
                <Label muted>{t('existingBranch')}</Label>
                <Row>
                  {branches.map((b) => (
                    <Button
                      key={b}
                      small
                      title={`${branch === b ? '✓ ' : ''}${b}`}
                      onPress={() => setBranch(b)}
                    />
                  ))}
                </Row>
              </>
            )}
          </>
        )}
        {mode === 'terminals.create' && (
          <>
            <Label>{t('preset')}</Label>
            <Row>
              {c.presets.map((p) => (
                <Button
                  key={p.id}
                  title={`${p.id === presetId ? '✓ ' : ''}${p.name}`}
                  onPress={() => setPreset(p.id)}
                />
              ))}
            </Row>
            <Label>{t('tab')}</Label>
            <Row>
              {c.tabs
                .filter((tab) => tab.workspaceId === workspaceId)
                .map((tab) => (
                  <Button
                    key={tab.id}
                    title={`${tab.id === tabId ? '✓ ' : ''}${tab.name}`}
                    onPress={() => setTab(tab.id)}
                  />
                ))}
            </Row>
          </>
        )}
        <Button
          title={t('save')}
          disabled={
            busy ||
            (mode !== 'host' && connection !== 'online') ||
            (form && !name.trim()) ||
            (mode === 'projects.add' && !projectPath.trim()) ||
            (mode === 'worktrees.create' && !branch.trim()) ||
            (mode === 'terminals.create' && !presetId) ||
            (mode === 'project' && !!color && !/^#[0-9a-f]{6}$/i.test(color))
          }
          onPress={() => void save()}
        />
        {['profile', 'project', 'workspace'].includes(mode) && (
          <Button
            danger
            title={t('remove')}
            disabled={busy || connection !== 'online'}
            onPress={() => void remove()}
          />
        )}
      </Card>
    </Page>
  );
}
