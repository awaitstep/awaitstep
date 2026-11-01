import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Person } from '../../../types/dashboard/session'
import type { Pick } from './add-people-copy'
import { PeoplePicker } from './people-picker'
import type { PoolPerson } from './people-pool'

// The Add people picker from AddToWorkspace (21b): the board's four people.
const meta = {
  title: 'Access/PeoplePicker',
  decorators: [
    (Story) => (
      <div className="max-w-[512px] rounded-2xl border border-border bg-card p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function person(id: string, name: string): Person {
  const email = `${name.split(' ')[0]!.toLowerCase()}@acme.test`
  return { id, name, email, initials: name.slice(0, 2), image: null }
}

const POOL: PoolPerson[] = [
  {
    person: person('lena', 'Lena Ortiz'),
    tier: 'project',
    note: 'In Project 101 · IT',
    joins: false,
  },
  { person: person('priya', 'Priya Shah'), tier: 'project', note: 'In Project 101', joins: false },
  {
    person: person('sam', 'Sam Hall'),
    tier: 'org',
    note: 'In Acme Inc, not in Project 101',
    joins: true,
  },
  {
    person: person('tom', 'Tom Becker'),
    tier: 'has',
    note: 'Already has access · whole project',
    joins: false,
  },
]

function Picker({ initialQuery = '' }: { initialQuery?: string }) {
  const [picks, setPicks] = useState<Pick[]>([{ kind: 'person', entry: POOL[2]! }])
  const [query, setQuery] = useState(initialQuery)

  function handleToggle(entry: PoolPerson) {
    setPicks((current) =>
      current.some((p) => p.kind === 'person' && p.entry.person.id === entry.person.id)
        ? current.filter((p) => !(p.kind === 'person' && p.entry.person.id === entry.person.id))
        : [...current, { kind: 'person', entry }],
    )
  }

  function handleInvite(email: string) {
    setPicks((current) => [...current, { kind: 'email', email }])
    setQuery('')
  }

  function handleRemove(key: string) {
    setPicks((current) =>
      current.filter((p) => (p.kind === 'person' ? p.entry.person.id : p.email) !== key),
    )
  }

  return (
    <PeoplePicker
      pool={POOL}
      picks={picks}
      query={query}
      onQuery={setQuery}
      onToggle={handleToggle}
      onInvite={handleInvite}
      onRemove={handleRemove}
      searchLabel="Search Project 101 and Acme Inc, or type an email"
      orgName="Acme Inc"
      canInvite
    />
  )
}

export const Picking: Story = { render: () => <Picker /> }

export const InviteAnAddress: Story = { render: () => <Picker initialQuery="jo@newco.test" /> }

export const NobodyMatches: Story = { render: () => <Picker initialQuery="zz" /> }
