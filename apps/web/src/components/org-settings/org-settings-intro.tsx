import { extensionPageKey, useEnabledExtensions } from '../../extensions/registry'
import type { ExtensionPageKey } from '../../extensions/types'
import {
  orgSettingsExtensionPath,
  orgSettingsPath,
  type OrgSettingsPage,
} from '../../lib/dashboard-paths'
import { LinkTabs, type LinkTab } from '../ui/link-tabs'
import { PageIntro } from '../shell/page-intro'

interface OrgSettingsIntroProps {
  org: { slug: string; name: string }
  /** A built-in section, or an extension tab's `extensionPageKey`. */
  section: OrgSettingsPage | ExtensionPageKey
}

/**
 * The head of Org Settings (boards `OrgMembers`, `OrgGeneral`): one title for
 * the whole page and its sections as tabs. Connections and API keys are rail
 * items of their own, not sections here. Enabled extensions add their
 * `org.settings.tabs` after the built-in ones.
 */
export function OrgSettingsIntro({ org, section }: OrgSettingsIntroProps) {
  const extensions = useEnabledExtensions()
  const tabs: LinkTab[] = [
    { key: 'general', label: 'General', href: orgSettingsPath(org.slug, 'general') },
    { key: 'members', label: 'Members', href: orgSettingsPath(org.slug, 'members') },
    ...extensions.flatMap((extension) =>
      (extension.slots?.['org.settings.tabs'] ?? []).map((tab) => ({
        key: extensionPageKey(extension.id, tab.path),
        label: tab.label,
        href: orgSettingsExtensionPath(org.slug, extension.id, tab.path),
      })),
    ),
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageIntro title="Settings" description="Your organization’s details and members." />
      <LinkTabs label="Settings sections" tabs={tabs} activeKey={section} />
    </div>
  )
}
