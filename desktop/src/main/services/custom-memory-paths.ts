import * as path from 'path'

/**
 * Pure command/alias builders for custom memory directories that live outside
 * the `~/.claude-<name>` convention: any absolute folder (Desktop, external
 * drive, …) or, on Windows, a folder inside a WSL distro reached through its
 * `\\wsl.localhost\<distro>\…` (or legacy `\\wsl$\…`) share.
 */

export interface LaunchSpec {
  envVar: string
  executable: string
  terminalArgs: string
}

export interface WslLocation {
  /** UNC root of the distro share, e.g. `\\wsl.localhost\Ubuntu`. */
  share: string
  distro: string
  /** The same folder as seen from inside the distro, e.g. `/home/me/.claude-work`. */
  linuxPath: string
}

const WSL_SHARE = /^[\\/]{2}(wsl\.localhost|wsl\$)[\\/]([^\\/]+)((?:[\\/][^\\/]*)*)$/i

/** Split a Windows UNC path into a WSL distro location, or null for any other path. */
export function parseWslPath(input: string): WslLocation | null {
  const match = input.trim().match(WSL_SHARE)
  if (!match) return null
  const [, host, distro, rest] = match
  const segments = rest.split(/[\\/]/).filter(Boolean)
  return {
    share: `\\\\${host}\\${distro}`,
    distro,
    linuxPath: `/${segments.join('/')}`
  }
}

/** The distro user's home (`/home/<user>` or `/root`) that owns `linuxPath`, if any. */
export function wslHomeFor(linuxPath: string): string | null {
  const match = linuxPath.match(/^(\/home\/[^/]+|\/root)(?:\/|$)/)
  return match ? match[1] : null
}

/** Map a distro-internal path back to the Windows UNC path that reaches it. */
export function wslToUnc(location: WslLocation, linuxPath: string): string {
  return `${location.share}${linuxPath.replace(/\//g, '\\')}`
}

/**
 * UNC paths of the rc files (named `names`) in the home of the distro user that
 * owns `dir`; empty for a folder outside any user home. The first is the fallback.
 */
export function wslShellConfigs(dir: string, names: string[]): string[] {
  const wsl = parseWslPath(dir)
  const home = wsl && wslHomeFor(wsl.linuxPath)
  return wsl && home ? names.map((name) => wslToUnc(wsl, `${home}/${name}`)) : []
}

/** Short UI label for a WSL rc file, e.g. `Ubuntu:~/.bashrc`. */
export function wslConfigLabel(file: string): string {
  const wsl = parseWslPath(file)
  return wsl ? `${wsl.distro}:${wsl.linuxPath.replace(/^\/(home\/[^/]+|root)/, '~')}` : file
}

/**
 * Characters that cannot be embedded safely in the generated shell lines, per
 * target. The paths are interpolated into quoted strings (and, for aliases,
 * inside a single-quoted alias body), so anything that would close a quote or
 * trigger expansion is rejected instead of escaped.
 */
const UNSAFE = {
  posix: /["'$`\\\n\r]/,
  windows: /["%$`&|<>^\n\r]/,
  distro: /[^A-Za-z0-9._-]/
}

/** Reason a directory can't be used as a memory folder, or null when it can. */
export function unsupportedPathReason(dir: string, platform: NodeJS.Platform): string | null {
  if (platform === 'win32') {
    const wsl = parseWslPath(dir)
    if (wsl) {
      if (UNSAFE.distro.test(wsl.distro)) return 'Unsupported WSL distribution name.'
      if (wsl.linuxPath === '/') return 'Choose a folder inside the WSL distribution.'
      return UNSAFE.posix.test(wsl.linuxPath) ? 'The folder path contains unsupported characters.' : null
    }
    if (!path.win32.isAbsolute(dir)) return 'Enter an absolute folder path.'
    return UNSAFE.windows.test(dir) ? 'The folder path contains unsupported characters.' : null
  }
  if (!path.posix.isAbsolute(dir)) return 'Enter an absolute folder path.'
  return UNSAFE.posix.test(dir) ? 'The folder path contains unsupported characters.' : null
}

/** `$HOME/<rel>` for folders under the home directory, else the absolute path. */
function posixPathExpr(dir: string, home: string): string {
  const rel = path.posix.relative(home, dir)
  return rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel) ? `$HOME/${rel}` : dir
}

/**
 * Command the daemon runs for a preset backed by `dir`. POSIX runs it in a login
 * shell; Windows runs it through `cmd.exe /c`. A WSL folder launches the CLI
 * inside its distro (login + interactive bash so `~/.local/bin`/nvm are on PATH);
 * the trailing `"$@"` keeps arguments appended later (task prompts) reaching it.
 */
export function customTerminalCommand(
  spec: LaunchSpec,
  dir: string,
  home: string,
  platform: NodeJS.Platform,
  label: string
): string {
  if (platform === 'win32') {
    const wsl = parseWslPath(dir)
    if (wsl) {
      const inner = `${spec.envVar}='${wsl.linuxPath}' exec ${spec.executable} ${spec.terminalArgs} \\"$@\\"`
      return `wsl.exe -d ${wsl.distro} --exec bash -lic "${inner}" ${label}`
    }
    return `set ${spec.envVar}=${dir}&& ${spec.executable} ${spec.terminalArgs}`
  }
  return `${spec.envVar}="${posixPathExpr(dir, home)}" ${spec.executable} ${spec.terminalArgs}`
}

/**
 * Shell alias line for `dir`. Native folders go into the user's own shell config
 * (PowerShell profile on Windows); a WSL folder's alias goes into the distro
 * user's rc file instead, since that's where its CLI runs.
 */
export function customAliasCommand(
  spec: Pick<LaunchSpec, 'envVar' | 'executable'>,
  aliasName: string,
  dir: string,
  home: string,
  platform: NodeJS.Platform
): string {
  if (platform === 'win32') {
    const wsl = parseWslPath(dir)
    if (wsl) return `alias ${aliasName}='${spec.envVar}="${wsl.linuxPath}" ${spec.executable}'`
    return `function ${aliasName} { $env:${spec.envVar}="${dir}"; ${spec.executable} @args }`
  }
  return `alias ${aliasName}='${spec.envVar}="${posixPathExpr(dir, home)}" ${spec.executable}'`
}
