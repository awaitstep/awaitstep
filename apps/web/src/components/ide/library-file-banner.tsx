import type { BundledLibraryModule } from '../../lib/api-client'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { libraryItemHref } from '../../lib/library/item-links'
import { ShellLink } from '../ui/shell-link'
import { EditorBanner } from './editor-banner'

interface LibraryFileBannerProps {
  path: string
  module: BundledLibraryModule
}

/**
 * Above a Library module's file in a workflow (28p): which version this
 * bundle carries, that deploys take the latest, and where to change it.
 */
export function LibraryFileBanner({ path, module }: LibraryFileBannerProps) {
  const scope = useEditorScope()
  const file = path.slice(`modules/${module.slug}/`.length)
  return (
    <EditorBanner
      tone="info"
      actions={
        scope && (
          <ShellLink
            href={libraryItemHref(scope, module, file)}
            className="text-xs font-medium text-primary-ink "
          >
            Open in Scripts & nodes
          </ShellLink>
        )
      }
    >
      {module.slug} {module.version} from Scripts & nodes. Workflows get the latest published
      version on deploy.
    </EditorBanner>
  )
}
