import { CodeEditor } from '../ui/code-editor'
import { DEFAULT_TRIGGER_CODE } from '@awaitstep/provider-cloudflare/codegen'
import { useWorkflowStore } from '../../stores/workflow-store'

export function TriggerCodeEditor({ height = '200px' }: { height?: string }) {
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const { setTriggerCode } = useWorkflowStore()

  return (
    <CodeEditor
      value={triggerCode || DEFAULT_TRIGGER_CODE}
      onChange={setTriggerCode}
      debounceMs={500}
      language="typescript"
      height={height}
    />
  )
}
