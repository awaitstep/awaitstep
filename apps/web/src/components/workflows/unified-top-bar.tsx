import { useId, useRef, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { ArrowLeft, History, Loader2, Rocket, Save, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { DeployBadge } from '../../lib/workflows/deploy-badge'
import { RouterShellLink, useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { TopBarMenu, type TopBarMenuItem, type TopBarStatusEntry } from './top-bar-menu'
import { ViewSwitch, type EditorView } from './view-switch'
import { WorkflowTitle } from './workflow-title'

export type TopBarSurface = 'canvas' | 'code'

/** What the version slot beside the name says. */
export type TopBarVersion =
  | { kind: 'none' }
  | { kind: 'current'; version: number }
  /** Nothing saved on the canvas yet. */
  | { kind: 'blank' }
  /**
   * An older version is on screen; the badge leads back to the latest. The
   * number is missing when the version is older than the list the page loaded.
   */
  | { kind: 'viewing'; version?: number; onBackToLatest: () => void }

export interface TopBarToggle {
  id: string
  /** Shown beside the icon on wider screens; icon-only without it. */
  label?: string
  icon: LucideIcon
  pressed: boolean
  /** Names the toggle for assistive tech and the tooltip, shortcut included. */
  title: string
  disabled?: boolean
  onClick: () => void
}

export interface TopBarSave {
  /** "Save" on the canvas (a new version), "Save all" in Code (every unsaved file). */
  label: string
  /** Unsaved items to show beside the label. */
  count?: number
  saving: boolean
  disabled: boolean
  /** The tooltip; when disabled it is the reason, and is also read out as the button's description. */
  title: string
  onClick: () => void
}

export interface TopBarDeploy {
  onClick: () => void
  disabled?: boolean
  /** The tooltip; when disabled it is the reason, and is also read out as the button's description. */
  title: string
}

export interface UnifiedTopBarProps {
  surface: TopBarSurface
  name: string
  kind?: 'workflow' | 'script'
  /** Where the name leads (the Overview); plain text without one. */
  overviewHref?: string
  version: TopBarVersion
  nodeCount: number
  deployBadge: (DeployBadge & { href: string }) | null
  /** Canvas | Code. Hidden for a workflow that has no row yet. */
  showViewSwitch?: boolean
  onSelectView: (view: EditorView) => void
  toggles: TopBarToggle[]
  /** Surface-specific controls left of Save (the canvas's undo and redo). */
  history?: ReactNode
  /** Save state shown beside the Save button (saving, unsaved, error). */
  saveStatus?: ReactNode
  /** Why the viewer can't edit, when it is a permission rather than an old version. */
  accessBadge?: { label: string; title: string }
  save: TopBarSave
  /** Canvas only. The Code surface has no Deploy; its slot stays empty so ⋯ does not move. */
  deploy?: TopBarDeploy
  menu: TopBarMenuItem[][]
}

/**
 * The one bar both editing surfaces wear: identity and status on the left,
 * the Canvas | Code switch in the middle, view toggles and workflow actions on
 * the right. Both routes remount when you switch, so the zones sit on the same
 * pixels and the move reads as changing view rather than loading a page.
 * Only the toggles, the history controls and Deploy differ between surfaces.
 *
 * Room is a grid of three columns: the name's column takes what is left and
 * truncates first, the switch sits in the middle, and the actions column is
 * never narrower than its content. While there is room on both sides the
 * switch is centred; when there is not it gives up centring rather than
 * overlap anything. Below that, things collapse by the bar's own width (see
 * `BAR_TIERS`): words become icons, then badges and Undo/Redo move into ⋯.
 */
export function UnifiedTopBar({
  surface,
  name,
  kind,
  overviewHref,
  version,
  nodeCount,
  deployBadge,
  showViewSwitch = true,
  onSelectView,
  toggles,
  history,
  saveStatus,
  accessBadge,
  save,
  deploy,
  menu,
}: UnifiedTopBarProps) {
  const router = useRouter()
  const follow = useGoTo()
  const barRef = useRef<HTMLElement>(null)

  function handleBack() {
    if (router.history.canGoBack()) {
      router.history.back()
    } else {
      router.navigate({
        href: router.history.location.pathname.concat('/overview'),
        replace: true,
      })
    }
  }

  // Below the width the toggles fit, they are choices in ⋯ instead.
  const toggleItems: TopBarMenuItem[] = toggles.map((toggle) => ({
    id: `toggle-${toggle.id}`,
    label: toggle.title,
    icon: toggle.icon,
    onSelect: toggle.onClick,
    disabled: toggle.disabled,
    hint: toggle.pressed ? 'Showing' : undefined,
    whenCollapsed: 'toggles' as const,
  }))
  // The old version's badge is what matters there; the pills would crowd the name.
  const viewing = version.kind === 'viewing'
  const nodeLabel = `${nodeCount} node${nodeCount === 1 ? '' : 's'}`
  const status: TopBarStatusEntry[] = [
    ...(accessBadge
      ? [{ id: 'access', collapsedKey: 'access' as const, label: accessBadge.label }]
      : []),
    ...(nodeCount > 0
      ? [
          {
            id: 'nodes',
            collapsedKey: (viewing ? 'always' : 'nodeCount') as 'nodeCount' | 'always',
            label: nodeLabel,
          },
        ]
      : []),
    ...(deployBadge
      ? [
          {
            id: 'deploy-state',
            collapsedKey: (viewing ? 'always' : 'deployPill') as 'deployPill' | 'always',
            label: deployBadge.label,
            href: deployBadge.href,
          },
        ]
      : []),
  ]

  return (
    <header
      ref={barRef}
      data-surface={surface}
      className="@container relative z-20 h-14 shrink-0 border-b border-border bg-card"
    >
      <div className="grid h-full grid-cols-[minmax(2.5rem,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 px-3 @[640px]:px-4">
        <div
          data-zone="identity"
          className="-m-1 flex min-w-0 items-center gap-1 overflow-hidden p-1 @[640px]:gap-2"
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="hidden h-5 w-px shrink-0 bg-muted/70 @[640px]:block" />
          <WorkflowTitle
            name={name}
            kind={kind}
            version={version.kind === 'current' ? version.version : undefined}
            href={overviewHref}
          >
            <VersionBadge version={version} />
            {nodeCount > 0 && !viewing && (
              <span className="hidden shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary @[880px]:inline-flex">
                {nodeLabel}
              </span>
            )}
            {deployBadge && !viewing && (
              <RouterShellLink
                href={deployBadge.href}
                className={cn(
                  'hidden shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium transition-colors @[1240px]:inline-block',
                  deployBadge.tone === 'warning'
                    ? 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
                    : 'bg-status-success/10 text-status-success hover:bg-status-success/20',
                )}
              >
                {deployBadge.label}
              </RouterShellLink>
            )}
          </WorkflowTitle>
        </div>

        <div data-zone="switch" className="flex justify-center">
          {showViewSwitch && <ViewSwitch current={surface} onSelect={onSelectView} />}
        </div>

        <div
          data-zone="actions"
          className="flex items-center justify-end justify-self-end gap-1 @[640px]:gap-1.5"
        >
          <div data-zone="toggles" className="hidden shrink-0 items-center gap-1 @[520px]:flex">
            {toggles.map((toggle) => (
              <BarToggle key={toggle.id} toggle={toggle} />
            ))}
          </div>
          <div className="hidden h-5 w-px shrink-0 bg-muted/70 @[800px]:block" />
          {accessBadge && (
            <span
              title={accessBadge.title}
              className="hidden shrink-0 rounded bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground @[800px]:inline"
            >
              {accessBadge.label}
            </span>
          )}
          {history}
          {saveStatus}
          <SaveButton save={save} />
          <div data-zone="menu" className="shrink-0">
            <TopBarMenu
              groups={[toggleItems, ...menu]}
              status={status}
              barRef={barRef}
              onFollow={follow}
            />
          </div>
          <div
            data-zone="deploy"
            className={cn(
              'justify-end',
              deploy
                ? 'flex w-9 shrink-0 @[800px]:w-[5.5rem]'
                : 'hidden w-[5.5rem] shrink-0 @[1040px]:flex',
            )}
          >
            {deploy && <DeployButton deploy={deploy} />}
          </div>
        </div>
      </div>
    </header>
  )
}

function VersionBadge({ version }: { version: TopBarVersion }) {
  if (version.kind === 'blank') {
    return (
      <span className="shrink-0 whitespace-nowrap rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
        No version yet
      </span>
    )
  }
  if (version.kind !== 'viewing') return null
  const known = version.version !== undefined
  return (
    <button
      type="button"
      onClick={version.onBackToLatest}
      aria-label={
        known
          ? `Viewing v${version.version}, back to latest`
          : 'Viewing an older version, back to latest'
      }
      title="You’re viewing an older version. Open the latest."
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/20"
    >
      <History className="h-3 w-3" />
      <span className="hidden @[880px]:inline">
        {known ? `v${version.version}` : 'Older version'} · back to latest
      </span>
      <span className="@[880px]:hidden">{known ? `v${version.version}` : 'Older'} · latest</span>
    </button>
  )
}

function BarToggle({ toggle }: { toggle: TopBarToggle }) {
  const Icon = toggle.icon
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle.onClick}
      disabled={toggle.disabled}
      title={toggle.title}
      aria-label={toggle.title}
      aria-pressed={toggle.pressed}
      className={cn(
        'h-8',
        toggle.label ? 'gap-1.5 px-2 @[800px]:px-2.5' : 'w-8 px-0',
        toggle.pressed
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {toggle.label && <span className="hidden text-xs @[800px]:inline">{toggle.label}</span>}
    </Button>
  )
}

/**
 * Not the `disabled` attribute: it takes the button out of the Tab order and
 * hides its tooltip, so a keyboard or screen-reader user could never learn why
 * Save or Deploy is off. The button stays focusable, refuses the click, and
 * its reason is its description.
 */
function SoftDisabled({
  disabled,
  reason,
  children,
}: {
  disabled: boolean
  reason: string
  children: (props: { 'aria-disabled'?: true; 'aria-describedby'?: string }) => ReactNode
}) {
  const reasonId = useId()
  return (
    <>
      {children(disabled ? { 'aria-disabled': true, 'aria-describedby': reasonId } : {})}
      {disabled && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  )
}

function SaveButton({ save }: { save: TopBarSave }) {
  // Saving is also the moment Save is refused: its own word says so, once.
  const off = save.disabled || save.saving
  function handleClick() {
    if (!off) save.onClick()
  }
  return (
    <SoftDisabled disabled={off} reason={save.saving ? 'Saving…' : save.title}>
      {(aria) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          title={save.saving ? 'Saving…' : save.title}
          aria-label={save.count ? `${save.label} (${save.count})` : save.label}
          aria-busy={save.saving || undefined}
          className={cn(
            'h-8 shrink-0 gap-1.5 px-2 @[800px]:px-2.5',
            off
              ? 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground'
              : 'text-foreground hover:text-foreground',
          )}
          {...aria}
        >
          {save.saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span className="hidden text-xs @[800px]:inline">
            {save.saving ? 'Saving…' : save.label}
          </span>
          {save.count !== undefined && save.count > 0 && (
            <span className="rounded-full bg-status-warning/15 px-1.5 py-px text-[10px] tabular-nums text-status-warning">
              {save.count}
            </span>
          )}
        </Button>
      )}
    </SoftDisabled>
  )
}

function DeployButton({ deploy }: { deploy: TopBarDeploy }) {
  const off = !!deploy.disabled
  function handleClick() {
    if (!off) deploy.onClick()
  }
  return (
    <SoftDisabled disabled={off} reason={deploy.title}>
      {(aria) => (
        <Button
          size="sm"
          className={cn(
            'h-8 w-full gap-1.5 px-2.5',
            off && 'cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary',
          )}
          onClick={handleClick}
          title={deploy.title}
          aria-label="Deploy"
          {...aria}
        >
          <Rocket className="h-3.5 w-3.5" />
          <span className="hidden text-xs @[800px]:inline">Deploy</span>
        </Button>
      )}
    </SoftDisabled>
  )
}
