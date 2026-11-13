import { useCallback, useRef, useState } from 'react'
import type { NodeDefinition } from '@awaitstep/ir'
import type { NewTemplateNode } from '../lib/ide/step-create'
import { configDefaults } from '../lib/node-defaults'

/** What Add creates: a step with its own file, or a custom node from the Library or marketplace. */
export type AddKind = 'step' | 'custom'

export interface AddNodeDraft {
  kind: AddKind
  /** The custom node picked from the list; null until one is. */
  picked: NodeDefinition | null
  /** Custom node chosen but none picked yet: the list shows. */
  picking: boolean
  fields: Record<string, unknown>
  /** The name for the current kind: a step and a node keep their own. */
  name: string
  setName: (name: string) => void
  setKind: (kind: AddKind) => void
  pick: (definition: NodeDefinition) => void
  /** Back to the list to pick another node. */
  unpick: () => void
  setField: (fieldId: string, value: unknown) => void
  reset: () => void
  /** The node to add, read at submit time; undefined for a step. */
  template: () => NewTemplateNode | undefined
}

/**
 * The Add dialog's choice of what to add. The fields are mirrored in a ref
 * so a submit in the same event as the last edit (Enter in a field, whose
 * input flushes on Enter) reads that edit rather than the previous render's.
 */
export function useAddNodeDraft(): AddNodeDraft {
  const [kind, setKindState] = useState<AddKind>('step')
  const [picked, setPicked] = useState<NodeDefinition | null>(null)
  const [fields, setFields] = useState<Record<string, unknown>>({})
  const [stepName, setStepName] = useState('')
  const [nodeName, setNodeName] = useState('')
  const fieldsRef = useRef<Record<string, unknown>>({})
  const pickedRef = useRef<NodeDefinition | null>(null)
  const kindRef = useRef<AddKind>('step')

  const writeFields = useCallback((next: Record<string, unknown>) => {
    fieldsRef.current = next
    setFields(next)
  }, [])

  const setKind = useCallback((next: AddKind) => {
    kindRef.current = next
    setKindState(next)
  }, [])

  const pick = useCallback(
    (definition: NodeDefinition) => {
      pickedRef.current = definition
      setPicked(definition)
      writeFields(configDefaults(definition.configSchema))
      setNodeName(definition.name)
    },
    [writeFields],
  )

  const unpick = useCallback(() => {
    pickedRef.current = null
    setPicked(null)
  }, [])

  const setField = useCallback(
    (fieldId: string, value: unknown) => {
      const next = { ...fieldsRef.current }
      if (value === undefined) delete next[fieldId]
      else next[fieldId] = value
      writeFields(next)
    },
    [writeFields],
  )

  const reset = useCallback(() => {
    setKind('step')
    unpick()
    writeFields({})
    setStepName('')
    setNodeName('')
  }, [setKind, unpick, writeFields])

  const template = useCallback((): NewTemplateNode | undefined => {
    const definition = pickedRef.current
    if (kindRef.current !== 'custom' || !definition) return undefined
    return { type: definition.id, data: fieldsRef.current }
  }, [])

  return {
    kind,
    picked,
    picking: kind === 'custom' && picked === null,
    fields,
    name: kind === 'step' ? stepName : nodeName,
    setName: kind === 'step' ? setStepName : setNodeName,
    setKind,
    pick,
    unpick,
    setField,
    reset,
    template,
  }
}
