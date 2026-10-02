import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Label, SectionTitle, SolidButton } from './components';
import { useApp, type Key } from './provider';
const steps: [Key, Key][] = [
  ['step1Title', 'step1Body'],
  ['step2Title', 'step2Body'],
  ['step3Title', 'step3Body'],
];
export function Welcome() {
  const { colors, t } = useApp();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingBottom: 40,
        justifyContent: 'space-between',
        gap: 48,
      }}
    >
      <View
        style={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          paddingTop: 48,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: 26,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {t('welcomeTitle')}
        </Text>
        <Label muted style={{ textAlign: 'center', fontSize: 16, lineHeight: 23 }}>
          {t('welcomeBody')}
        </Label>
        <View style={{ marginTop: 12 }}>
          <SolidButton
            title={t('pair')}
            symbol={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
            onPress={() => router.push('/pair')}
          />
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ marginBottom: 8 }}>
          <SectionTitle>{t('howItWorks')}</SectionTitle>
        </View>
        {steps.map(([title, body], i) => (
          <View
            key={title}
            style={{
              flexDirection: 'row',
              gap: 18,
              paddingVertical: 14,
              borderTopWidth: i ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Label muted style={{ fontSize: 14, fontWeight: '600' }}>
                {i + 1}
              </Label>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Label style={{ fontSize: 16, fontWeight: '600' }}>{t(title)}</Label>
              <Label muted style={{ fontSize: 14, lineHeight: 20 }}>
                {t(body)}
              </Label>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
