import { strings, keys, type Language, type Key } from './i18n';
import {
  createContext,
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
interface Preferences {
  language: Language | 'auto';
  theme: Theme;
}
const Context = createContext<null | {
  hosts: SavedHost[];
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
    danger: string;
  };
  dark: boolean;
}>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<SavedHost[]>([]);
  const [selected, setSelected] = useState<SavedHost | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    language: 'auto',
    theme: 'auto',
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
      if (prefs) setPreferences(JSON.parse(prefs));
      const host = list.find((h) => h.id === id) ?? list[0] ?? null;
      setSelected(host);
      await client.select(host);
      if (AppState.currentState !== 'active') client.stop();
    })().catch(() => {});
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
    accent: dark ? '#bca3ff' : '#6d42cc',
    danger: dark ? '#ff999c' : '#b92335',
  };
  return (
    <Context
      value={{
        hosts,
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
