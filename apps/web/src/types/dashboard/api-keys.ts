// Dashboard types for scoped API keys. Web-only until B3 moves them, with the
// permission catalog, into the package the API checks keys against.

/** What a key reaches: org settings only, a whole project, or one workspace. */
export type KeyLevel = 'organization' | 'project' | 'workspace'

export type KeyAction = 'read' | 'write' | 'delete' | 'deploy' | 'run'

export type KeyResource =
  | 'projects'
  | 'members'
  | 'connections'
  | 'resources'
  | 'audit'
  | 'workspaces'
  | 'workflows'
  | 'runs'
  | 'variables'
  | 'library'

/** The actions a key may take, per resource. A missing resource grants nothing. */
export type KeyPermissions = Partial<Record<KeyResource, KeyAction[]>>

export type KeyPreset = 'read' | 'deploy-run' | 'full'
