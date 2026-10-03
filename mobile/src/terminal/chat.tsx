import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { MobileChatMessage } from '@shared/mobileRelay';
import { Label } from '../ui/components';
import { client, useApp } from '../ui/provider';
const POLL_MS = 1500;
const KEEP = 400;
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
interface Transcript {
  available: boolean | null;
  messages: MobileChatMessage[];
}
/** Follows a terminal's Claude transcript while `active`, appending new messages. */
export function useTranscript(sessionId: string, active: boolean): Transcript {
  const [state, setState] = useState<Transcript>({
    available: null,
    messages: [],
  });
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor: { id: string | null; offset?: number } = { id: null };
    const tick = async () => {
      let delay = POLL_MS;
      try {
        const page = await client.transcript(
          sessionId,
          cursor.offset,
          cursor.id,
        );
        if (!alive) return;
        const reset = page.transcriptId !== cursor.id;
        cursor = { id: page.transcriptId, offset: page.offset };
        setState((prev) => {
          const base = reset ? [] : prev.messages;
          const known = new Set(base.map((m) => m.id));
          const added = page.messages.filter((m) => !known.has(m.id));
          if (!reset && !added.length && prev.available === page.available)
            return prev;
          return {
            available: page.available,
            messages: [...base, ...added].slice(-KEEP),
          };
        });
        if (page.more) delay = 0;
      } catch (error) {
        if ((error as Error).message === 'unsupported_action' && alive)
          setState({ available: false, messages: [] });
      }
      if (alive) timer = setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionId, active]);
  return state;
}
/** Minimal inline markdown: **bold** and `code`. */
function Inline({ text, color }: { text: string; color: string }) {
  const { colors } = useApp();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g);
  return (
    <Text style={{ color, fontSize: 16, lineHeight: 23 }}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <Text key={i} style={{ fontWeight: '700' }}>
            {part.slice(2, -2)}
          </Text>
        ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <Text
            key={i}
            style={{
              fontFamily: mono,
              fontSize: 14,
              backgroundColor: colors.card,
            }}
          >
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
function Markdown({ text, color }: { text: string; color: string }) {
  const { colors } = useApp();
  const blocks = text.split(/```[^\n]*\n?/);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, i) => {
        const body = block.replace(/\n+$/, '');
        if (!body) return null;
        if (i % 2 === 1)
          return (
            <ScrollView
              key={i}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ borderRadius: 12, backgroundColor: colors.card }}
              contentContainerStyle={{ padding: 12 }}
            >
              <Text
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  lineHeight: 19,
                  color: colors.text,
                }}
              >
                {body}
              </Text>
            </ScrollView>
          );
        return (
          <View key={i} style={{ gap: 6 }}>
            {body
              .split('\n')
              .filter(
                (line, j, all) => line.trim() || (j > 0 && all[j - 1].trim()),
              )
              .map((line, j) => {
                const heading = /^#{1,6}\s+(.*)$/.exec(line);
                if (heading)
                  return (
                    <Text
                      key={j}
                      style={{
                        color,
                        fontSize: 17,
                        fontWeight: '700',
                        marginTop: 4,
                      }}
                    >
                      {heading[1]}
                    </Text>
                  );
                const bullet = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
                if (bullet)
                  return (
                    <View
                      key={j}
                      style={{
                        flexDirection: 'row',
                        gap: 8,
                        paddingLeft: bullet[1].length * 4,
                      }}
                    >
                      <Text style={{ color, fontSize: 16, lineHeight: 23 }}>
                        {/^\s*\d/.test(line) ? `${/\d+/.exec(line)![0]}.` : '•'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Inline text={bullet[2]} color={color} />
                      </View>
                    </View>
                  );
                if (!line.trim()) return <View key={j} style={{ height: 2 }} />;
                return <Inline key={j} text={line} color={color} />;
              })}
          </View>
        );
      })}
    </View>
  );
}
const toolSymbols: Record<string, SymbolViewProps['name']> = {
  Bash: { ios: 'apple.terminal', android: 'terminal' },
  Shell: { ios: 'apple.terminal', android: 'terminal' },
  Read: { ios: 'doc.text', android: 'description' },
  Edit: { ios: 'pencil', android: 'edit' },
  Write: { ios: 'square.and.pencil', android: 'edit_note' },
  Grep: { ios: 'magnifyingglass', android: 'search' },
  Glob: { ios: 'folder', android: 'folder' },
  WebFetch: { ios: 'globe', android: 'language' },
  WebSearch: { ios: 'globe', android: 'language' },
  Agent: { ios: 'person.2', android: 'group' },
  Task: { ios: 'person.2', android: 'group' },
};
function Tool({ message }: { message: MobileChatMessage }) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 2,
      }}
    >
      <SymbolView
        name={
          toolSymbols[message.tool ?? ''] ?? {
            ios: 'wrench.and.screwdriver',
            android: 'build',
          }
        }
        size={14}
        tintColor={colors.muted}
        fallback={null}
      />
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.muted, fontSize: 13 }}
      >
        <Text style={{ fontWeight: '600' }}>{message.tool}</Text>
        {message.text ? (
          <Text
            style={{ fontFamily: mono, fontSize: 12 }}
          >{`  ${message.text}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}
function Bubble({ message }: { message: MobileChatMessage }) {
  const { colors } = useApp();
  if (message.role === 'tool') return <Tool message={message} />;
  if (message.role === 'user')
    return (
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 20,
          borderBottomRightRadius: 6,
          backgroundColor: colors.accent,
          marginVertical: 6,
        }}
      >
        <Text style={{ color: colors.onAccent, fontSize: 16, lineHeight: 22 }}>
          {message.text}
        </Text>
      </View>
    );
  return (
    <View style={{ marginVertical: 6 }}>
      <Markdown text={message.text} color={colors.text} />
    </View>
  );
}
export function ChatView({
  transcript,
  agentState,
}: {
  transcript: Transcript;
  agentState?: string;
}) {
  const { t, colors } = useApp();
  const scroll = useRef<ScrollView>(null);
  const pinned = useRef(true);
  if (transcript.available === null)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  if (!transcript.available)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 12,
        }}
      >
        <SymbolView
          name={{ ios: 'bubble.left.and.bubble.right', android: 'forum' }}
          size={36}
          tintColor={colors.muted}
          fallback={null}
        />
        <Label muted style={{ textAlign: 'center' }}>
          {t('chatUnavailable')}
        </Label>
      </View>
    );
  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
      keyboardDismissMode="interactive"
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        pinned.current =
          contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
      }}
      scrollEventThrottle={100}
      onContentSizeChange={() => {
        if (pinned.current) scroll.current?.scrollToEnd({ animated: false });
      }}
    >
      {!transcript.messages.length && (
        <Label muted style={{ textAlign: 'center', marginTop: 24 }}>
          {t('emptyChat')}
        </Label>
      )}
      {transcript.messages.map((message) => (
        <Bubble key={message.id} message={message} />
      ))}
      {agentState === 'working' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <ActivityIndicator size="small" color={colors.muted} />
          <Label muted style={{ fontSize: 14 }}>
            {t('agentWorking')}
          </Label>
        </View>
      )}
      {agentState === 'waiting' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <SymbolView
            name={{ ios: 'hand.raised', android: 'pan_tool' }}
            size={16}
            tintColor={colors.accent}
            fallback={null}
          />
          <Label style={{ fontSize: 14, color: colors.accent }}>
            {t('agentWaiting')}
          </Label>
        </View>
      )}
    </ScrollView>
  );
}
