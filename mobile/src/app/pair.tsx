import { useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Platform, View } from 'react-native';
import { parsePairing, type Pairing } from '../relay/crypto';
import { storage, useApp } from '../ui/provider';
import {
  Button,
  Card,
  Field,
  Label,
  Page,
  Row,
  useError,
} from '../ui/components';
export default function Pair() {
  const { t, reload, select } = useApp();
  const fail = useError();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [json, setJson] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [name, setName] = useState('Superior');
  const [busy, setBusy] = useState(false);
  const read = (data: string) => {
    setScanning(false);
    try {
      const p = parsePairing(data, __DEV__);
      setPairing(p);
      setJson('');
    } catch (error) {
      fail(error);
    }
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
  return (
    <Page>
      <Label muted>{t('pairHint')}</Label>
      {pairing ? (
        <Card>
          <Label style={{ fontWeight: '700', fontSize: 20 }}>
            {t('confirmPair')}
          </Label>
          <Label>{pairing.url}</Label>
          <Label muted>
            {t('host')}: {pairing.hostId}
          </Label>
          <Field label={t('hostName')} value={name} onChangeText={setName} />
          <Button
            title={t('confirmPair')}
            disabled={busy || !name.trim()}
            onPress={() => void save()}
          />
          <Button
            title={t('cancel')}
            disabled={busy}
            onPress={() => setPairing(null)}
          />
        </Card>
      ) : (
        <>
          <Button
            title={t('scan')}
            onPress={() => {
              void (async () => {
                const result = permission?.granted
                  ? permission
                  : await requestPermission();
                if (result.granted) setScanning(true);
                else fail(new Error('camera_permission_required'));
              })().catch(fail);
            }}
          />
          {scanning && (
            <View style={{ height: 300, borderRadius: 18, overflow: 'hidden' }}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => read(data)}
              />
            </View>
          )}
          <Card>
            <Field
              label={t('paste')}
              value={json}
              onChangeText={setJson}
              multiline
              secureTextEntry={false}
              style={{ minHeight: 140 }}
              accessibilityLabel={t('paste')}
            />
            <Row>
              <Button
                title={t('continue')}
                disabled={!json.trim()}
                onPress={() => read(json)}
              />
              {scanning && (
                <Button
                  title={t('cancel')}
                  onPress={() => setScanning(false)}
                />
              )}
            </Row>
          </Card>
        </>
      )}
    </Page>
  );
}
