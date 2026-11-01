import { actionToast } from '../../lib/action-toast'
import { describeTimeTravel, redoWorkflowEdit, undoWorkflowEdit } from '../../stores/workflow-store'

/** Undo with a toast when nodes appear or disappear (easy to miss on a busy canvas). */
export function undoWithFeedback(): void {
  const message = describeTimeTravel(undoWorkflowEdit())
  if (message) actionToast.info(message)
}

export function redoWithFeedback(): void {
  const message = describeTimeTravel(redoWorkflowEdit())
  if (message) actionToast.info(message)
}
