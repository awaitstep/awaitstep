import { Sparkles } from 'lucide-react'
import type { EditorSlotProps, ExtensionPageProps, WebExtension } from '../../types'

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

/** A stand-in for a package plugged in from outside the repo. */
export const testExtension: WebExtension = {
  id: 'test-ext',
  slots: {
    'workspace.nav': [{ path: 'history', label: 'Assistant history', icon: Sparkles }],
    'org.settings.tabs': [{ path: 'usage', label: 'Usage' }],
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
  ],
}
