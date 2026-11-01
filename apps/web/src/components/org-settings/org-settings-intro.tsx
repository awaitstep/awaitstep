import { orgSettingsPath, type OrgSettingsPage } from '../../lib/dashboard-paths'
import { LinkTabs, type LinkTab } from '../ui/link-tabs'
import { PageIntro } from '../shell/page-intro'

interface OrgSettingsIntroProps {
  org: { slug: string; name: string }
  section: OrgSettingsPage
}

/**
 * The head of Org Settings (boards `OrgMembers`, `OrgGeneral`): one title for
 * the whole page and its sections as tabs. Connections and API keys are rail
 * items of their own, not sections here.
 */
export function OrgSettingsIntro({ org, section }: OrgSettingsIntroProps) {
  const tabs: LinkTab[] = [
    { key: 'general', label: 'General', href: orgSettingsPath(org.slug, 'general') },
    { key: 'members', label: 'Members', href: orgSettingsPath(org.slug, 'members') },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        title="Settings"
        description={`Who is in ${org.name}, and how the organization itself is set up.`}
      />
      <LinkTabs label="Settings sections" tabs={tabs} activeKey={section} />
    </div>
  )
}
