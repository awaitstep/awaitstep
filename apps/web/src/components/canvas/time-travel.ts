import { toast } from 'sonner'
import { describeTimeTravel, redoWorkflowEdit, undoWorkflowEdit } from '../../stores/workflow-store'

/** Undo with a toast when nodes appear or disappear (easy to miss on a busy canvas). */
export function undoWithFeedback(): void {
  const message = describeTimeTravel(undoWorkflowEdit())
  if (message) toast.info(message, { duration: 2500 })
}

export function redoWithFeedback(): void {
  const message = describeTimeTravel(redoWorkflowEdit())
  if (message) toast.info(message, { duration: 2500 })
}
