import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TerminalView, type TerminalHandle } from '../../terminal/view';
import { client, useApp, useRelay } from '../../ui/provider';
import { Label, useError } from '../../ui/components';
import { amber, Dot, green, Segmented } from '../../ui/kit';
import { ChatView, useTranscript } from '../../terminal/chat';
const keys = [
  ['Esc', '\u001b'],
  ['Tab', '\t'],
  ['^C', '\u0003'],
  ['^D', '\u0004'],
  ['^Z', '\u001a'],
  ['↑', '\u001b[A'],
  ['↓', '\u001b[B'],
  ['←', '\u001b[D'],
  ['→', '\u001b[C'],
  ['⏎', '\r'],
] as const;
function KeyCap({
  label,
  onPress,
  disabled,
  active = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  active?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        height: 36,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accent : colors.card,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          color: active ? colors.onAccent : colors.text,
          fontSize: 14,
          fontWeight: '600',
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Tool({
  label,
  symbol,
  onPress,
  active = false,
}: {
  label: string;
  symbol: SymbolViewProps['name'];
  onPress(): void;
  active?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: active ? colors.card : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <SymbolView
        name={symbol}
        size={20}
        tintColor={active ? colors.accent : colors.muted}
        fallback={<Label muted>{label}</Label>}
      />
    </Pressable>
  );
}
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
  const [finding, setFinding] = useState(false);
  const [mode, setMode] = useState<'cli' | 'chat'>('cli');
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
  const send = () => {
    if (!enabled || busy) return;
    void input(ctrl && prompt.length === 1 ? prompt : `${prompt}\r`);
    setPrompt('');
  };
  const font = (delta: number) => {
    const value = Math.min(24, Math.max(9, size + delta));
    setSize(value);
    terminal.current?.send({ type: 'size', size: value });
  };
  const connected = state.connection === 'online';
  const chatSupported =
    !!state.capabilities?.actions.includes('transcript.get');
  const chat = mode === 'chat' && chatSupported;
  const transcript = useTranscript(id, chat && connected);
  const quick: [string, string][] = [
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['↑', '\u001b[A'],
    ['↓', '\u001b[B'],
    ['⏎', '\r'],
    ['Esc', '\u001b'],
  ];
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('kill')}
              disabled={!enabled || !state.capabilities}
              onPress={kill}
              hitSlop={10}
              style={{ opacity: !enabled || !state.capabilities ? 0.35 : 1 }}
            >
              <SymbolView
                name={{ ios: 'xmark.octagon', android: 'cancel' }}
                size={22}
                tintColor={colors.danger}
                fallback={
                  <Label style={{ color: colors.danger }}>{t('kill')}</Label>
                }
              />
            </Pressable>
          ),
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 4,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Dot
            color={
              ended
                ? colors.muted
                : connected
                  ? ready
                    ? green
                    : amber
                  : colors.danger
            }
          />
          <Label muted style={{ fontSize: 13 }} numberOfLines={1}>
            {ended ? t('ended') : connected ? t('online') : t('offline')}
          </Label>
        </View>
        <Segmented<'cli' | 'chat'>
          value={chat ? 'chat' : 'cli'}
          onChange={setMode}
          options={[
            {
              value: 'cli',
              label: 'CLI',
              symbol: { ios: 'apple.terminal', android: 'terminal' },
            },
            {
              value: 'chat',
              label: t('chat'),
              symbol: { ios: 'bubble.left.and.bubble.right', android: 'forum' },
              disabled: !chatSupported,
            },
          ]}
        />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('reconnect')}
            disabled={!connected}
            onPress={() => {
              setEnded(false);
              void client.watchTerminal(id).catch(fail);
            }}
            hitSlop={10}
            style={({ pressed }) => ({
              padding: 6,
              opacity: !connected ? 0.35 : pressed ? 0.6 : 1,
            })}
          >
            <SymbolView
              name={{ ios: 'arrow.clockwise', android: 'refresh' }}
              size={18}
              tintColor={colors.accent}
              fallback={<Label style={{ color: colors.accent }}>{t('reconnect')}</Label>}
            />
          </Pressable>
        </View>
      </View>
      {chat && (
        <ChatView transcript={transcript} agentState={session?.agentState} />
      )}
      <View style={chat ? { height: 0, overflow: 'hidden' } : { flex: 1 }}>
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
      </View>
      <View
        style={{
          paddingTop: 8,
          paddingBottom: Math.max(10, insets.bottom),
          gap: 8,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        {chat ? (
          session?.agentState === 'waiting' && (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
            >
              {quick.map(([label, data]) => (
                <KeyCap
                  key={label}
                  label={label}
                  disabled={!enabled || busy}
                  onPress={() => void input(data)}
                />
              ))}
            </ScrollView>
          )
        ) : (
          <>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
            >
              <KeyCap
                label="Ctrl"
                active={ctrl}
                disabled={!enabled}
                onPress={() => setCtrl(!ctrl)}
              />
              {keys.map(([label, data]) => (
                <KeyCap
                  key={label}
                  label={label}
                  disabled={!enabled || busy}
                  onPress={() => void input(data)}
                />
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
              <Tool
                label={t('find')}
                symbol={{ ios: 'magnifyingglass', android: 'search' }}
                active={finding}
                onPress={() => setFinding(!finding)}
              />
              <Tool
                label={t('copy')}
                symbol={{ ios: 'doc.on.doc', android: 'content_copy' }}
                onPress={() => terminal.current?.send({ type: 'copy' })}
              />
              <Tool
                label={t('selectAll')}
                symbol={{ ios: 'selection.pin.in.out', android: 'select_all' }}
                onPress={() => terminal.current?.send({ type: 'selectAll' })}
              />
              <Tool
                label={t('bottom')}
                symbol={{
                  ios: 'arrow.down.to.line',
                  android: 'vertical_align_bottom',
                }}
                onPress={() => terminal.current?.send({ type: 'bottom' })}
              />
              <Tool
                label={`${t('font')} −`}
                symbol={{
                  ios: 'textformat.size.smaller',
                  android: 'text_decrease',
                }}
                onPress={() => font(-1)}
              />
              <Tool
                label={`${t('font')} +`}
                symbol={{
                  ios: 'textformat.size.larger',
                  android: 'text_increase',
                }}
                onPress={() => font(1)}
              />
            </View>
          </>
        )}
        {finding && !chat && (
          <Pill
            value={search}
            onChangeText={setSearch}
            placeholder={t('find')}
            symbol={{ ios: 'magnifyingglass', android: 'search' }}
            label={t('find')}
            onSubmit={() =>
              terminal.current?.send({ type: 'search', data: search })
            }
          />
        )}
        <Pill
          value={prompt}
          onChangeText={setPrompt}
          placeholder={chat ? t('messageClaude') : t('prompt')}
          editable={enabled && !busy}
          symbol={{ ios: 'arrow.up', android: 'arrow_upward' }}
          label={t('send')}
          disabled={!enabled || busy || !prompt}
          onSubmit={send}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
function Pill({
  value,
  onChangeText,
  placeholder,
  editable = true,
  symbol,
  label,
  disabled = false,
  onSubmit,
}: {
  value: string;
  onChangeText(text: string): void;
  placeholder: string;
  editable?: boolean;
  symbol: SymbolViewProps['name'];
  label: string;
  disabled?: boolean;
  onSubmit(): void;
}) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 12,
        paddingLeft: 16,
        paddingRight: 5,
        minHeight: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={onSubmit}
        submitBehavior="submit"
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 15,
          paddingVertical: 10,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onSubmit}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accent,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        })}
      >
        <SymbolView
          name={symbol}
          size={18}
          tintColor={colors.onAccent}
          fallback={null}
        />
      </Pressable>
    </View>
  );
}
