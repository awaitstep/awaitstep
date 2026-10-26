import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScopedSection } from './scoped-section'
import {
  PROJECT_ADMINS,
  PROJECT_KEYS,
  SALES_KEYS,
  SALES_MEMBERS,
} from './__tests__/fixtures/access'
import { KeyTable, MemberList } from './__tests__/fixtures/access-rows'

// "Only in Sales" above "From Project 101", as on Access › Members and API keys.
const meta = {
  title: 'UI/ScopedSection',
  decorators: [
    (Story) => (
      <div className="flex max-w-[1080px] flex-col gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const MANAGE = { label: 'Manage in Project settings', href: '/acme/project-101/settings' }

export const OwnList: Story = {
  render: () => (
    <ScopedSection
      kind="own"
      scopeLabel="Only in Sales"
      colour="green"
      hint="Can open Sales and nothing else in Project 101"
    >
      <MemberList members={SALES_MEMBERS} />
    </ScopedSection>
  ),
}

export const InheritedList: Story = {
  render: () => (
    <ScopedSection
      kind="inherited"
      scopeLabel="From Project 101"
      hint="Project members can open every workspace"
      manage={MANAGE}
    >
      <MemberList members={PROJECT_ADMINS} inherited />
    </ScopedSection>
  ),
}

export const OwnTable: Story = {
  render: () => (
    <ScopedSection
      kind="own"
      scopeLabel="Only in Sales"
      colour="green"
      hint="Reach Sales and nothing else"
    >
      <KeyTable keys={SALES_KEYS} />
    </ScopedSection>
  ),
}

export const InheritedTable: Story = {
  render: () => (
    <ScopedSection
      kind="inherited"
      scopeLabel="From Project 101"
      hint="Project keys reach every workspace"
      manage={MANAGE}
    >
      <KeyTable keys={PROJECT_KEYS} inherited />
    </ScopedSection>
  ),
}

export const InheritedEmpty: Story = {
  render: () => (
    <ScopedSection
      kind="inherited"
      scopeLabel="From Project 101"
      hint="Project keys reach every workspace"
      manage={MANAGE}
    >
      <KeyTable keys={[]} inherited />
    </ScopedSection>
  ),
}

export const OwnAboveInherited: Story = {
  render: () => (
    <>
      <ScopedSection
        kind="own"
        scopeLabel="Only in Sales"
        colour="green"
        hint="Can open Sales and nothing else in Project 101"
      >
        <MemberList members={SALES_MEMBERS} />
      </ScopedSection>
      <ScopedSection
        kind="inherited"
        scopeLabel="From Project 101"
        hint="Project members can open every workspace"
        manage={MANAGE}
      >
        <MemberList members={PROJECT_ADMINS} inherited />
      </ScopedSection>
    </>
  ),
}
