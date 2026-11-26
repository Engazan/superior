import { TerminalSettingsSection } from './TerminalSettingsSection'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PresetsSection } from './PresetsSection'
import { PromptsSection } from './PromptsSection'
import { DaemonsSection } from './DaemonsSection'
import { KeyboardSection } from './KeyboardSection'
import { IntegrationsSection } from './IntegrationsSection'
import { ShellCommandSection } from './ShellCommandSection'
import { MobileRelaySection } from './MobileRelaySection'
import { GeneralSection, AppearanceSection, CodeBrowserSection, AgentStatusSection } from './settings/GeneralSections'
import { useI18n, type MessageKey } from '../i18n'
import {
  Button,
  ChevronIcon,
  GearIcon,
  BranchIcon,
  PromptIcon,
  BroadcastIcon,
  PhoneIcon,
  KeyboardIcon,
  TerminalIcon,
  SearchIcon,
  AgentIcon,
  CodeIcon,
  SlidersIcon,
  Select
} from './ui'
import type { AgentSession, Folder, PresetsState, TerminalPreset, Workspace } from '../types'

const SECTION_ICONS = {
  general: SlidersIcon,
  appearance: GearIcon,
  keyboard: KeyboardIcon,
  terminal: TerminalIcon,
  codeBrowser: CodeIcon,
  agents: AgentIcon,
  presets: TerminalIcon,
  prompts: PromptIcon,
  integrations: BranchIcon,
  mobile: PhoneIcon,
  shell: TerminalIcon,
  daemons: BroadcastIcon
}

export type SettingsSection = keyof typeof SECTION_ICONS

/** Row titles each section holds, so the nav search also finds individual settings. */
const SECTION_KEYWORDS: Partial<Record<SettingsSection, MessageKey[]>> = {
  general: ['settings.language', 'keyboard.globalHotkey', 'notify.setting', 'onboarding.replayTitle', 'elevation.setting'],
  appearance: ['appearance.theme', 'appearance.accentColor', 'appearance.attentionColor', 'appearance.sidebarWorkspaceTools'],
  keyboard: ['keyboard.openPalette', 'keyboard.toggleSidebar', 'keyboard.searchTerminal'],
  terminal: [
    'terminalSettings.fontFamily',
    'terminalSettings.cursorStyle',
    'terminalSettings.scrollback',
    'terminalSettings.copyOnSelect',
    'terminalSettings.gpuAcceleration'
  ],
  codeBrowser: ['workspaceModes.code', 'workspaceModes.browser', 'fileOpener.title'],
  agents: ['agentHooks.setting', 'usage.tracking', 'usage.primary']
}

interface Props {
  initialSection: SettingsSection
  /** Reports section switches so the last section can be restored on reopen. */
  onSectionChange?: (section: SettingsSection) => void
  onBack: () => void
  onOpenOnboarding: () => void
  /** Called after the user adds/edits/removes an integration, so the sidebar's
   *  clone affordance can refresh. */
  onIntegrationsChanged?: () => void
  presets: TerminalPreset[]
  onSavePreset: (preset: TerminalPreset) => void
  onDeletePreset: (id: string) => void
  onReorderPresets: (orderedIds: string[]) => void
  onTogglePresetActive: (id: string, active: boolean) => void
  onPickPresetImage: () => Promise<{ dataUrl: string } | null>
  onPresetsChanged: (state: PresetsState) => void
  workspaces: Workspace[]
  folders: Folder[]
  onKillSession: (id: string) => void
}

export function SettingsView({
  initialSection,
  onSectionChange,
  onBack,
  onOpenOnboarding,
  onIntegrationsChanged,
  presets,
  onSavePreset,
  onDeletePreset,
  onReorderPresets,
  onTogglePresetActive,
  onPickPresetImage,
  onPresetsChanged,
  workspaces,
  folders,
  onKillSession
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [section, setSectionState] = useState<SettingsSection>(initialSection)
  const contentRef = useRef<HTMLDivElement>(null)
  // Report section changes up so the app can reopen settings where you left off.
  const setSection = (next: SettingsSection): void => {
    setSectionState(next)
    contentRef.current?.scrollTo({ top: 0 })
    onSectionChange?.(next)
  }
  // One poll serves both the nav badge and the Daemons section's list, so an
  // open section doesn't hit the daemon a second time on the same cadence.
  const [daemonSessions, setDaemonSessions] = useState<AgentSession[]>([])
  const [daemonsLoaded, setDaemonsLoaded] = useState(false)
  const refreshDaemons = useCallback(async (): Promise<void> => {
    const sessions = await window.api.restoreSessions().catch(() => null)
    if (!sessions) return
    setDaemonSessions(sessions.filter((s) => s.status === 'running'))
    setDaemonsLoaded(true)
  }, [])

  useEffect(() => {
    void refreshDaemons()
    const id = window.setInterval(() => void refreshDaemons(), 2500)
    return () => window.clearInterval(id)
  }, [refreshDaemons])

  const allGroups: {
    label: string
    items: { id: SettingsSection; label: string; badge?: number }[]
  }[] = [
    {
      label: t('settings.groupYou'),
      items: [
        { id: 'general', label: t('settings.general') },
        { id: 'appearance', label: t('settings.appearance') },
        { id: 'keyboard', label: t('settings.keyboard') }
      ]
    },
    {
      label: t('settings.groupWorkspace'),
      items: [
        { id: 'terminal', label: t('terminalSettings.title') },
        { id: 'codeBrowser', label: t('settings.codeBrowser') }
      ]
    },
    {
      label: t('settings.groupAgents'),
      items: [
        { id: 'agents', label: t('settings.agentStatus') },
        { id: 'presets', label: t('settings.terminalPresets') },
        { id: 'prompts', label: t('settings.prompts') }
      ]
    },
    {
      label: t('settings.groupConnections'),
      items: [
        { id: 'integrations', label: t('settings.integrations') },
        { id: 'mobile', label: t('settings.mobileAccess') },
        { id: 'shell', label: t('settings.shellCommand') }
      ]
    },
    {
      label: t('settings.groupSystem'),
      items: [{ id: 'daemons', label: t('settings.daemons'), badge: daemonSessions.length }]
    }
  ]

  // Search matches a section's name or the titles of the settings it holds.
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const matches = (item: { id: SettingsSection; label: string }): boolean =>
    !needle ||
    item.label.toLocaleLowerCase().includes(needle) ||
    (SECTION_KEYWORDS[item.id] ?? []).some((key) => t(key).toLocaleLowerCase().includes(needle))
  const groups = allGroups
    .map((group) => ({ ...group, items: group.items.filter(matches) }))
    .filter((group) => group.items.length > 0)

  // Arrow keys / Home / End move between nav items (Tab still leaves the nav).
  const onNavKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-settings-nav]'))
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (idx === -1) return
    e.preventDefault()
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  return (
    <div className="settings-layout flex min-h-0 min-w-0 flex-1 gap-2">
      <div className="settings-mobile-nav superior-settings-panel items-center gap-3 bg-bar p-2">
        <Button variant="ghost" onClick={onBack}><ChevronIcon direction="left" />{t('settings.back')}</Button>
        <Select aria-label={t('sidebar.settings')} value={section} onChange={(event) => setSection(event.target.value as SettingsSection)}>
          {allGroups.map((group) => <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => <option key={item.id} value={item.id}>{item.label}{item.badge ? ` (${item.badge})` : ''}</option>)}
          </optgroup>)}
        </Select>
      </div>
      {/* Settings sidebar */}
      <aside className="settings-navigation superior-settings-panel flex w-56 shrink-0 flex-col overflow-hidden bg-bar">
        <div className="border-b border-edge px-2 py-2">
          <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronIcon direction="left" size={16} />
            {t('settings.back')}
          </button>
          <div className="relative mt-2">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fgmuted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && groups[0]) setSection(groups[0].items[0].id)
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder={t('settings.search')}
              aria-label={t('settings.search')}
              className="h-8 w-full rounded-md border border-edge bg-panel pl-8 pr-2 text-sm text-fg placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            />
          </div>
        </div>
        <nav
          aria-label={t('sidebar.settings')}
          onKeyDown={onNavKeyDown}
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
        >
          {groups.length === 0 && (
            <p role="status" className="px-2 text-sm text-fgmuted">{t('settings.searchEmpty')}</p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-fgmuted">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = SECTION_ICONS[item.id]
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-settings-nav
                        onClick={() => setSection(item.id)}
                        aria-current={section === item.id ? 'page' : undefined}
                        className={`relative flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
                          section === item.id
                            ? 'bg-accentBg text-fg'
                            : 'text-fgdim hover:bg-hover hover:text-fg'
                        } focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
                      >
                        {section === item.id && (
                          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                        )}
                        <Icon size={17} className="shrink-0" />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-statusBg px-1.5 text-[10px] font-bold text-status ring-1 ring-inset ring-statusBorder">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Settings content */}
      <div ref={contentRef} className="settings-content superior-settings-panel min-h-0 min-w-0 flex-1 overflow-y-auto bg-panel">
        <div className="settings-content-inner mx-auto w-full max-w-4xl">
          {section === 'terminal' && <TerminalSettingsSection />}
          {section === 'general' && <GeneralSection onOpenOnboarding={onOpenOnboarding} />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'codeBrowser' && <CodeBrowserSection />}
          {section === 'agents' && <AgentStatusSection />}
          {section === 'integrations' && (
            <IntegrationsSection onChanged={onIntegrationsChanged} />
          )}
          {section === 'presets' && (
            <PresetsSection
              presets={presets}
              onSave={onSavePreset}
              onDelete={onDeletePreset}
              onReorder={onReorderPresets}
              onToggleActive={onTogglePresetActive}
              onPickImage={onPickPresetImage}
              onPresetsChanged={onPresetsChanged}
            />
          )}
          {section === 'prompts' && <PromptsSection />}
          {section === 'daemons' && (
            <DaemonsSection
              workspaces={workspaces}
              folders={folders}
              onKill={onKillSession}
              sessions={daemonSessions}
              loading={!daemonsLoaded}
              onRefresh={() => void refreshDaemons()}
            />
          )}
          {section === 'keyboard' && <KeyboardSection />}
          {section === 'shell' && <ShellCommandSection />}
          {section === 'mobile' && <MobileRelaySection />}
        </div>
      </div>
    </div>
  )
}
