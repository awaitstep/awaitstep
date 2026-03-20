import { CodeEditor } from '../ui/code-editor'
import { DEFAULT_TRIGGER_CODE } from '@awaitstep/provider-cloudflare/codegen'
import { useWorkflowStore } from '../../stores/workflow-store'

export function TriggerCodeEditor() {
  const triggerCode = useWorkflowStore((s) => s.triggerCode)
  const setTriggerCode = useWorkflowStore((s) => s.setTriggerCode)

  return (
    <CodeEditor
      value={triggerCode || DEFAULT_TRIGGER_CODE}
      onChange={setTriggerCode}
      debounceMs={500}
      language="typescript"
      height="200px"
    />
  )
}
