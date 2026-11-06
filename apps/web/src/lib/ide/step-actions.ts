import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { focusEditor } from './editor-focus'
import type { StepMap } from './step-map'

/** Where the keyboard goes after a step is picked. */
export type StepFocus = 'editor' | 'stay'

/**
 * Picks a step: selects it for the inspector and the preview, and opens its
 * code when it has some — the editable source when the workspace has one,
 * else the generated module (a custom node's, say). A step without either
 * (a sleep, a branch) is only selected. A click in the preview hands the
 * keyboard to the editor, because the person came to read code; Enter in
 * the Steps list keeps it in the list so the next arrow key moves on.
 */
export function selectStep(map: StepMap, nodeId: string, focus: StepFocus): void {
  const ide = useIdeStore.getState()
  ide.selectNode(nodeId)
  const info = map.byNode.get(nodeId)
  const path = info?.sourcePath ?? info?.filePath ?? null
  if (path !== null) ide.openFile(path)
  if (focus === 'editor') focusEditor()
}

/**
 * Opens a step's generated module in Quick test — the module is what runs,
 * whichever file its code is edited in. Does nothing for a step without one.
 */
export function runStepQuickTest(map: StepMap, nodeId: string): boolean {
  const filePath = map.byNode.get(nodeId)?.filePath ?? null
  if (filePath === null) return false
  useIdeStore.getState().selectNode(nodeId)
  useIdeStore.getState().openFile(filePath)
  useIdeLayoutStore.getState().showDock('quickTest')
  return true
}

/** Shows the Steps view with the keyboard in its list. */
export function showStepsView(): void {
  useIdeLayoutStore.getState().showSideBar('steps')
  useIdeStore.getState().requestStepsFocus()
}

/** Opens a file the step uses, without moving the step selection. */
export function openUsedFile(path: string): void {
  useIdeStore.getState().openFile(path)
}
