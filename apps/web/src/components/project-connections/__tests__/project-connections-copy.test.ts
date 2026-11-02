import { describe, expect, it } from 'vitest'
import {
  accountMeta,
  accountsCaption,
  availableNote,
  deployedFromText,
  removeText,
  restrictedText,
  scopeLabel,
  usageText,
} from '../project-connections-copy'

const NOW = new Date('2026-11-01T12:00:00.000Z')

describe('accountsCaption', () => {
  const shared = { scope: 'shared' as const, available: true }
  const gone = { scope: 'shared' as const, available: false }
  const owned = { scope: 'project' as const, available: true }

  it('counts shared and owned accounts, the shared ones as available', () => {
    expect(accountsCaption([shared, shared, owned])).toBe('Two available, one it owns')
    expect(accountsCaption([shared])).toBe('One available')
    expect(accountsCaption([owned, owned])).toBe('Two it owns')
    expect(accountsCaption([])).toBe('None yet')
  })

  it('does not call a shared account available once it was restricted away from the project', () => {
    expect(accountsCaption([shared, gone, owned])).toBe(
      'One available, one it owns, one no longer available',
    )
    expect(accountsCaption([gone])).toBe('One no longer available')
    expect(accountsCaption([gone, gone, owned])).toBe('One it owns, two no longer available')
  })
})

describe('account lines', () => {
  it('names the account by its suffix and who added it', () => {
    expect(accountMeta({ accountSuffix: '7f2a', createdByName: 'Ama Mensah' })).toBe(
      'Cloudflare account ••••7f2a · added by Ama Mensah',
    )
    expect(accountMeta({ accountSuffix: null, createdByName: null })).toBe('Cloudflare account')
  })

  it('says whose account it is', () => {
    expect(scopeLabel({ scope: 'shared' }, 'Acme Inc')).toBe('Shared by Acme Inc')
    expect(scopeLabel({ scope: 'project' }, 'Acme Inc')).toBe('This project only')
  })

  it('lists the workspaces that deployed with it, and its usage', () => {
    expect(deployedFromText(['Support'])).toBe('Deployed from Support')
    expect(deployedFromText(['IT', 'Sales', 'Support'])).toBe('Deployed from IT, Sales and Support')
    expect(deployedFromText([])).toBe('Not deployed from any workspace yet')
    expect(usageText({ count: 18, lastAt: '2026-11-01T11:38:00.000Z' }, NOW)).toBe(
      '18 deployments · last 22m ago',
    )
    expect(usageText({ count: 0, lastAt: null }, NOW)).toBe('No deployments yet')
  })
})

describe('Add connection', () => {
  it('says how many accounts the org has and how many are restricted', () => {
    expect(
      availableNote(
        [{ state: 'added' }, { state: 'available' }, { state: 'restricted' }],
        'Acme Inc',
      ),
    ).toBe('3 accounts in Acme Inc. One is restricted to other projects.')
    expect(availableNote([{ state: 'available' }], 'Acme Inc')).toBe('1 account in Acme Inc.')
    expect(availableNote([], 'Acme Inc')).toBe('Acme Inc has no shared accounts yet.')
  })

  it('names the projects a restricted account serves, when the reader can see them', () => {
    expect(restrictedText({ restrictedTo: ['Data Platform'] })).toBe('Restricted to Data Platform')
    expect(restrictedText({ restrictedTo: ['Data Platform', 'Ops', 'Web'] })).toBe(
      'Restricted to Data Platform and 2 others',
    )
    expect(restrictedText({ restrictedTo: [] })).toBe('Restricted to other projects')
  })
})

describe('removeText', () => {
  it('says what goes, what falls back, and that deployed workflows keep running (D-PC-6)', () => {
    expect(
      removeText(
        { name: 'Checkout staging', scope: 'project', isDefault: false },
        ['Sales'],
        'Project 101',
      ),
    ).toBe(
      'Checkout staging belongs to Project 101, so removing it deletes it. Sales goes back to the project default. Deployed workflows keep running.',
    )
    expect(
      removeText({ name: 'Acme production', scope: 'shared', isDefault: true }, [], 'Project 101'),
    ).toBe(
      'Acme production stays in the organization; Project 101 stops deploying to it. It’s the default: until you pick another, Deploy asks which account to use. Deployed workflows keep running.',
    )
  })
})
