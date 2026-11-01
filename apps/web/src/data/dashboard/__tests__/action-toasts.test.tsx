import { QueryClient, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toastLines } from '../../../lib/action-toast'
import { resetMockDb } from '../../../mocks/dashboard/db'
import {
  useConnectProvider,
  useDeleteAccount,
  useDisconnectProvider,
  useExportAccount,
  useLeaveOrg,
  useRevokeOtherSessions,
  useRevokeSession,
  useUpdateProfile,
} from '../account'
import {
  useCreateKey,
  useRevokeOrgKey,
  useRevokeProjectKey,
  useRevokeWorkspaceKey,
} from '../api-keys'
import {
  useDecideEditRequest,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../inbox'
import {
  useAcceptInvite,
  useAskForNewInvite,
  useDeclineInvite,
  useUndoDeclineInvite,
} from '../invites'
import {
  useCreateItem,
  useImportItem,
  useMoveWorkflows,
  useSetShared,
  useUnshareItem,
} from '../items'
import { useSetLock } from '../locks'
import { useAddWorkspaceMember, useRemoveWorkspaceMember, useSetWorkspaceRole } from '../members'
import {
  useCancelInvite,
  useConnect,
  useDeleteOrg,
  useRemoveConnection,
  useRemoveFromOrg,
  useReplaceToken,
  useResendInvite,
  useSaveAccess,
  useSendInvites,
  useUpdateConnection,
  useUpdateOrg,
} from '../org-settings'
import { useCreateProject, useDeleteProject, useMoveProject, useUpdateProject } from '../projects'
import { useRequestEditAccess } from '../requests'
import { useInstallNode, useUninstallNode, useUpdateNode } from '../resources'
import { MockScenarioProvider } from '../scenario-context'
import { useCreateOrg, useSwitchOrg } from '../session'
import { useDeleteVariable, useSetVariable } from '../variables'
import { useCreateWorkspace, useDeleteWorkspace, useUpdateWorkspace } from '../workspaces'

const org = 'acme'
const sales = { org, project: 'project-101', workspace: 'sales' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each row's hook has its own variable type
type AnyMutation = UseMutationResult<any, any, any, any>

interface Row {
  hook: () => AnyMutation
  vars?: unknown
  data?: unknown
  success: string | null
  error: string | null
}

/** What each dashboard action says: every mutation hook in data/dashboard, by file. */
const ROWS: Record<string, Record<string, Row>> = {
  account: {
    useUpdateProfile: {
      hook: useUpdateProfile,
      vars: { name: 'Ada' },
      success: 'Profile saved',
      error: 'Couldn’t save your profile',
    },
    useLeaveOrg: {
      hook: () => useLeaveOrg(org),
      vars: { id: 'o', slug: 'other' },
      success: 'You left the organization',
      error: 'Couldn’t leave the organization',
    },
    useDeleteAccount: {
      hook: () => useDeleteAccount(org),
      vars: 'x@y.test',
      success: 'Account deleted',
      error: 'Couldn’t delete your account',
    },
    useExportAccount: {
      hook: useExportAccount,
      success: 'Your data is downloading',
      error: 'Couldn’t export your data',
    },
    useConnectProvider: {
      hook: useConnectProvider,
      vars: 'github',
      success: 'Account connected',
      error: 'Couldn’t connect the account',
    },
    useDisconnectProvider: {
      hook: useDisconnectProvider,
      vars: { provider: 'github' },
      success: 'Account disconnected',
      error: 'Couldn’t disconnect the account',
    },
    useRevokeSession: {
      hook: useRevokeSession,
      vars: 's1',
      success: 'Session signed out',
      error: 'Couldn’t sign out that session',
    },
    useRevokeOtherSessions: {
      hook: useRevokeOtherSessions,
      success: 'Other sessions signed out',
      error: 'Couldn’t sign out the other sessions',
    },
  },
  session: {
    useSwitchOrg: { hook: useSwitchOrg, vars: org, success: null, error: null },
    useCreateOrg: {
      hook: useCreateOrg,
      vars: 'Globex',
      success: 'Organization created',
      error: 'Couldn’t create the organization',
    },
  },
  'api-keys': {
    useRevokeProjectKey: {
      hook: () => useRevokeProjectKey(org, sales.project),
      vars: 'k',
      success: 'Key revoked',
      error: 'Couldn’t revoke the key',
    },
    useRevokeWorkspaceKey: {
      hook: () => useRevokeWorkspaceKey(sales),
      vars: 'k',
      success: 'Key revoked',
      error: 'Couldn’t revoke the key',
    },
    useRevokeOrgKey: {
      hook: () => useRevokeOrgKey(org),
      vars: 'k',
      success: 'Key revoked',
      error: 'Couldn’t revoke the key',
    },
    useCreateKey: {
      hook: () => useCreateKey(org),
      vars: {},
      success: 'Key created',
      error: 'Couldn’t create the key',
    },
  },
  inbox: {
    useMarkNotificationRead: {
      hook: () => useMarkNotificationRead(org),
      vars: 'n',
      success: null,
      error: 'Couldn’t mark the notification as read',
    },
    useMarkAllNotificationsRead: {
      hook: () => useMarkAllNotificationsRead(org),
      success: 'All marked as read',
      error: 'Couldn’t mark everything as read',
    },
    'useDecideEditRequest (approve)': {
      hook: () => useDecideEditRequest(org),
      vars: { id: 'r', decision: 'approve' },
      success: 'Request approved',
      error: 'Couldn’t approve the request',
    },
    'useDecideEditRequest (decline)': {
      hook: () => useDecideEditRequest(org),
      vars: { id: 'r', decision: 'decline' },
      success: 'Request declined',
      error: 'Couldn’t decline the request',
    },
  },
  invites: {
    useAcceptInvite: {
      hook: () => useAcceptInvite('t'),
      success: 'Invite accepted',
      error: 'Couldn’t accept the invite',
    },
    useDeclineInvite: {
      hook: () => useDeclineInvite('t'),
      success: 'Invite declined',
      error: 'Couldn’t decline the invite',
    },
    useUndoDeclineInvite: {
      hook: () => useUndoDeclineInvite('t'),
      success: 'Decline undone',
      error: 'Couldn’t undo the decline',
    },
    useAskForNewInvite: {
      hook: () => useAskForNewInvite('t'),
      success: 'New invite requested',
      error: 'Couldn’t ask for a new invite',
    },
  },
  items: {
    'useSetShared (on)': {
      hook: () => useSetShared(sales),
      vars: { itemId: 'i', shared: true },
      success: 'Shared to the project',
      error: 'Couldn’t share it',
    },
    'useSetShared (off)': {
      hook: () => useSetShared(sales),
      vars: { itemId: 'i', shared: false },
      success: 'Unshared',
      error: 'Couldn’t unshare it',
    },
    useUnshareItem: {
      hook: () => useUnshareItem(org, sales.project),
      vars: { workspace: 'sales', itemId: 'i' },
      success: 'Unshared',
      error: 'Couldn’t unshare it',
    },
    'useMoveWorkflows (one)': {
      hook: () => useMoveWorkflows(sales),
      vars: {},
      data: { moved: 1 },
      success: 'Workflow moved',
      error: 'Couldn’t move the workflows',
    },
    'useMoveWorkflows (several)': {
      hook: () => useMoveWorkflows(sales),
      vars: {},
      data: { moved: 3 },
      success: '3 workflows moved',
      error: 'Couldn’t move the workflows',
    },
    'useMoveWorkflows (none)': {
      hook: () => useMoveWorkflows(sales),
      vars: {},
      data: { moved: 0 },
      success: 'No workflows moved',
      error: 'Couldn’t move the workflows',
    },
    useCreateItem: {
      hook: () => useCreateItem(sales),
      vars: { kind: 'script' },
      success: 'Function created',
      error: 'Couldn’t create the function',
    },
    useImportItem: {
      hook: () => useImportItem(sales),
      vars: { fileName: 'a.json', content: '{}' },
      success: 'Workflow imported',
      error: 'Couldn’t import the workflow',
    },
  },
  locks: {
    'useSetLock (workspace, on)': {
      hook: () => useSetLock({ level: 'workspace', ...sales }),
      vars: true,
      success: 'Workspace locked',
      error: 'Couldn’t lock the workspace',
    },
    'useSetLock (project, off)': {
      hook: () => useSetLock({ level: 'project', org, project: sales.project }),
      vars: false,
      success: 'Project unlocked',
      error: 'Couldn’t unlock the project',
    },
  },
  members: {
    useAddWorkspaceMember: {
      hook: () => useAddWorkspaceMember(sales),
      vars: { userId: 'u', role: 'editor' },
      success: 'Member added',
      error: 'Couldn’t add the member',
    },
    useSetWorkspaceRole: {
      hook: () => useSetWorkspaceRole(sales),
      vars: { userId: 'u', role: 'viewer' },
      success: 'Role changed',
      error: 'Couldn’t change the role',
    },
    'useRemoveWorkspaceMember (someone)': {
      hook: () => useRemoveWorkspaceMember(sales),
      vars: { userId: 'u', leaving: false },
      success: 'Member removed',
      error: 'Couldn’t remove the member',
    },
    'useRemoveWorkspaceMember (yourself)': {
      hook: () => useRemoveWorkspaceMember(sales),
      vars: { userId: 'u', leaving: true },
      success: 'You left the workspace',
      error: 'Couldn’t leave the workspace',
    },
  },
  'org-settings': {
    useSaveAccess: {
      hook: () => useSaveAccess(org),
      vars: { userId: 'u', grant: {} },
      success: 'Access saved',
      error: 'Couldn’t save the access',
    },
    useRemoveFromOrg: {
      hook: () => useRemoveFromOrg(org),
      vars: 'u',
      success: 'Removed from the organization',
      error: 'Couldn’t remove them from the organization',
    },
    'useSendInvites (one)': {
      hook: () => useSendInvites(org),
      vars: { emails: ['a@b.test'], role: 'member', places: [] },
      success: 'Invite sent',
      error: 'Couldn’t send the invite',
    },
    'useSendInvites (several)': {
      hook: () => useSendInvites(org),
      vars: { emails: ['a@b.test', 'c@d.test'], role: 'member', places: [] },
      success: '2 invites sent',
      error: 'Couldn’t send the invites',
    },
    useResendInvite: {
      hook: () => useResendInvite(org),
      vars: 'i',
      success: 'Invite sent again',
      error: 'Couldn’t resend the invite',
    },
    useCancelInvite: {
      hook: () => useCancelInvite(org),
      vars: 'i',
      success: 'Invite canceled',
      error: 'Couldn’t cancel the invite',
    },
    useConnect: {
      hook: () => useConnect(org),
      vars: {},
      success: 'Connection added',
      error: 'Couldn’t add the connection',
    },
    useReplaceToken: {
      hook: () => useReplaceToken(org),
      vars: { connectionId: 'c', token: 't' },
      success: 'Token replaced',
      error: 'Couldn’t replace the token',
    },
    useUpdateConnection: {
      hook: () => useUpdateConnection(org),
      vars: { connectionId: 'c', update: {} },
      success: 'Connection saved',
      error: 'Couldn’t save the connection',
    },
    useRemoveConnection: {
      hook: () => useRemoveConnection(org),
      vars: 'c',
      success: 'Connection removed',
      error: 'Couldn’t remove the connection',
    },
    useUpdateOrg: {
      hook: () => useUpdateOrg(org),
      vars: {},
      success: 'Organization saved',
      error: 'Couldn’t save the organization',
    },
    useDeleteOrg: {
      hook: () => useDeleteOrg(org),
      success: 'Organization deleted',
      error: 'Couldn’t delete the organization',
    },
  },
  projects: {
    useCreateProject: {
      hook: () => useCreateProject(org),
      vars: {},
      success: 'Project created',
      error: 'Couldn’t create the project',
    },
    useUpdateProject: {
      hook: () => useUpdateProject(org, sales.project),
      vars: {},
      success: 'Project saved',
      error: 'Couldn’t save the project',
    },
    useDeleteProject: {
      hook: () => useDeleteProject(org, sales.project),
      success: 'Project deleted',
      error: 'Couldn’t delete the project',
    },
    useMoveProject: {
      hook: () => useMoveProject(org, sales.project),
      vars: 'globex',
      success: 'Project moved',
      error: 'Couldn’t move the project',
    },
  },
  requests: {
    useRequestEditAccess: {
      hook: () => useRequestEditAccess(sales),
      success: 'Edit access requested',
      error: 'Couldn’t request edit access',
    },
  },
  resources: {
    useInstallNode: {
      hook: () => useInstallNode(org),
      vars: 'n',
      success: 'Node installed',
      error: 'Couldn’t install the node',
    },
    useUninstallNode: {
      hook: () => useUninstallNode(org),
      vars: 'n',
      success: 'Node uninstalled',
      error: 'Couldn’t uninstall the node',
    },
    useUpdateNode: {
      hook: () => useUpdateNode(org),
      vars: 'n',
      success: 'Node updated',
      error: 'Couldn’t update the node',
    },
  },
  variables: {
    useSetVariable: {
      hook: () => useSetVariable(org),
      vars: {},
      success: 'Variable saved',
      error: 'Couldn’t save the variable',
    },
    useDeleteVariable: {
      hook: () => useDeleteVariable(org),
      vars: {},
      success: 'Variable deleted',
      error: 'Couldn’t delete the variable',
    },
  },
  workspaces: {
    useCreateWorkspace: {
      hook: () => useCreateWorkspace(org, sales.project),
      vars: {},
      success: 'Workspace created',
      error: 'Couldn’t create the workspace',
    },
    useUpdateWorkspace: {
      hook: () => useUpdateWorkspace(sales),
      vars: {},
      success: 'Workspace saved',
      error: 'Couldn’t save the workspace',
    },
    useDeleteWorkspace: {
      hook: () => useDeleteWorkspace(sales),
      success: 'Workspace deleted',
      error: 'Couldn’t delete the workspace',
    },
  },
}

/** Starts the mutation and reads back the meta it carries, without waiting on the dummy server. */
function metaOf(row: Row) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MockScenarioProvider>{children}</MockScenarioProvider>
      </QueryClientProvider>
    )
  }
  const { result } = renderHook(row.hook, { wrapper: Wrapper })
  act(() => result.current.mutate(row.vars))
  return client.getMutationCache().getAll()[0]?.meta?.toast
}

beforeEach(() => resetMockDb())

describe('dashboard action toasts', () => {
  for (const [file, rows] of Object.entries(ROWS)) {
    describe(file, () => {
      for (const [name, row] of Object.entries(rows)) {
        it(`${name} says what the plan says`, () => {
          const meta = metaOf(row)
          expect(meta).toBeDefined()
          expect(toastLines(meta, row.vars, row.data)).toEqual({
            success: row.success,
            error: row.error,
          })
        })
      }
    })
  }

  it('never repeats a server reason in a failure line', () => {
    const lines = Object.values(ROWS).flatMap((rows) => Object.values(rows).map((r) => r.error))
    for (const line of lines) if (line) expect(line).toMatch(/^Couldn’t /)
  })
})
