import { useItemApiScope } from '../contexts/api-client-context'
import { useEditorScope } from '../contexts/editor-scope-context'
import { useEnabledExtensions } from './registry'
import type { SlotName } from './types'

type EditorSlot = Extract<SlotName, 'canvas.toolbar' | 'ide.toolbar' | 'workflow.overview'>

interface EditorExtensionsProps {
  slot: EditorSlot
  workflowId: string
  canEdit: boolean
  kind?: 'workflow' | 'script'
}

/**
 * The enabled extensions' controls for an editor's top bar, or their
 * sections on a workflow's Overview. Nothing outside
 * a workspace URL, or before its ids are known: there is no scope to hand them.
 */
export function EditorExtensions({ slot, workflowId, canEdit, kind }: EditorExtensionsProps) {
  const extensions = useEnabledExtensions()
  const scope = useEditorScope()
  const ids = useItemApiScope()
  if (!scope || !ids) return null
  const controls = extensions.flatMap((extension) => {
    const Control = extension.slots?.[slot]
    return Control ? [{ id: extension.id, Control }] : []
  })
  if (controls.length === 0) return null
  return (
    <div
      data-zone="extensions"
      className={
        slot === 'workflow.overview' ? 'flex flex-col gap-4' : 'flex shrink-0 items-center gap-1'
      }
    >
      {controls.map(({ id, Control }) => (
        <Control
          key={id}
          workflowId={workflowId}
          org={scope.org}
          project={scope.project}
          workspace={scope.workspace}
          ids={ids}
          canEdit={canEdit}
          {...(kind && { kind })}
        />
      ))}
    </div>
  )
}
