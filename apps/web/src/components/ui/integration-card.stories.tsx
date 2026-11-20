import type { Meta, StoryObj } from '@storybook/react-vite'
import { CloudflareLogo } from '../connections/new-account/cloudflare-logo'
import { Button } from './button'
import { IntegrationCard } from './integration-card'

const meta: Meta<typeof IntegrationCard> = {
  title: 'UI/IntegrationCard',
  component: IntegrationCard,
}
export default meta

type Story = StoryObj<typeof IntegrationCard>

export const Cloudflare: Story = {
  render: () => (
    <div className="grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <IntegrationCard
        logo={<CloudflareLogo />}
        title="Cloudflare"
        description="Where your workflows deploy."
        actions={
          <>
            <Button size="sm">Connect account</Button>
            <Button size="sm" variant="outline">
              Manage
            </Button>
          </>
        }
      />
    </div>
  ),
}
