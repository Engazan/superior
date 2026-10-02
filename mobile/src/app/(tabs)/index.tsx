import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import {
  Button,
  Card,
  ConnectionBar,
  Field,
  Label,
  Page,
  Row,
} from '../../ui/components';
import { useApp, useRelay } from '../../ui/provider';
export default function Projects() {
  const { t, colors } = useApp();
  const { catalog: c, connection, capabilities } = useRelay();
  const [query, setQuery] = useState('');
  const [profileId, setProfile] = useState('');
  const profile = c.profiles.find((p) => p.id === profileId) ?? c.profiles[0];
  const editable = connection === 'online' && !!capabilities;
  const manage = (mode: string, params: Record<string, string> = {}) =>
    router.push({ pathname: '/manage', params: { mode, ...params } });
  return (
    <Page>
      <ConnectionBar />
      <Row>
        {c.profiles.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setProfile(p.id)}
            onLongPress={() =>
              manage('profile', {
                id: p.id,
                name: p.name,
                color: p.color ?? '',
              })
            }
            style={{
              borderWidth: 1,
              borderColor: profile?.id === p.id ? colors.accent : colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.card,
            }}
          >
            <Label style={{ color: p.color ?? colors.text }}>{p.name}</Label>
          </Pressable>
        ))}
      </Row>
      <Row>
        <Button
          small
          title={t('newProfile')}
          disabled={!editable}
          onPress={() => manage('profiles.create')}
        />
        {profile && (
          <>
            <Button
              small
              title={t('addProject')}
              disabled={!editable}
              onPress={() => manage('projects.add', { profileId: profile.id })}
            />
            <Button
              small
              title={t('settings')}
              disabled={!editable}
              onPress={() =>
                manage('profile', {
                  id: profile.id,
                  name: profile.name,
                  color: profile.color ?? '',
                })
              }
            />
          </>
        )}
      </Row>
      <Field label={t('search')} value={query} onChangeText={setQuery} />
      {c.projects
        .filter(
          (p) =>
            p.profileId === profile?.id &&
            (!query ||
              `${p.name} ${p.path} ${c.workspaces
                .filter((w) => w.folderPath === p.path)
                .map((w) => w.name)
                .join(' ')}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        )
        .map((project) => (
          <Card key={`${project.profileId}:${project.path}`}>
            <Row>
              <View style={{ flex: 1 }}>
                <Label
                  style={{
                    fontSize: 19,
                    fontWeight: '700',
                    color: project.color ?? colors.text,
                  }}
                >
                  {project.name}
                </Label>
                <Label muted style={{ fontSize: 12 }}>
                  {project.path}
                </Label>
              </View>
              <Button
                small
                title="···"
                disabled={!editable}
                onPress={() =>
                  manage('project', {
                    path: project.path,
                    name: project.name,
                    color: project.color ?? '',
                  })
                }
              />
            </Row>
            <Row>
              <Button
                small
                title={t('newWorkspace')}
                disabled={!editable}
                onPress={() =>
                  manage('workspaces.create', { path: project.path })
                }
              />
              {project.kind === 'local' && (
                <Button
                  small
                  title={t('newWorktree')}
                  disabled={!editable}
                  onPress={() =>
                    manage('worktrees.create', { path: project.path })
                  }
                />
              )}
            </Row>
            {c.workspaces
              .filter((w) => w.folderPath === project.path)
              .map((w) => (
                <View
                  key={w.id}
                  style={{
                    gap: 10,
                    paddingTop: 14,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Label style={{ fontWeight: '600' }}>
                        {w.worktree ? '⑂ ' : ''}
                        {w.name}
                      </Label>
                      {w.branch && <Label muted>{w.branch}</Label>}
                      {w.setup && w.setup !== 'ready' && (
                        <Label muted>
                          {t('preparing')}: {t(w.setup)}
                        </Label>
                      )}
                    </View>
                    <Button
                      small
                      title="···"
                      disabled={!editable}
                      onPress={() =>
                        manage('workspace', { id: w.id, name: w.name })
                      }
                    />
                  </Row>
                  {c.sessions
                    .filter((s) => s.workspaceId === w.id)
                    .map((s) => (
                      <Pressable
                        accessibilityRole="button"
                        key={s.id}
                        onPress={() =>
                          router.push({
                            pathname: '/terminal/[id]',
                            params: { id: s.id },
                          })
                        }
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: colors.bg,
                        }}
                      >
                        <Row>
                          <Label style={{ flex: 1 }}>
                            {s.nickname || s.label}
                          </Label>
                          <Label muted>
                            {['working', 'waiting', 'idle'].includes(
                              s.agentState,
                            )
                              ? t(
                                  s.agentState as
                                    | 'working'
                                    | 'waiting'
                                    | 'idle',
                                )
                              : s.status}{' '}
                            ›
                          </Label>
                        </Row>
                        {s.tabId && (
                          <Label muted style={{ fontSize: 12 }}>
                            {c.tabs.find((tab) => tab.id === s.tabId)?.name}
                          </Label>
                        )}
                      </Pressable>
                    ))}
                  <Button
                    small
                    title={t('newTerminal')}
                    disabled={
                      !editable ||
                      (w.setup !== undefined && w.setup !== 'ready')
                    }
                    onPress={() =>
                      manage('terminals.create', { workspaceId: w.id })
                    }
                  />
                </View>
              ))}
          </Card>
        ))}
      {!c.projects.length && (
        <Card>
          <Label muted>{t('emptyProjects')}</Label>
        </Card>
      )}
      {!capabilities && c.profiles.length > 0 && (
        <Label muted>{t('updateDesktop')}</Label>
      )}
    </Page>
  );
}
