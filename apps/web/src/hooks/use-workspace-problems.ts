import { useEffect, useState } from 'react'
import { useMonaco } from '@monaco-editor/react'
import { collectProblems, type Problem } from '../lib/ide/problems'
import { parseWorkflowModelPath } from '../lib/monaco/setup'

/**
 * Live diagnostics for every Monaco model of this workflow. Markers are an
 * external subscription (Monaco raises them from its language workers), so an
 * effect is the right tool here; events for other workflows' models or the
 * ambient libs are ignored so the dock only re-renders for its own files.
 */
export function useWorkspaceProblems(workflowId: string): Problem[] {
  const monaco = useMonaco()
  const [problems, setProblems] = useState<Problem[]>([])

  useEffect(() => {
    if (!monaco) return
    const instance = monaco
    function refresh() {
      setProblems(collectProblems(instance.editor.getModelMarkers({}), workflowId))
    }
    refresh()
    const subscription = instance.editor.onDidChangeMarkers((uris) => {
      const concernsUs = uris.some(
        (uri) => parseWorkflowModelPath(uri.toString())?.workflowId === workflowId,
      )
      if (concernsUs) refresh()
    })
    return () => subscription.dispose()
  }, [monaco, workflowId])

  return problems
}
