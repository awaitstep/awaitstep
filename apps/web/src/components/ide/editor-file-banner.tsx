import { PACKAGE_MANIFEST_PATH, PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { OLDER_VERSION_MESSAGE, type Editability } from '../../lib/ide/editability'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'

interface EditorFileBannerProps {
  path: string
  editability: Editability
  /** The file comes from legacy workflow settings and is not stored yet. */
  isVirtual: boolean
  /** The workspace is an older version, so the way out is the latest one. */
  historical: boolean
  onOpenLatest: () => void
  onSaveAsFile: (path: string) => void
  onConvertHandlers: () => void
}

/**
 * Why the file in front of you is the way it is: read-only, or not a file
 * yet. One banner at a time, with the one thing you can do about it.
 */
export function EditorFileBanner({
  path,
  editability,
  isVirtual,
  historical,
  onOpenLatest,
  onSaveAsFile,
  onConvertHandlers,
}: EditorFileBannerProps) {
  function handleSaveAsFile() {
    onSaveAsFile(path)
  }

  if (isVirtual) {
    const isHandlers = path === PROJECT_HANDLERS_PATH
    const what = path === PACKAGE_MANIFEST_PATH ? 'dependency' : 'trigger'
    return (
      <EditorBanner
        tone="info"
        actions={
          <>
            <Button size="sm" onClick={handleSaveAsFile} className="h-6 px-2 text-xs">
              Save as file
            </Button>
            {isHandlers && (
              <Button
                size="sm"
                variant="outline"
                onClick={onConvertHandlers}
                className="h-6 px-2 text-xs"
              >
                Convert to handler modules…
              </Button>
            )}
          </>
        }
      >
        This comes from your {what} settings and isn’t a file yet.
      </EditorBanner>
    )
  }

  // The version is the bigger reason: a generated file in an older version is
  // read-only for both, and the way out is the latest version.
  if (historical) {
    return (
      <EditorBanner
        tone="info"
        actions={
          <Button size="sm" variant="outline" onClick={onOpenLatest} className="h-6 px-2 text-xs">
            Open latest
          </Button>
        }
      >
        {OLDER_VERSION_MESSAGE}
      </EditorBanner>
    )
  }

  if (editability.readOnly && editability.message) {
    return <EditorBanner tone="info">{editability.message}</EditorBanner>
  }

  return null
}
