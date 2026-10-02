import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import html from '../generated/terminal-document';
import { client } from '../ui/provider';
import { TerminalStream } from './stream';
export interface TerminalHandle {
  send(message: object): void;
}
export const TerminalView = forwardRef<
  TerminalHandle,
  {
    id: string;
    enabled: boolean;
    cols: number;
    rows: number;
    onError(error: unknown): void;
    onReady(): void;
    onReset(): void;
    onEnd(): void;
  }
>(function TerminalView(
  { id, enabled, cols, rows, onError, onReady, onReset, onEnd },
  ref,
) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const stream = useRef(new TerminalStream());
  const awaiting = useRef(0);
  const resyncing = useRef(false);
  const callbacks = useRef({ onError, onReady, onReset, onEnd });
  callbacks.current = { onError, onReady, onReset, onEnd };
  const send = (message: object) =>
    web.current?.injectJavaScript(
      `window.receive(${JSON.stringify(message)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')});true;`,
    );
  useImperativeHandle(ref, () => ({ send }));
  useEffect(() => {
    if (ready.current) send({ type: 'enabled', enabled });
  }, [enabled]);
  useEffect(() => {
    if (ready.current) send({ type: 'resize', cols, rows });
  }, [cols, rows]);
  useEffect(() => {
    stream.current.reset();
    const off = client.onTerminal((packet) => {
      if (packet.sessionId !== id || !ready.current) return;
      if (packet.type === 'reset' || packet.type === 'disconnected') {
        stream.current.reset();
        awaiting.current = 0;
        callbacks.current.onReset();
        send({ type: 'enabled', enabled: false });
        send({ type: 'reset' });
        return;
      }
      if (packet.type === 'session.exit') {
        callbacks.current.onEnd();
        return;
      }
      if (packet.type === 'error') {
        callbacks.current.onError(new Error('terminal_error'));
        return;
      }
      if (!['terminal.snapshot', 'terminal.data'].includes(packet.type)) return;
      try {
        const chunk = stream.current.accept(packet);
        if (chunk.reset) {
          awaiting.current = 0;
          send({ type: 'reset' });
        }
        awaiting.current += chunk.data.length;
        if (awaiting.current > 2_000_000)
          throw new Error('terminal_render_overflow');
        send({ type: 'write', data: chunk.data });
        if (packet.last && packet.type === 'terminal.snapshot') {
          resyncing.current = false;
          callbacks.current.onReady();
        }
      } catch (error) {
        if (!resyncing.current) {
          callbacks.current.onReset();
          send({ type: 'enabled', enabled: false });
          resyncing.current = true;
          void client.watchTerminal(id).catch(callbacks.current.onError);
        } else {
          void client.watchTerminal(null);
          callbacks.current.onError(error);
        }
      }
    });
    return () => {
      off();
      ready.current = false;
      void client.watchTerminal(null).catch(() => {});
    };
  }, [id]);
  return (
    <WebView
      ref={web}
      source={{ html }}
      originWhitelist={['about:blank']}
      javaScriptEnabled
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
      style={{ flex: 1, backgroundColor: '#0f131a' }}
      onMessage={(event) => {
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'ready') {
            ready.current = true;
            send({ type: 'resize', cols, rows });
            void client.watchTerminal(id).catch(callbacks.current.onError);
          } else if (
            message.type === 'written' &&
            typeof message.bytes === 'number'
          )
            awaiting.current = Math.max(0, awaiting.current - message.bytes);
          else if (message.type === 'input' && typeof message.data === 'string')
            void client
              .input(id, message.data)
              .catch(callbacks.current.onError);
          else if (message.type === 'copy' && typeof message.data === 'string')
            void Clipboard.setStringAsync(message.data).catch(
              callbacks.current.onError,
            );
        } catch (error) {
          callbacks.current.onError(error);
        }
      }}
      onError={(event) =>
        callbacks.current.onError(new Error(event.nativeEvent.description))
      }
    />
  );
});
