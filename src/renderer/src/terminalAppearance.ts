import type { ITheme, ITerminalOptions } from '@xterm/xterm'
import type { TerminalSettings } from '@shared/terminalSettings'

// Full 16-colour ANSI palettes so program output is colourful and on-theme:
// Catppuccin-derived ANSI palettes, paired with the app's dark/light surfaces.
export const TERM_THEMES: Record<'light' | 'dark', ITheme> = {
  dark: {
    background: '#12171f',
    foreground: '#e6ebf2',
    cursor: '#f08a72',
    selectionBackground: '#344052',
    black: '#6b7687',
    red: '#ff7f88',
    green: '#7bd39b',
    yellow: '#e8bf73',
    blue: '#83adff',
    magenta: '#d1a2f4',
    cyan: '#6bcbd3',
    white: '#cbd3df',
    brightBlack: '#8c97a8',
    brightRed: '#ff9aa1',
    brightGreen: '#98e0b0',
    brightYellow: '#f2d18f',
    brightBlue: '#a2c1ff',
    brightMagenta: '#dfb9f8',
    brightCyan: '#8bdce1',
    brightWhite: '#f4f7fb'
  },
  light: {
    background: '#ffffff',
    foreground: '#202633',
    cursor: '#bd5845',
    selectionBackground: '#f5d6cf',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc'
  }
}

const SOLARIZED: ITheme = {
  black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2',
  magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', brightBlack: '#002b36',
  brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496',
  brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
}
export function terminalPalette(s: TerminalSettings, mode: 'light' | 'dark'): ITheme {
  const name = mode === 'dark' ? s.darkTheme : s.lightTheme
  let theme = TERM_THEMES[mode]
  if (name === 'dracula') theme = {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9',
    magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', brightBlack: '#6272a4', brightRed: '#ff6e6e',
    brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
    brightCyan: '#a4ffff', brightWhite: '#ffffff'
  }
  if (name === 'solarized') theme = { ...SOLARIZED,
    background: mode === 'dark' ? '#002b36' : '#fdf6e3', foreground: mode === 'dark' ? '#839496' : '#657b83',
    cursor: mode === 'dark' ? '#93a1a1' : '#586e75', selectionBackground: mode === 'dark' ? '#073642' : '#eee8d5'
  }
  return { ...theme, cursor: `${theme.cursor}${Math.round(s.cursorOpacity * 255).toString(16).padStart(2, '0')}` }
}
export function terminalOptions(s: TerminalSettings, mode: 'light' | 'dark'): ITerminalOptions {
  return {
    fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight as ITerminalOptions['fontWeight'],
    fontWeightBold: s.fontWeightBold as ITerminalOptions['fontWeightBold'], lineHeight: s.lineHeight,
    cursorStyle: s.cursorStyle, cursorBlink: s.cursorBlink, theme: terminalPalette(s, mode),
    minimumContrastRatio: s.minimumContrastRatio, scrollback: s.scrollback,
    scrollSensitivity: s.scrollSensitivity, fastScrollSensitivity: s.fastScrollSensitivity,
    // FitAddon reserves this width; keep the compact scrollbar from stealing a column.
    overviewRuler: { width: 1 }
  }
}
