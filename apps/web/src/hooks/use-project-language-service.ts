import { useEffect, useMemo } from 'react'
import { useMonaco } from '@monaco-editor/react'
import { disposeWorkflowModels, syncWorkflowModels } from '../lib/monaco/models'
import { projectRootOptions, tsconfigEditorOptions } from '../lib/monaco/project-config'
import { disposeProjectLibs, syncProjectLibs } from '../lib/monaco/project-libs'
import {
  languageHosts,
  setProjectCompilerOptions,
  setProjectDiagnostics,
} from '../lib/monaco/setup'
import { useTypeAcquisition } from '../lib/monaco/use-type-acquisition'
import {
  clearProviderTypePack,
  providerTypeHintFromSources,
  setProviderTypePackFor,
} from '../lib/monaco/provider-types'
import { useDebouncedValue } from './use-debounced-value'

/** How long typing must pause before project-wide work (lib sync, type acquisition) runs. */
export const WORKER_SYNC_DELAY_MS = 600

const NO_FILES: ReadonlyMap<string, { source: string }> = new Map()

export interface ProjectLanguageServiceOptions {
  /**
   * Report "Cannot find module" once every npm package in view has been
   * typed or stubbed (the code workspace, which has a Problems list for it).
   * Off, imports of npm packages stay muted and no declarations are fetched
   * (the canvas: its step editor shows no project-wide problems).
   */
  reportUnresolvedImports: boolean
}

/**
 * Makes one workflow's project a TypeScript program in Monaco for as long
 * as the caller is mounted: a model per file, created up front rather than
 * when a tab opens, so imports resolve across files and diagnostics cover
 * files nobody has opened; the JSON declarations and cross-language libs
 * beside them; the workflow root, so `#app/*` and `#awaitstep/*` resolve
 * from any model (an editor's anonymous one included) through the absolute
 * `baseUrl`; the project tsconfig's switches; and the diagnostics policy.
 * The sync keeps the models in step with what the caller shows (drafts
 * included — a draft equals its model, so typing never fights the sync).
 * Everything is undone on unmount, so the next surface starts from the
 * shared defaults; the two surfaces are never mounted together.
 */
export function useProjectLanguageService(
  workflowId: string,
  files: ReadonlyMap<string, { source: string }>,
  { reportUnresolvedImports }: ProjectLanguageServiceOptions,
): void {
  const monaco = useMonaco()

  useEffect(() => {
    if (monaco) syncWorkflowModels(monaco, workflowId, files)
  }, [monaco, workflowId, files])

  // Everything below restarts the language workers when it changes, so it
  // follows the files only once typing has paused. The files travel with
  // their workflow: should the caller move to another workflow without
  // remounting, the previous one's files are never laid under the new root
  // for the length of the pause.
  const project = useMemo(() => ({ workflowId, files }), [workflowId, files])
  const settled = useDebouncedValue(project, WORKER_SYNC_DELAY_MS)
  const settledFiles = settled.workflowId === workflowId ? settled.files : NO_FILES

  // A project that uses a provider's syntax gets that provider's runtime
  // types; an untouched project stays on the neutral pack.
  const providerType = useMemo(
    () => providerTypeHintFromSources([...settledFiles.values()].map((file) => file.source)),
    [settledFiles],
  )
  useEffect(() => {
    if (!monaco) return
    const owner = `project:${workflowId}`
    setProviderTypePackFor(owner, monaco, providerType)
    return () => clearProviderTypePack(owner, monaco)
  }, [monaco, workflowId, providerType])

  // JSON declarations and, in a mixed project, each language's files for
  // the other service.
  useEffect(() => {
    if (monaco) syncProjectLibs(languageHosts(monaco), workflowId, settledFiles)
  }, [monaco, workflowId, settledFiles])

  // The project is one TypeScript program rooted at the workflow: `#app/*`
  // and relative imports resolve between its models, and a project
  // tsconfig.json (or jsconfig.json) may turn on strictness switches.
  const configSource =
    settledFiles.get('tsconfig.json')?.source ?? settledFiles.get('jsconfig.json')?.source
  useEffect(() => {
    if (!monaco) return
    setProjectCompilerOptions(monaco, {
      ...projectRootOptions(workflowId),
      ...tsconfigEditorOptions(configSource),
    })
  }, [monaco, workflowId, configSource])

  // npm packages get real declarations; "Cannot find module" only counts
  // once every package in view has been typed or stubbed. Keyed on the
  // workflow as well, so a workspace that opens after another's cleanup
  // muted the errors always re-applies its own state. Acquisition serves
  // that check alone, so a caller that keeps the errors muted fetches nothing.
  const typesSettled = useTypeAcquisition(reportUnresolvedImports ? settledFiles : NO_FILES)
  useEffect(() => {
    if (!monaco) return
    setProjectDiagnostics(monaco, {
      reportUnresolvedImports: reportUnresolvedImports && typesSettled,
    })
  }, [monaco, workflowId, reportUnresolvedImports, typesSettled])

  useEffect(() => {
    if (!monaco) return
    return () => {
      setProjectDiagnostics(monaco, null)
      setProjectCompilerOptions(monaco, null)
      disposeProjectLibs(workflowId)
      disposeWorkflowModels(monaco, workflowId)
    }
  }, [monaco, workflowId])
}
