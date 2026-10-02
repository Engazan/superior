import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { Card, Label } from '../ui/components';
import { SessionTile } from '../ui/home';
import { Segmented } from '../ui/kit';
import { useApp, useRelay } from '../ui/provider';
type Filter = 'all' | 'working' | 'waiting';
export default function Terminals() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { t, colors } = useApp();
  const { catalog } = useRelay();
  const filter: Filter =
    params.filter === 'working' || params.filter === 'waiting' ? params.filter : 'all';
  const sessions = catalog.sessions
    .filter((s) => filter === 'all' || s.agentState === filter)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Stack.Screen options={{ title: t('terminals') }} />
      <Segmented<Filter>
        value={filter}
        onChange={(value) => router.setParams({ filter: value })}
        options={[
          { value: 'all', label: `${t('terminals')} · ${catalog.sessions.length}` },
          {
            value: 'working',
            label: `${t('working')} · ${catalog.sessions.filter((s) => s.agentState === 'working').length}`,
          },
          {
            value: 'waiting',
            label: `${t('waiting')} · ${catalog.sessions.filter((s) => s.agentState === 'waiting').length}`,
          },
        ]}
      />
      {sessions.map((s) => (
        <SessionTile key={s.id} session={s} />
      ))}
      {!sessions.length && (
        <Card>
          <Label muted>{t('emptyResume')}</Label>
        </Card>
      )}
    </ScrollView>
  );
}
