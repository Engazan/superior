import { strings, keys, type Language, type Key } from './i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getLocales } from 'expo-localization';
import { useFocusEffect } from 'expo-router';
import { RelayClient } from '../relay/client';
import { HostStorage, type SavedHost } from '../relay/storage';

export const storage = new HostStorage({
  get: SecureStore.getItemAsync,
  set: SecureStore.setItemAsync,
  remove: SecureStore.deleteItemAsync,
});
export const client = new RelayClient(
  storage,
  Crypto.randomUUID,
  Crypto.getRandomBytesAsync,
);
export type { Language, Key } from './i18n';
export type Theme = 'auto' | 'light' | 'dark';
export const accents = {
  purple: { light: '#6d42cc', dark: '#bca3ff', onLight: '#ffffff', onDark: '#21135c' },
  blue: { light: '#2563eb', dark: '#8ab4ff', onLight: '#ffffff', onDark: '#0b1f4d' },
  green: { light: '#16794c', dark: '#6fd6a0', onLight: '#ffffff', onDark: '#06301c' },
  orange: { light: '#c2410c', dark: '#ffaa70', onLight: '#ffffff', onDark: '#3d1500' },
  pink: { light: '#be185d', dark: '#ff8fc4', onLight: '#ffffff', onDark: '#45061f' },
  mono: { light: '#211d32', dark: '#f1eef8', onLight: '#f4f3f8', onDark: '#100f17' },
} as const;
export type Accent = keyof typeof accents;
interface Preferences {
  language: Language | 'auto';
  theme: Theme;
  accent: Accent;
}
const Context = createContext<null | {
  hosts: SavedHost[];
  loaded: boolean;
  selected: SavedHost | null;
  select(host: SavedHost | null): Promise<void>;
  reload(): Promise<void>;
  preferences: Preferences;
  configure(p: Partial<Preferences>): Promise<void>;
  t(k: Key): string;
  colors: {
    bg: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    onAccent: string;
    danger: string;
  };
  dark: boolean;
}>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<SavedHost[]>([]);
  const [loaded, setLoaded] = useState(Platform.OS === 'web');
  const [selected, setSelected] = useState<SavedHost | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    language: 'auto',
    theme: 'auto',
    accent: 'purple',
  });
  const scheme = useColorScheme();
  const reload = async () => setHosts(await storage.list());
  const select = async (host: SavedHost | null) => {
    setSelected(host);
    await client.select(host);
  };
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    void (async () => {
      const list = await storage.list();
      const id = await storage.store.get('superior.selected');
      const prefs = await storage.store.get('superior.preferences');
      if (!alive) return;
      setHosts(list);
      setLoaded(true);
      if (prefs) {
        const saved = JSON.parse(prefs) as Partial<Preferences>;
        setPreferences((current) => ({
          ...current,
          ...saved,
          accent: saved.accent && saved.accent in accents ? saved.accent : 'purple',
        }));
      }
      const host = list.find((h) => h.id === id) ?? list[0] ?? null;
      setSelected(host);
      await client.select(host);
      if (AppState.currentState !== 'active') client.stop();
    })().catch(() => setLoaded(true));
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.resume();
      else client.stop();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void client.refresh();
    }, 2000);
    return () => {
      alive = false;
      listener.remove();
      clearInterval(timer);
      client.stop();
    };
  }, []);
  const configure = async (p: Partial<Preferences>) => {
    const next = { ...preferences, ...p };
    await storage.store.set('superior.preferences', JSON.stringify(next));
    setPreferences(next);
  };
  const locale = getLocales()[0]?.languageCode;
  const language =
    preferences.language === 'auto'
      ? locale && locale in strings
        ? (locale as Language)
        : 'en'
      : preferences.language;
  const dark =
    preferences.theme === 'dark' ||
    (preferences.theme === 'auto' && scheme === 'dark');
  const colors = {
    bg: dark ? '#100f17' : '#f4f3f8',
    card: dark ? '#1d1b28' : '#ffffff',
    text: dark ? '#f1eef8' : '#211d32',
    muted: dark ? '#a7a1b8' : '#706a80',
    border: dark ? '#333044' : '#e1ddea',
    accent: dark ? accents[preferences.accent].dark : accents[preferences.accent].light,
    onAccent: dark
      ? accents[preferences.accent].onDark
      : accents[preferences.accent].onLight,
    danger: dark ? '#ff999c' : '#b92335',
  };
  return (
    <Context
      value={{
        hosts,
        loaded,
        selected,
        select,
        reload,
        preferences,
        configure,
        t: (k) =>
          strings[language]?.[keys.indexOf(k)] ?? strings.en[keys.indexOf(k)],
        colors,
        dark,
      }}
    >
      {children}
    </Context>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing provider');
  return value;
}
export function useRelay() {
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
}
export function useUsageRefresh() {
  const { connection, capabilities } = useRelay();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (force = false) => {
    setBusy(true);
    try {
      await client.usage(force);
    } finally {
      setBusy(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (connection !== 'online' || !capabilities) return;
      void refresh().catch(() => {});
      const timer = setInterval(() => void refresh().catch(() => {}), 60000);
      return () => clearInterval(timer);
    }, [connection, capabilities, refresh]),
  );
  return { busy, refresh };
}
