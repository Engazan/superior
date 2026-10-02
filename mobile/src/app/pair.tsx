import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Platform, ScrollView, Text, View } from 'react-native';
import { parsePairing, type Pairing } from '../relay/crypto';
import { storage, useApp } from '../ui/provider';
import {
  Field,
  Label,
  Page,
  SolidButton,
  useError,
} from '../ui/components';
import { TextLink } from '../ui/kit';
type Mode = 'intro' | 'scan' | 'paste';
function Centered({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        gap: 16,
      }}
    >
      {children}
    </ScrollView>
  );
}
export default function Pair() {
  const { t, reload, select, colors } = useApp();
  const fail = useError();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('intro');
  const [json, setJson] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [name, setName] = useState('Superior');
  const [busy, setBusy] = useState(false);
  const read = (data: string) => {
    setMode('intro');
    try {
      const p = parsePairing(data, __DEV__);
      setPairing(p);
      setJson('');
    } catch (error) {
      fail(error);
    }
  };
  const scan = async () => {
    const result = permission?.granted ? permission : await requestPermission();
    if (result.granted) setMode('scan');
    else fail(new Error('camera_permission_required'));
  };
  const paste = async () => {
    setMode('paste');
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text.trim()) setJson(text.trim());
  };
  const save = async () => {
    if (!pairing) return;
    setBusy(true);
    try {
      const host = await storage.add(pairing, name);
      await reload();
      await select(host);
      router.dismiss();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  if (Platform.OS === 'web')
    return (
      <Page>
        <Label>{t('nativeOnly')}</Label>
      </Page>
    );
  if (pairing)
    return (
      <Centered>
        <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {t('confirmPair')}
          </Text>
          <View style={{ gap: 2 }}>
            <Label muted style={{ textAlign: 'center' }}>
              {pairing.url}
            </Label>
            <Label muted style={{ textAlign: 'center', fontSize: 13 }}>
              {t('host')}: {pairing.hostId}
            </Label>
          </View>
          <Field label={t('hostName')} value={name} onChangeText={setName} />
          <SolidButton
            title={t('confirmPair')}
            symbol={{ ios: 'checkmark', android: 'check' }}
            disabled={busy || !name.trim()}
            onPress={() => void save()}
          />
        </View>
        <TextLink
          title={t('cancel')}
          onPress={() => {
            if (!busy) setPairing(null);
          }}
        />
      </Centered>
    );
  if (mode === 'scan')
    return (
      <Centered>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            aspectRatio: 1,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => read(data)}
          />
        </View>
        <Label muted style={{ textAlign: 'center' }}>
          {t('pairBody')}
        </Label>
        <TextLink title={t('cancel')} onPress={() => setMode('intro')} />
      </Centered>
    );
  if (mode === 'paste')
    return (
      <Centered>
        <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
          <Label muted style={{ textAlign: 'center' }}>
            {t('pairHint')}
          </Label>
          <Field
            label={t('paste')}
            value={json}
            onChangeText={setJson}
            multiline
            autoFocus={!json}
            secureTextEntry={false}
            style={{ minHeight: 140 }}
            accessibilityLabel={t('paste')}
          />
          <SolidButton
            title={t('continue')}
            disabled={!json.trim()}
            onPress={() => read(json)}
          />
        </View>
        <TextLink title={t('back')} onPress={() => setMode('intro')} />
      </Centered>
    );
  return (
    <Centered>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 22,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {t('pairTitle')}
      </Text>
      <Label muted style={{ textAlign: 'center', maxWidth: 360 }}>
        {t('pairBody')}
      </Label>
      <View style={{ marginTop: 8 }}>
        <SolidButton
          title={t('continue')}
          symbol={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
          onPress={() => void scan().catch(fail)}
        />
      </View>
      <TextLink
        title={t('pasteInstead')}
        symbol={{ ios: 'doc.on.clipboard', android: 'content_paste' }}
        onPress={() => void paste()}
      />
    </Centered>
  );
}
