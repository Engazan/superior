import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import type { ChatAction } from '@shared/native-chat';
import type { MobileChatSummary, MobileNativeChat } from '@shared/mobile-native-chat';
import { client, useApp, useRelay } from '../../ui/provider';
import { Card, Label, SolidButton, useError } from '../../ui/components';
import { TextLink } from '../../ui/kit';
import { Markdown } from '../../terminal/chat';
import { useDraft } from '../../terminal/useDraft';

export default function NativeChats() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const { selected: host, t, colors } = useApp();
  const relay = useRelay();
  const [list, setList] = useState<MobileChatSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [chat, setChat] = useState<MobileNativeChat | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const fail = useError();
  const [error, setError] = useState('');
  const available = relay.connection === 'online' && relay.capabilities?.actions.includes('chat.get');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (!available) return;
      try {
        const next = await client.nativeChats(workspaceId);
        const id = selected || next.at(-1)?.id;
        const detail = id && next.some(c => c.id === id) ? await client.nativeChat(id) : null;
        if (active) { setList(next); setChat(detail); setError(''); }
      } catch (e) { if (active) setError(String(e)); }
      if (active) timer = setTimeout(() => void refresh(), 1500);
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [workspaceId, selected, available, host?.id]);
  const act = async (action: ChatAction) => {
    if (lock.current || !available) return false;
    lock.current = true; setBusy(true);
    try {
      const operation = await client.waitOperation(await client.mutate({ type: 'chat.action', action }));
      if (operation.result?.chatId) {
        setSelected(operation.result.chatId);
        setChat(await client.nativeChat(operation.result.chatId));
      }
      setList(await client.nativeChats(workspaceId));
      return true;
    } catch (e) { fail(e); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const workspace = relay.catalog.workspaces.find(w => w.id === workspaceId);
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
    <Stack.Screen options={{ title: `${t('chat')} · ${workspace?.name ?? ''}` }} />
    <Label muted>{host?.name} · {workspace?.name} · {workspace?.branch}</Label>
    {!available && <Label muted>{t('updateDesktop')}</Label>}
    {error && <Label>{error}</Label>}
    <SolidButton title={t('nativeNew')} disabled={busy || !available} onPress={() => void act({ type: 'create', workspaceId })} />
    {list.map(c => <TextLink key={c.id} title={`${c.title} · ${c.status}`} onPress={() => { setChat(null); setSelected(c.id); }} />)}
    {chat && <Chat key={`${host?.id}:${chat.id}`} chat={chat} act={act} busy={busy || !available} />}
  </ScrollView>;
}
function Chat({ chat, act, busy }: { chat: MobileNativeChat; act: (action: ChatAction) => Promise<boolean>; busy: boolean }) {
  const { t, colors, selected: host } = useApp();
  const fail = useError();
  const { prompt, setPrompt, draftReady } = useDraft(host?.id ?? '', `chat-${chat.id}`, fail);
  const [plan, setPlan] = useState(chat.plan);
  const working = chat.status === 'working' || chat.status === 'waiting';
  return <>
    <Label>{chat.title} · {chat.status}</Label>
    {chat.truncated && <Label muted>{t('nativeExcerpt')}</Label>}
    {chat.items.map(item => <Card key={item.id}><Label muted>{item.kind} · {item.title}</Label><Markdown text={item.text} color={colors.text} />
      {item.kind === 'assistant' && item.complete && !working && <TextLink title={t('nativeFork')} disabled={busy} onPress={() => void act({ type: 'fork', id: chat.id, turnId: item.turnId })} />}
    </Card>)}
    {chat.approvals.map(approval => <Approval key={approval.id} chatId={chat.id} approval={approval} act={act} busy={busy} />)}
    {chat.error && <Label>{chat.error}</Label>}
    {!!chat.workers?.length && <Card>{chat.workers.map(w => <Label key={w.id}>{w.title} · {w.status} · {w.summary}</Label>)}</Card>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Label>Plan mode</Label><Switch value={plan} disabled={busy || working} onValueChange={setPlan} /></View>
    <TextInput multiline accessibilityLabel={t('messageAgent')} value={prompt} onChangeText={setPrompt} maxLength={10000} editable={!busy && draftReady} style={{ color: colors.text, backgroundColor: colors.card, borderRadius: 12, padding: 12, minHeight: 90 }} />
    {working ? <SolidButton title={t('nativeStop')} disabled={busy} onPress={() => void act({ type: 'stop', id: chat.id })} />
      : <SolidButton title={t('send')} disabled={busy || !draftReady || !prompt.trim()} onPress={() => void act({ type: 'send', id: chat.id, text: prompt, plan }).then(ok => { if (ok) setPrompt(''); })} />}
  </>;
}
function Approval({ chatId, approval, act, busy }: { chatId: string; approval: MobileNativeChat['approvals'][number]; act: (action: ChatAction) => Promise<boolean>; busy: boolean }) {
  const { t, colors } = useApp();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return <Card>
    <Label>{approval.title}</Label>
    {approval.requiresDesktop ? <Label>{t('nativeDesktop')}</Label> : <>
      <Markdown text={approval.detail} color={colors.text} />
      {approval.questions?.map(q => <View key={q.id} style={{ gap: 6 }}><Label>{q.question}</Label>
        {q.options.map(option => <TextLink key={option} title={option} onPress={() => setAnswers(a => ({ ...a, [q.id]: option }))} />)}
        <TextInput accessibilityLabel={q.question} secureTextEntry={q.secret} value={answers[q.id] ?? ''} maxLength={1000} onChangeText={text => setAnswers(a => ({ ...a, [q.id]: text }))} style={{ color: colors.text, backgroundColor: colors.bg, borderRadius: 8, padding: 12 }} />
      </View>)}
      {approval.kind === 'question' ? <SolidButton title={t('send')} disabled={busy || approval.questions?.some(q => !answers[q.id]?.trim())} onPress={() => void act({ type: 'answer', id: chatId, requestId: approval.id, answers })} /> : <>
        <SolidButton title={t('nativeApprove')} disabled={busy} onPress={() => void act({ type: 'answer', id: chatId, requestId: approval.id, decision: 'accept' })} />
        <TextLink title={t('nativeDecline')} disabled={busy} onPress={() => void act({ type: 'answer', id: chatId, requestId: approval.id, decision: 'decline' })} />
      </>}
    </>}
  </Card>;
}
