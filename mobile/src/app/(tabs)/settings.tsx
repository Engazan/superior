import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import {
  Button,
  Card,
  ConnectionBar,
  Label,
  Page,
  Row,
  useError,
} from '../../ui/components';
import {
  client,
  storage,
  useApp,
  useRelay,
  type Language,
  type Theme,
} from '../../ui/provider';
export default function Settings() {
  const { hosts, selected, select, reload, preferences, configure, t } =
    useApp();
  const state = useRelay();
  const fail = useError();
  const forget = () => {
    if (!selected) return;
    Alert.alert(t('remove'), t('forgetHint'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            client.stop();
            await storage.remove(selected.id);
            await reload();
            await select((await storage.list())[0] ?? null);
          })().catch(fail);
        },
      },
    ]);
  };
  return (
    <Page>
      <ConnectionBar />
      <Card>
        <Label style={{ fontWeight: '700' }}>{t('host')}</Label>
        {hosts.map((host) => (
          <Button
            key={host.id}
            title={`${host.id === selected?.id ? '✓ ' : ''}${host.name}`}
            onPress={() => void select(host).catch(fail)}
          />
        ))}
        <Button title={t('pairAnother')} onPress={() => router.push('/pair')} />
        {selected && (
          <Row>
            <Button
              small
              title={t('rename')}
              onPress={() =>
                router.push({
                  pathname: '/manage',
                  params: {
                    mode: 'host',
                    id: selected.id,
                    name: selected.name,
                  },
                })
              }
            />
            <Button small danger title={t('remove')} onPress={forget} />
          </Row>
        )}
        {Platform.OS === 'web' && <Label muted>{t('nativeOnly')}</Label>}
      </Card>
      <Card>
        <Label style={{ fontWeight: '700' }}>{t('language')}</Label>
        <Row>
          {(['auto', 'en', 'sk', 'cs', 'pl', 'hu'] as const).map((language) => (
            <Button
              key={language}
              small
              title={`${preferences.language === language ? '✓ ' : ''}${language === 'auto' ? t('auto') : language.toUpperCase()}`}
              onPress={() =>
                void configure({
                  language: language as Language | 'auto',
                }).catch(fail)
              }
            />
          ))}
        </Row>
        <Label style={{ fontWeight: '700' }}>{t('theme')}</Label>
        <Row>
          {(['auto', 'light', 'dark'] as Theme[]).map((theme) => (
            <Button
              key={theme}
              small
              title={`${preferences.theme === theme ? '✓ ' : ''}${t(theme)}`}
              onPress={() => void configure({ theme }).catch(fail)}
            />
          ))}
        </Row>
      </Card>
      {state.operations.length > 0 && (
        <Card>
          <Label style={{ fontWeight: '700' }}>{t('operations')}</Label>
          {state.operations
            .slice()
            .reverse()
            .map((op) => (
              <Label key={op.requestId} muted>
                {new Date(op.startedAt).toLocaleTimeString()} · {t(op.state === 'uncertain' ? 'uncertainState' : op.state)}
                {op.code ? ` · ${op.code.replaceAll('_', ' ')}` : ''}
              </Label>
            ))}
        </Card>
      )}
      <Label muted>
        Superior Mobile · 1.0.0
        {state.capabilities
          ? ` · Desktop ${state.capabilities.desktopVersion}`
          : ''}
      </Label>
    </Page>
  );
}
