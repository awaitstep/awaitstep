import { serializeArtifact } from '@awaitstep/ir'
import { buildIRFromState } from './build-ir'
import { downloadJsonFile } from './download-file'
import { useWorkflowStore } from '../stores/workflow-store'

/** Downloads the workflow in the canvas store as an `.ir.json` file. */
export function exportWorkflowFile(): void {
  const state = useWorkflowStore.getState()
  const json = serializeArtifact(buildIRFromState(state))
  const filename = `${state.metadata.name.replace(/\s+/g, '-').toLowerCase()}.ir.json`
  downloadJsonFile(filename, json)
}
