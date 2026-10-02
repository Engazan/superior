import { router } from 'expo-router';
import {
  ActivityIndicator,
  Modal,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { client, useApp, useRelay, type Key } from './provider';
import { useState, type ReactNode } from 'react';
export function Label({
  children,
  muted = false,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: object;
}) {
  const { colors } = useApp();
  return (
    <Text
      style={[
        {
          color: muted ? colors.muted : colors.text,
          fontSize: 15,
          lineHeight: 22,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
  small = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  const { colors, dark } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: small ? 12 : 18,
        paddingVertical: small ? 7 : 12,
        borderRadius: 12,
        backgroundColor: danger ? colors.danger : colors.accent,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        alignItems: 'center',
        minHeight: small ? 36 : 44,
      })}
    >
      <Text
        style={{
          color: danger
            ? dark
              ? '#321218'
              : '#fff'
            : dark
              ? '#21135c'
              : '#fff',
          fontWeight: '600',
          fontSize: small ? 13 : 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useApp();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 6 }}>
      <Label muted>{label}</Label>
      <TextInput
        {...props}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={false}
        style={[
          {
            color: colors.text,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            minHeight: 46,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Page({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
    >
      {children}
    </ScrollView>
  );
}
export function errorMessage(error: unknown, t: (key: Key) => string) {
  const code = error instanceof Error ? error.message : String(error);
  if (code === 'uncertain_delivery') return t('uncertain');
  if (code === 'update_desktop') return t('updateDesktop');
  if (code === 'desktop_offline') return t('offline');
  return code.replaceAll('_', ' ');
}
export function useError() {
  const { t } = useApp();
  return (error: unknown) => Alert.alert('Superior', errorMessage(error, t));
}
export function ConnectionBar() {
  const { hosts, selected, select, t, colors } = useApp();
  const state = useRelay();
  const operation = state.operations.at(-1);
  const [choosing, setChoosing] = useState(false);
  const fail = useError();
  const status =
    state.connection === 'online'
      ? t('online')
      : state.connection === 'revoked'
        ? t('pairAgain')
        : ['connecting', 'reconnecting', 'relay'].includes(state.connection)
          ? t('connecting')
          : t('offline');
  return (
    <Card>
      <Modal
        transparent
        visible={choosing}
        animationType="fade"
        onRequestClose={() => setChoosing(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#0009',
            padding: 20,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '80%',
              backgroundColor: colors.card,
              borderRadius: 18,
              padding: 18,
              gap: 12,
            }}
          >
            <Label style={{ fontWeight: '700', fontSize: 20 }}>
              {t('host')}
            </Label>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {hosts.map((host) => (
                <Button
                  key={host.id}
                  title={`${selected?.id === host.id ? '✓ ' : ''}${host.name}`}
                  onPress={() => {
                    setChoosing(false);
                    void select(host).catch(fail);
                  }}
                />
              ))}
            </ScrollView>
            <Button
              title={t('pairAnother')}
              onPress={() => {
                setChoosing(false);
                router.push('/pair');
              }}
            />
            <Button title={t('cancel')} onPress={() => setChoosing(false)} />
          </View>
        </View>
      </Modal>
      <Row>
        <Pressable
          onPress={() => setChoosing(true)}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Label style={{ fontWeight: '700' }}>
            {selected?.name ?? t('emptyHosts')} ▾
          </Label>
        </Pressable>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            backgroundColor:
              state.connection === 'online' ? '#53b786' : colors.muted,
          }}
        />
        <Label muted>{status}</Label>
      </Row>
      {state.error ? (
        <Label muted>{errorMessage(new Error(state.error), t)}</Label>
      ) : null}
      {operation && operation.state !== 'done' && (
        <Label muted>
          {t('operations')}:{' '}
          {t(
            operation.state === 'uncertain'
              ? 'uncertainState'
              : operation.state,
          )}
          {operation.code ? ` · ${operation.code.replaceAll('_', ' ')}` : ''}
        </Label>
      )}
      {!selected ? (
        <Button title={t('pair')} onPress={() => router.push('/pair')} />
      ) : state.connection !== 'online' ? (
        <Button
          small
          title={state.connection === 'revoked' ? t('pairAgain') : t('reconnect')}
          onPress={() => {
            if (state.connection === 'revoked') { router.push('/pair'); return; }
            client.stop();
            client.resume();
          }}
        />
      ) : null}
      {['connecting', 'reconnecting', 'relay'].includes(state.connection) && (
        <ActivityIndicator color={colors.accent} />
      )}
    </Card>
  );
}
