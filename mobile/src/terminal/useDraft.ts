import { useEffect, useRef, useState } from 'react';
import { DraftStore } from '../relay/drafts';
import { storage } from '../ui/provider';
const drafts = new DraftStore(storage.store);
export function useDraft(host: string, session: string, onError: (error: unknown) => void) {
  const scope = JSON.stringify([host, session]);
  const [state, setState] = useState({ scope: '', text: '', ready: false });
  const error = useRef(onError);
  useEffect(() => { error.current = onError; }, [onError]);
  useEffect(() => {
    let active = true;
    void drafts.read(host, session).then(text => {
      if (active) setState({ scope, text, ready: true });
    }).catch(e => { if (active) error.current(e); });
    return () => { active = false; };
  }, [host, session, scope]);
  const ready = state.scope === scope && state.ready;
  const setText = (text: string) => {
    if (!ready) return;
    setState({ scope, text, ready: true });
    void drafts.write(host, session, text).catch(e => error.current(e));
  };
  return { prompt: state.scope === scope ? state.text : '', setPrompt: setText, draftReady: ready };
}
