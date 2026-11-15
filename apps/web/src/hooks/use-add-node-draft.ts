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
  /** Fields the person has changed since the node was picked. */
  touched: ReadonlySet<string>
  /** The name for the current kind: a step and a node keep their own. */
  name: string
  /** A new step runs in the body, without a durable step (a node's is in its fields). */
  stepInline: boolean
  setStepInline: (inline: boolean) => void
  setName: (name: string) => void
  setKind: (kind: AddKind) => void
  pick: (definition: NodeDefinition) => void
  /** Back to the list to pick another node. */
  unpick: () => void
  setField: (fieldId: string, value: unknown) => void
  reset: () => void
  /** The node to add, read at submit time; for a step, only when it is inline. */
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
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [stepName, setStepName] = useState('')
  const [nodeName, setNodeName] = useState('')
  const [stepInline, setStepInlineState] = useState(false)
  const stepInlineRef = useRef(false)
  const fieldsRef = useRef<Record<string, unknown>>({})
  const pickedRef = useRef<NodeDefinition | null>(null)
  const kindRef = useRef<AddKind>('step')

  const writeFields = useCallback((next: Record<string, unknown>) => {
    fieldsRef.current = next
    setFields(next)
  }, [])

  const setStepInline = useCallback((inline: boolean) => {
    stepInlineRef.current = inline
    setStepInlineState(inline)
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
      setTouched(new Set())
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
      setTouched((current) => (current.has(fieldId) ? current : new Set(current).add(fieldId)))
    },
    [writeFields],
  )

  const reset = useCallback(() => {
    setKind('step')
    unpick()
    writeFields({})
    setTouched(new Set())
    setStepName('')
    setNodeName('')
    setStepInline(false)
  }, [setKind, unpick, writeFields, setStepInline])

  const template = useCallback((): NewTemplateNode | undefined => {
    if (kindRef.current === 'step') {
      return stepInlineRef.current ? { type: 'step', data: { inline: true } } : undefined
    }
    const definition = pickedRef.current
    if (!definition) return undefined
    return { type: definition.id, data: fieldsRef.current }
  }, [])

  return {
    kind,
    picked,
    picking: kind === 'custom' && picked === null,
    fields,
    touched,
    name: kind === 'step' ? stepName : nodeName,
    stepInline,
    setStepInline,
    setName: kind === 'step' ? setStepName : setNodeName,
    setKind,
    pick,
    unpick,
    setField,
    reset,
    template,
  }
}
