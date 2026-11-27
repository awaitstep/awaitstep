import type { ReactNode } from 'react'
import { useItemApiScope } from '../contexts/api-client-context'
import { useEditorScope } from '../contexts/editor-scope-context'
import { useEnabledExtensions } from './registry'
import type { NodeFieldControlProps } from './types'

type OwnProps = Pick<NodeFieldControlProps, 'id' | 'value' | 'onChange' | 'readOnly'>

/**
 * Draws a field with the control an enabled extension has under `name`, or
 * null: no extension has it, or the field is not being edited in a
 * workspace's editor (there is no scope to hand the control). The caller
 * then draws the field by its type.
 */
export function useNodeFieldControl(
  name: string | undefined,
): ((props: OwnProps) => ReactNode) | null {
  const extensions = useEnabledExtensions()
  const scope = useEditorScope()
  const ids = useItemApiScope()
  if (!name || !scope || !ids) return null
  for (const extension of extensions) {
    const controls = extension.slots?.['node.controls']
    const Control = controls && Object.hasOwn(controls, name) ? controls[name] : undefined
    if (!Control) continue
    return function drawn(props) {
      return (
        <Control
          {...props}
          org={scope.org}
          project={scope.project}
          workspace={scope.workspace}
          ids={ids}
        />
      )
    }
  }
  return null
}
