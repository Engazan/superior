import { forwardRef } from 'react';
import { Text } from 'react-native';
import type { TerminalHandle } from './view';
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
>(function TerminalView(_props, _ref) {
  return <Text>Use Superior IDE on iOS or Android.</Text>;
});
