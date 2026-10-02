import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { TerminalView, type TerminalHandle } from '../../terminal/view';
import { client, useApp, useRelay } from '../../ui/provider';
import { Button, Field, Label, Row, useError } from '../../ui/components';
export default function Terminal() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, colors } = useApp();
  const state = useRelay();
  const session = state.catalog.sessions.find((s) => s.id === id);
  const fail = useError();
  const terminal = useRef<TerminalHandle>(null);
  const [ready, setReady] = useState(false);
  const [ended, setEnded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState(13);
  const [ctrl, setCtrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = ready && !ended && state.connection === 'online';
  const input = async (data: string) => {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      await client.input(
        id,
        ctrl && data.length === 1
          ? String.fromCharCode(data.toUpperCase().charCodeAt(0) & 31)
          : data,
      );
      setCtrl(false);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const kill = () =>
    Alert.alert(t('kill'), session?.nickname || session?.label, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('kill'),
        style: 'destructive',
        onPress: () => {
          void client
            .mutate({ type: 'terminals.kill', sessionId: id, confirmed: true })
            .then(() => client.refresh())
            .catch(fail);
        },
      },
    ]);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <Stack.Screen
        options={{
          title: session?.nickname || session?.label || 'Terminal',
          headerRight: () => (
            <Button
              small
              danger
              title={t('kill')}
              disabled={!enabled || !state.capabilities}
              onPress={kill}
            />
          ),
        }}
      />
      <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Row>
          <Label muted>
            {ended
              ? t('ended')
              : state.connection === 'online'
                ? t('online')
                : t('offline')}
          </Label>
          <Button
            small
            title={t('reconnect')}
            disabled={state.connection !== 'online'}
            onPress={() => {
              setEnded(false);
              void client.watchTerminal(id).catch(fail);
            }}
          />
        </Row>
      </View>
      <TerminalView
        ref={terminal}
        id={id}
        cols={session?.cols ?? 80}
        rows={session?.rows ?? 24}
        enabled={enabled}
        onError={(error) => {
          setReady(false);
          fail(error);
        }}
        onReady={() => setReady(true)}
        onReset={() => setReady(false)}
        onEnd={() => setEnded(true)}
      />
      <View
        style={{
          padding: 10,
          paddingBottom: Math.max(10, insets.bottom),
          gap: 8,
        }}
      >
        <ScrollView horizontal keyboardShouldPersistTaps="handled">
          <Row>
            {[
              ['Esc', '\u001b'],
              ['Tab', '\t'],
              ['Ctrl+C', '\u0003'],
              ['Ctrl+D', '\u0004'],
              ['Ctrl+Z', '\u001a'],
              ['↑', '\u001b[A'],
              ['↓', '\u001b[B'],
              ['←', '\u001b[D'],
              ['→', '\u001b[C'],
              ['Enter', '\r'],
            ].map(([label, data]) => (
              <Button
                key={label}
                small
                title={label}
                disabled={!enabled || busy}
                onPress={() => void input(data)}
              />
            ))}
            <Button
              small
              title={ctrl ? '✓ Ctrl' : 'Ctrl'}
              disabled={!enabled}
              onPress={() => setCtrl(!ctrl)}
            />
          </Row>
        </ScrollView>
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              label={t('prompt')}
              value={prompt}
              onChangeText={setPrompt}
              editable={enabled && !busy}
              onSubmitEditing={() => {
                if (!enabled || busy) return;
                void input(
                  ctrl && prompt.length === 1 ? prompt : `${prompt}\r`,
                );
                setPrompt('');
              }}
            />
          </View>
          <Button
            small
            title={t('send')}
            disabled={!enabled || busy || !prompt}
            onPress={() => {
              void input(ctrl && prompt.length === 1 ? prompt : `${prompt}\r`);
              setPrompt('');
            }}
          />
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              label={t('find')}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() =>
                terminal.current?.send({ type: 'search', data: search })
              }
            />
          </View>
          <Button
            small
            title={t('find')}
            onPress={() =>
              terminal.current?.send({ type: 'search', data: search })
            }
          />
          <Button
            small
            title={t('copy')}
            onPress={() => terminal.current?.send({ type: 'copy' })}
          />
        </Row>
        <Row>
          <Label muted>
            {t('font')}: {size}
          </Label>
          {[-1, 1].map((delta) => (
            <Button
              key={delta}
              small
              title={delta > 0 ? '+' : '−'}
              onPress={() => {
                const value = Math.min(24, Math.max(9, size + delta));
                setSize(value);
                terminal.current?.send({ type: 'size', size: value });
              }}
            />
          ))}
          <Button
            small
            title={t('selectAll')}
            onPress={() => terminal.current?.send({ type: 'selectAll' })}
          />
          <Button
            small
            title={t('bottom')}
            onPress={() => terminal.current?.send({ type: 'bottom' })}
          />
        </Row>
      </View>
    </KeyboardAvoidingView>
  );
}
