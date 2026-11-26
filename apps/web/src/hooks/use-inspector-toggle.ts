import { useCanvasLayoutStore } from '../stores/canvas-layout-store'
import { useWorkflowStore } from '../stores/workflow-store'

/**
 * The canvas inspector's toggle. Visible means on screen, not merely allowed:
 * with no step selected nothing is showing, and the code preview takes the space.
 */
export function useInspectorToggle(): { visible: boolean; toggle: () => void } {
  const inspectorOpen = useCanvasLayoutStore((s) => s.inspectorOpen)
  const codePreviewOpen = useCanvasLayoutStore((s) => s.codePreviewOpen)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const visible = inspectorOpen && !!selectedNodeId && !codePreviewOpen

  // Asking for the inspector brings it back; asking again hides it. With
  // nothing selected there is nothing to hide, so it only arms the panel.
  // While the code preview is up, the inspector is behind it: this closes the
  // preview and brings the selected step's settings back into view.
  function toggle() {
    const layout = useCanvasLayoutStore.getState()
    if (codePreviewOpen) {
      layout.setCodePreviewOpen(false)
      layout.setInspectorOpen(true)
      return
    }
    layout.setInspectorOpen(!visible)
  }

  return { visible, toggle }
}
