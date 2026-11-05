import {
  Download,
  LayoutTemplate,
  ListChecks,
  Redo2,
  Settings2,
  Terminal,
  Undo2,
} from 'lucide-react'
import type { TopBarMenuItem } from '../workflows/top-bar-menu'
import type { TopBarVersion } from '../workflows/unified-top-bar'
import { redoWithFeedback, undoWithFeedback } from './time-travel'

export const BLANK_DEPLOY_REASON = 'Add a step first'

export function canvasTopBarVersion(args: {
  isNew: boolean
  currentVersion: number
  olderVersion?: boolean
  /** Missing when the old version is not among the versions the page loaded. */
  readOnlyVersion?: number
  onBackToLatest: () => void
}): TopBarVersion {
  if (args.olderVersion) {
    return {
      kind: 'viewing',
      ...(args.readOnlyVersion !== undefined && { version: args.readOnlyVersion }),
      onBackToLatest: args.onBackToLatest,
    }
  }
  if (args.isNew || args.currentVersion === 0) return { kind: 'blank' }
  return { kind: 'current', version: args.currentVersion }
}

/** The panel a menu item opens, found once the menu has closed. */
export function panelElement(id: 'settings' | 'local-test' | 'templates') {
  return () => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)
}

interface CanvasMenuArgs {
  readOnly: boolean
  isMac: boolean
  canUndo: boolean
  canRedo: boolean
  nodeCount: number
  onOpenSettings: () => void
  onOpenTemplatePicker?: () => void
  onExport?: () => void
  onTestLocally?: () => void
  onCheck: () => void
}

/** The canvas's ⋯ menu, in groups: setup, export, checks, and (narrow bars only) history. */
export function canvasMenuGroups(args: CanvasMenuArgs): TopBarMenuItem[][] {
  const { readOnly, isMac } = args

  const setup: TopBarMenuItem[] = readOnly
    ? []
    : [
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings2,
          onSelect: args.onOpenSettings,
          focusTarget: panelElement('settings'),
        },
        ...(args.onOpenTemplatePicker
          ? [
              {
                id: 'templates',
                label: 'Templates',
                icon: LayoutTemplate,
                onSelect: args.onOpenTemplatePicker,
                // With steps it asks first, in a dialog that takes focus; without, the picker opens.
                ...(args.nodeCount > 0
                  ? { takesFocus: true }
                  : { focusTarget: panelElement('templates') }),
              },
            ]
          : []),
      ]

  const exporting: TopBarMenuItem[] = args.onExport
    ? [{ id: 'export', label: 'Export', icon: Download, onSelect: args.onExport }]
    : []

  const checks: TopBarMenuItem[] = readOnly
    ? []
    : [
        ...(args.onTestLocally
          ? [
              {
                id: 'local-test',
                label: 'Local test',
                icon: Terminal,
                onSelect: args.onTestLocally,
                focusTarget: panelElement('local-test'),
              },
            ]
          : []),
        { id: 'check', label: 'Check workflow', icon: ListChecks, onSelect: args.onCheck },
      ]

  const history: TopBarMenuItem[] = readOnly
    ? []
    : [
        {
          id: 'undo',
          label: 'Undo',
          icon: Undo2,
          shortcut: isMac ? '⌘Z' : 'Ctrl+Z',
          disabled: !args.canUndo,
          hint: args.canUndo ? undefined : 'Nothing to undo',
          onSelect: undoWithFeedback,
          whenCollapsed: 'history',
        },
        {
          id: 'redo',
          label: 'Redo',
          icon: Redo2,
          shortcut: isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z',
          disabled: !args.canRedo,
          hint: args.canRedo ? undefined : 'Nothing to redo',
          onSelect: redoWithFeedback,
          whenCollapsed: 'history',
        },
      ]

  return [setup, exporting, checks, history]
}
