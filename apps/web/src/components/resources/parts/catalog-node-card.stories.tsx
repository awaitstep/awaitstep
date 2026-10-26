import type { Meta, StoryObj } from '@storybook/react-vite'
import { CatalogNodeCard } from './catalog-node-card'
import { ACME_CRM, ANTHROPIC, RESEND, SLACK } from './__tests__/fixtures/nodes'

// Node cards from the OrgResources board.
const meta = {
  title: 'Resources/CatalogNodeCard',
  decorators: [
    (Story) => (
      <div className="grid max-w-[1100px] grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function noop() {}

export const Catalog: Story = {
  render: () => (
    <>
      <CatalogNodeCard node={ACME_CRM} orgName="Acme Inc" />
      <CatalogNodeCard node={SLACK} orgName="Acme Inc" onUninstall={noop} />
      <CatalogNodeCard node={RESEND} orgName="Acme Inc" onUninstall={noop} />
      <CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={noop} />
    </>
  ),
}

export const InstalledWithUpdate: Story = {
  render: () => <CatalogNodeCard node={SLACK} orgName="Acme Inc" onUninstall={noop} />,
}

export const Custom: Story = {
  render: () => <CatalogNodeCard node={ACME_CRM} orgName="Acme Inc" />,
}

export const Available: Story = {
  render: () => <CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={noop} />,
}

export const Busy: Story = {
  render: () => <CatalogNodeCard node={ANTHROPIC} orgName="Acme Inc" onInstall={noop} busy />,
}
