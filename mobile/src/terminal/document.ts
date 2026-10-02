import { Terminal } from '@xterm/xterm';
import { SearchAddon } from '@xterm/addon-search';
const term = new Terminal({
  cols: 80,
  rows: 24,
  scrollback: 5000,
  fontSize: 13,
  fontFamily: 'Menlo, Consolas, monospace',
  allowProposedApi: false,
  theme: { background: '#0f131a', foreground: '#f3f6fb', cursor: '#f08a72' },
  screenReaderMode: true,
  disableStdin: true,
});
const search = new SearchAddon();
term.loadAddon(search);
term.open(document.getElementById('terminal')!);
function post(value: object): void {
  (
    window as unknown as {
      ReactNativeWebView: { postMessage(value: string): void };
    }
  ).ReactNativeWebView.postMessage(JSON.stringify(value));
}
term.onData((data) => post({ type: 'input', data }));
(
  window as unknown as {
    receive: (value: {
      type: string;
      data?: string;
      cols?: number;
      rows?: number;
      size?: number;
      enabled?: boolean;
    }) => void;
  }
).receive = (value) => {
  if (value.type === 'enabled') term.options.disableStdin = !value.enabled;
  if (value.type === 'reset') term.reset();
  if (value.type === 'write' && typeof value.data === 'string')
    term.write(value.data, () =>
      post({ type: 'written', bytes: value.data!.length }),
    );
  if (value.type === 'resize' && value.cols && value.rows)
    term.resize(value.cols, value.rows);
  if (value.type === 'size' && value.size) term.options.fontSize = value.size;
  if (value.type === 'bottom') term.scrollToBottom();
  if (value.type === 'focus') term.focus();
  if (value.type === 'selectAll') term.selectAll();
  if (value.type === 'copy') post({ type: 'copy', data: term.getSelection() });
  if (value.type === 'search' && value.data) search.findNext(value.data);
};
post({ type: 'ready' });
