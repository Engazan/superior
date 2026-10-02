import { Stack } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  Platform,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useApp, type Key } from './provider';
import type { ReactNode } from 'react';
export function Label({
  children,
  muted = false,
  style,
  numberOfLines,
  ellipsizeMode,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: object;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail';
}) {
  const { colors } = useApp();
  return (
    <Text
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
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
export function SolidButton({
  title,
  symbol,
  onPress,
  disabled = false,
}: {
  title: string;
  symbol?: SymbolViewProps['name'];
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 28,
        paddingVertical: 15,
        borderRadius: 18,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      {symbol && (
        <SymbolView name={symbol} size={20} tintColor={colors.onAccent} fallback={null} />
      )}
      <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '600' }}>
        {title}
      </Text>
    </Pressable>
  );
}
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Label
      muted
      style={{
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginTop: 8,
        marginLeft: 8,
      }}
    >
      {children}
    </Label>
  );
}
export function IconBox({ symbol }: { symbol: SymbolViewProps['name'] }) {
  const { colors } = useApp();
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolView name={symbol} size={22} tintColor={colors.text} fallback={null} />
    </View>
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
          borderRadius: 20,
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
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
    >
      {children}
    </ScrollView>
  );
}
export function TabStack({ name, title }: { name: string; title: string }) {
  const { colors } = useApp();
  const ios = Platform.OS === 'ios';
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: ios,
        headerTransparent: ios,
        headerShadowVisible: false,
        headerStyle: ios ? undefined : { backgroundColor: colors.card },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name={name} options={{ title }} />
    </Stack>
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
