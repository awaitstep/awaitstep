import { describe, expect, it } from 'vitest'
import { defaultAccountChoices, workspaceAccountText } from '../account-choices'

describe('defaultAccountChoices', () => {
  it('offers the project’s usable accounts, then the org’s it may add', () => {
    const choices = defaultAccountChoices(
      [
        { id: 'prod', name: 'Acme production', scope: 'shared', available: true },
        { id: 'own', name: 'Checkout staging', scope: 'project', available: true },
        { id: 'gone', name: 'Old account', scope: 'shared', available: false },
      ],
      [
        { id: 'prod', name: 'Acme production', state: 'added' },
        { id: 'new', name: 'Data platform', state: 'available' },
        { id: 'elsewhere', name: 'Marketing', state: 'restricted' },
      ],
      'Acme Inc',
    )
    expect(choices).toEqual([
      { id: 'prod', name: 'Acme production', description: 'Shared by Acme Inc', attached: true },
      { id: 'own', name: 'Checkout staging', description: 'This project only', attached: true },
      { id: 'new', name: 'Data platform', description: 'Not added yet', attached: false },
    ])
  })
})

describe('workspaceAccountText', () => {
  it('names its own account, the project default, or none', () => {
    expect(workspaceAccountText({ source: 'override', connectionName: 'Checkout' })).toBe(
      'Checkout',
    )
    expect(workspaceAccountText({ source: 'default', connectionName: 'Prod' })).toBe(
      'Project default (Prod)',
    )
    expect(workspaceAccountText({ source: 'none', connectionName: null })).toBe('None yet')
  })
})
