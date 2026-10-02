import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MobileProject, MobileSession, MobileWorkspace } from '@shared/mobileRelay';
import {
  Card,
  IconBox,
  Label,
  SectionTitle,
} from '../../../ui/components';
import {
  amber,
  Chevron,
  ConnectionBar,
  Dot,
  green,
  MoreButton,
  shortPath,
  TextLink,
} from '../../../ui/kit';
import { useApp, useRelay } from '../../../ui/provider';
const manage = (mode: string, params: Record<string, string> = {}) =>
  router.push({ pathname: '/manage', params: { mode, ...params } });
function Profiles({
  selected,
  onSelect,
  editable,
}: {
  selected?: string;
  onSelect(id: string): void;
  editable: boolean;
}) {
  const { colors, t } = useApp();
  const { catalog } = useRelay();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {catalog.profiles.map((p) => {
        const active = p.id === selected;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(p.id)}
            onLongPress={() =>
              editable &&
              manage('profile', { id: p.id, name: p.name, color: p.color ?? '' })
            }
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.border,
              backgroundColor: active ? colors.accent : colors.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {p.color && <Dot color={p.color} />}
            <Text
              style={{
                color: active ? colors.onAccent : colors.text,
                fontSize: 15,
                fontWeight: '600',
              }}
            >
              {p.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('newProfile')}
        disabled={!editable}
        onPress={() => manage('profiles.create')}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: 999,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          opacity: !editable ? 0.35 : pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: colors.muted, fontSize: 15 }}>+ {t('newProfile')}</Text>
      </Pressable>
    </ScrollView>
  );
}
function Session({ session }: { session: MobileSession }) {
  const { colors, t } = useApp();
  const { catalog } = useRelay();
  const known = ['working', 'waiting', 'idle'].includes(session.agentState);
  const tab = session.tabId && catalog.tabs.find((x) => x.id === session.tabId);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/terminal/[id]', params: { id: session.id } })
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: colors.bg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Dot
        color={
          session.agentState === 'working'
            ? green
            : session.agentState === 'waiting'
              ? amber
              : colors.muted
        }
      />
      <View style={{ flex: 1 }}>
        <Label numberOfLines={1}>{session.nickname || session.label}</Label>
        {tab && (
          <Label muted style={{ fontSize: 12 }} numberOfLines={1}>
            {tab.name}
          </Label>
        )}
      </View>
      <Label muted style={{ fontSize: 13 }}>
        {known
          ? t(session.agentState as 'working' | 'waiting' | 'idle')
          : session.status}
      </Label>
      <Chevron />
    </Pressable>
  );
}
function Workspace({
  workspace: w,
  editable,
}: {
  workspace: MobileWorkspace;
  editable: boolean;
}) {
  const { colors, t } = useApp();
  const { catalog } = useRelay();
  const preparing = w.setup !== undefined && w.setup !== 'ready';
  return (
    <View
      style={{
        gap: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label style={{ fontWeight: '600' }} numberOfLines={1}>
            {w.worktree ? '⑂ ' : ''}
            {w.name}
          </Label>
          {(w.branch || preparing) && (
            <Label muted style={{ fontSize: 13 }} numberOfLines={1}>
              {[w.branch, preparing && `${t('preparing')}: ${t(w.setup!)}`]
                .filter(Boolean)
                .join(' · ')}
            </Label>
          )}
        </View>
        <MoreButton
          label={w.name}
          disabled={!editable}
          onPress={() => manage('workspace', { id: w.id, name: w.name })}
        />
      </View>
      {catalog.sessions
        .filter((s) => s.workspaceId === w.id)
        .map((s) => (
          <Session key={s.id} session={s} />
        ))}
      <View style={{ flexDirection: 'row' }}>
        <TextLink
          accent
          title={t('newTerminal')}
          symbol={{ ios: 'plus', android: 'add' }}
          disabled={!editable || preparing}
          onPress={() => manage('terminals.create', { workspaceId: w.id })}
        />
      </View>
    </View>
  );
}
function Project({
  project,
  workspaces,
  editable,
}: {
  project: MobileProject;
  workspaces: MobileWorkspace[];
  editable: boolean;
}) {
  const { colors, t } = useApp();
  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBox
          symbol={
            project.kind === 'remote'
              ? { ios: 'network', android: 'cloud' }
              : { ios: 'folder', android: 'folder' }
          }
        />
        <View style={{ flex: 1 }}>
          <Label
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: project.color ?? colors.text,
            }}
            numberOfLines={1}
          >
            {project.name}
          </Label>
          <Label muted style={{ fontSize: 12 }} numberOfLines={1} ellipsizeMode="middle">
            {shortPath(project.path)}
          </Label>
        </View>
        <MoreButton
          label={project.name}
          disabled={!editable}
          onPress={() =>
            manage('project', {
              path: project.path,
              name: project.name,
              color: project.color ?? '',
            })
          }
        />
      </View>
      {workspaces.map((w) => (
        <Workspace key={w.id} workspace={w} editable={editable} />
      ))}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderTopWidth: workspaces.length ? 1 : 0,
          borderColor: colors.border,
          paddingTop: workspaces.length ? 4 : 0,
        }}
      >
        <TextLink
          title={t('newWorkspace')}
          symbol={{ ios: 'plus.square.on.square', android: 'library_add' }}
          disabled={!editable}
          onPress={() => manage('workspaces.create', { path: project.path })}
        />
        {project.kind === 'local' && (
          <TextLink
            title={t('newWorktree')}
            symbol={{ ios: 'arrow.triangle.branch', android: 'fork_right' }}
            disabled={!editable}
            onPress={() => manage('worktrees.create', { path: project.path })}
          />
        )}
      </View>
    </Card>
  );
}
export default function Projects() {
  const { t, colors } = useApp();
  const { catalog: c, connection, capabilities } = useRelay();
  const [query, setQuery] = useState('');
  const [profileId, setProfile] = useState('');
  const profile = c.profiles.find((p) => p.id === profileId) ?? c.profiles[0];
  const editable = connection === 'online' && !!capabilities;
  const q = query.trim().toLowerCase();
  const projects = c.projects
    .filter((p) => p.profileId === profile?.id)
    .map((project) => {
      const all = c.workspaces.filter((w) => w.folderPath === project.path);
      const hit = (text: string) => text.toLowerCase().includes(q);
      const workspaces =
        !q || hit(`${project.name} ${project.path}`)
          ? all
          : all.filter((w) => hit(`${w.name} ${w.branch ?? ''}`));
      return { project, workspaces, visible: !q || workspaces.length > 0 || hit(project.name) };
    })
    .filter((p) => p.visible);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: t('search'),
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      {connection !== 'online' && <ConnectionBar />}
      {connection === 'online' && !capabilities && (
        <Card>
          <Label muted>{t('updateDesktop')}</Label>
        </Card>
      )}
      {capabilities && (
        <Profiles selected={profile?.id} onSelect={setProfile} editable={editable} />
      )}
      {profile && capabilities && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <SectionTitle>{profile.name}</SectionTitle>
          </View>
          <TextLink
            title={t('settings')}
            symbol={{ ios: 'slider.horizontal.3', android: 'tune' }}
            disabled={!editable}
            onPress={() =>
              manage('profile', {
                id: profile.id,
                name: profile.name,
                color: profile.color ?? '',
              })
            }
          />
          <TextLink
            accent
            title={t('addProject')}
            symbol={{ ios: 'plus', android: 'add' }}
            disabled={!editable}
            onPress={() => manage('projects.add', { profileId: profile.id })}
          />
        </View>
      )}
      {projects.map(({ project, workspaces }) => (
        <Project
          key={`${project.profileId}:${project.path}`}
          project={project}
          workspaces={workspaces}
          editable={editable}
        />
      ))}
      {!projects.length && (
        <Card>
          <Label muted>{t('emptyProjects')}</Label>
        </Card>
      )}
    </ScrollView>
  );
}
