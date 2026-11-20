import { Blocks, CircleHelp, LifeBuoy, Sparkles } from 'lucide-react'
import type {
  EditorSlotProps,
  ExtensionPageProps,
  ExtensionPanelProps,
  WebExtension,
} from '../../types'

function ToolbarButton({ workflowId, org, project, workspace, ids, canEdit }: EditorSlotProps) {
  return (
    <button type="button" data-can-edit={String(canEdit)} data-workspace-id={ids.workspaceId}>
      Assist {workflowId} in {org}/{project}/{workspace}
    </button>
  )
}

function HistoryPage({ org, project, workspace, ids, viewerRole, subpath }: ExtensionPageProps) {
  return (
    <p>
      History of {[org, project, workspace].filter(Boolean).join('/')} ({ids.workspaceId},{' '}
      {viewerRole}){subpath && ` at ${subpath}`}
    </p>
  )
}

function UsagePage({ org, ids, viewerRole }: ExtensionPageProps) {
  return (
    <p>
      Usage of {org} ({ids.organizationId}) as {viewerRole}
    </p>
  )
}

function IntegrationsPage({ org, ids, viewerRole }: ExtensionPageProps) {
  return (
    <p>
      Integrations of {org} ({ids.organizationId}) as {viewerRole}
    </p>
  )
}

function SupportPanel({ org, onClose }: ExtensionPanelProps) {
  return (
    <button type="button" onClick={onClose}>
      Support for {org}
    </button>
  )
}

/** A stand-in for a package plugged in from outside the repo. */
export const testExtension: WebExtension = {
  id: 'test-ext',
  slots: {
    'workspace.nav': [{ path: 'history', label: 'Assistant history', icon: Sparkles }],
    'org.settings.tabs': [{ path: 'usage', label: 'Usage' }],
    'rail.primary': [{ path: 'integrations', label: 'Integrations', icon: Blocks }],
    'rail.panels': [{ id: 'support', label: 'Support', icon: CircleHelp, component: SupportPanel }],
    'rail.secondary': [
      { href: 'https://help.example.test', label: 'Help', icon: LifeBuoy, external: true },
    ],
    'accounts.connect': { path: 'integrations', label: 'Integrations' },
    'canvas.toolbar': ToolbarButton,
    'ide.toolbar': ToolbarButton,
  },
  pages: [
    {
      scope: 'workspace',
      path: 'history',
      nested: true,
      title: 'Assistant history',
      component: HistoryPage,
    },
    { scope: 'org-settings', path: 'usage', title: 'Usage', component: UsagePage },
    { scope: 'org', path: 'integrations', title: 'Integrations', component: IntegrationsPage },
  ],
}
