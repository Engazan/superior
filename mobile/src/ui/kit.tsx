import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Children, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { MobileUsage } from '@shared/mobileRelay';
import { errorMessage, IconBox, Label } from './components';
import { client, useApp, useRelay } from './provider';
export const green = '#53b786';
export const amber = '#e5a23b';
/** Desktop paths are long; collapse the home directory so the distinctive tail stays visible. */
export function shortPath(path: string) {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[\\/]|$)/, '~');
}
export const providerSymbol = (
  provider: MobileUsage['provider'],
): SymbolViewProps['name'] =>
  provider === 'claude'
    ? { ios: 'asterisk', android: 'emergency' }
    : { ios: 'sparkles', android: 'auto_awesome' };
export function UsageBar({ percent, height = 6 }: { percent: number; height?: number }) {
  const { colors } = useApp();
  const used = Math.min(100, Math.max(0, percent));
  return (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: height,
        backgroundColor: colors.bg,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height,
          width: `${used}%`,
          backgroundColor: used >= 90 ? colors.danger : used >= 70 ? amber : green,
        }}
      />
    </View>
  );
}
export function Dot({ color }: { color: string }) {
  return (
    <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: color }} />
  );
}
export function Chevron() {
  const { colors } = useApp();
  return (
    <SymbolView
      name={{ ios: 'chevron.right', android: 'chevron_right' }}
      size={16}
      tintColor={colors.muted}
      fallback={<Label muted>›</Label>}
    />
  );
}
export function Tile({
  onPress,
  onLongPress,
  disabled,
  children,
}: {
  onPress?(): void;
  onLongPress?(): void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
export function TextLink({
  title,
  symbol,
  onPress,
  disabled = false,
  accent = false,
}: {
  title: string;
  symbol?: SymbolViewProps['name'];
  onPress(): void;
  disabled?: boolean;
  accent?: boolean;
}) {
  const { colors } = useApp();
  const color = accent ? colors.accent : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 8,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      {symbol && (
        <SymbolView name={symbol} size={16} tintColor={color} fallback={null} />
      )}
      <Text style={{ color, fontSize: 15, fontWeight: accent ? '600' : '400' }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function MoreButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        padding: 6,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <SymbolView
        name={{ ios: 'ellipsis', android: 'more_horiz' }}
        size={18}
        tintColor={colors.muted}
        fallback={<Label muted>···</Label>}
      />
    </Pressable>
  );
}
export function Group({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: 'hidden',
      }}
    >
      {Children.toArray(children)
        .filter(Boolean)
        .map((child, i) => (
          <View
            key={i}
            style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.border }}
          >
            {child}
          </View>
        ))}
    </View>
  );
}
export function ListRow({
  title,
  subtitle,
  symbol,
  onPress,
  onLongPress,
  checked = false,
  tone = 'default',
  trailing,
}: {
  title: string;
  subtitle?: string;
  symbol?: SymbolViewProps['name'];
  onPress?(): void;
  onLongPress?(): void;
  checked?: boolean;
  tone?: 'default' | 'accent' | 'danger';
  trailing?: ReactNode;
}) {
  const { colors } = useApp();
  const color =
    tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: checked } : undefined}
      disabled={!onPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: subtitle ? 12 : 14,
        backgroundColor: pressed ? colors.bg : 'transparent',
      })}
    >
      {symbol && (
        <SymbolView name={symbol} size={20} tintColor={color} fallback={null} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 16 }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Label muted style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={1} ellipsizeMode="middle">
            {subtitle}
          </Label>
        )}
      </View>
      {trailing}
      {checked && (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check' }}
          size={18}
          tintColor={colors.accent}
          fallback={<Label style={{ color: colors.accent }}>✓</Label>}
        />
      )}
    </Pressable>
  );
}
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  const { colors } = useApp();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: 14,
        backgroundColor: colors.bg,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              borderRadius: 11,
              backgroundColor: active ? colors.card : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : undefined,
            }}
          >
            <Text
              style={{
                color: active ? colors.text : colors.muted,
                fontSize: 14,
                fontWeight: active ? '600' : '400',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
/** Shown above content whenever the selected desktop is not reachable. */
export function ConnectionBar() {
  const { selected, t, colors } = useApp();
  const state = useRelay();
  const operation = state.operations.at(-1);
  const connecting = ['connecting', 'reconnecting', 'relay'].includes(
    state.connection,
  );
  const status =
    state.connection === 'online'
      ? t('online')
      : state.connection === 'revoked'
        ? t('pairAgain')
        : connecting
          ? t('connecting')
          : t('offline');
  const action = !selected
    ? { title: t('pair'), run: () => router.push('/pair') }
    : state.connection === 'revoked'
      ? { title: t('pairAgain'), run: () => router.push('/pair') }
      : state.connection !== 'online' && !connecting
        ? {
            title: t('reconnect'),
            run: () => {
              client.stop();
              client.resume();
            },
          }
        : null;
  const details = [
    state.error && errorMessage(new Error(state.error), t),
    operation &&
      operation.state !== 'done' &&
      `${t('operations')}: ${t(operation.state === 'uncertain' ? 'uncertainState' : operation.state)}${operation.code ? ` · ${operation.code.replaceAll('_', ' ')}` : ''}`,
  ].filter(Boolean);
  return (
    <Tile onPress={() => router.navigate('/settings')}>
      <IconBox symbol={{ ios: 'desktopcomputer', android: 'computer' }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Label style={{ fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
          {selected?.name ?? t('emptyHosts')}
        </Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Dot
            color={
              state.connection === 'online'
                ? green
                : connecting
                  ? amber
                  : colors.danger
            }
          />
          <Label muted>{status}</Label>
        </View>
        {details.map((line) => (
          <Label key={line as string} muted style={{ fontSize: 13 }}>
            {line}
          </Label>
        ))}
      </View>
      {connecting && <ActivityIndicator color={colors.muted} />}
      {action && <TextLink accent title={action.title} onPress={action.run} />}
    </Tile>
  );
}
