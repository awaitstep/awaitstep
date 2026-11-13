import { create } from 'zustand'

/** What a step editor last checked: the code it saw and how many errors Monaco found in it. */
interface CheckedCode {
  code: string
  errors: number
}

interface StepCodeErrorsState {
  /** By step node id. */
  checked: ReadonlyMap<string, CheckedCode>
  record: (nodeId: string, code: string, errors: number) => void
}

/**
 * The TypeScript errors the canvas's step editors have shown, so a save can
 * hold back a graph whose step code would not compile, as Code's Save holds
 * back a file. A record only counts while the step still holds the code it
 * was made for: an edit elsewhere (Code, an undo) makes it stale.
 */
export const useStepCodeErrorsStore = create<StepCodeErrorsState>((set) => ({
  checked: new Map(),
  record: (nodeId, code, errors) =>
    set((state) => {
      const previous = state.checked.get(nodeId)
      if (previous && previous.code === code && previous.errors === errors) return state
      const checked = new Map(state.checked)
      checked.set(nodeId, { code, errors })
      return { checked }
    }),
}))

/** Steps whose current code an editor found errors in: the save holds them back. */
export function stepsWithCodeErrors(
  nodes: readonly { id: string; type: string; name: string; data: Record<string, unknown> }[],
  checked: ReadonlyMap<string, CheckedCode> = useStepCodeErrorsStore.getState().checked,
): { name: string; errors: number }[] {
  const held: { name: string; errors: number }[] = []
  for (const node of nodes) {
    if (node.type !== 'step') continue
    const record = checked.get(node.id)
    if (record && record.errors > 0 && record.code === String(node.data.code ?? '')) {
      held.push({ name: node.name, errors: record.errors })
    }
  }
  return held
}

/** The toast for a held-back save, worded as Code's Save words a held-back file. */
export function stepCodeErrorsMessage(held: readonly { name: string; errors: number }[]): string {
  if (held.length === 1) {
    const { name, errors } = held[0]!
    return `“${name}” has ${errors === 1 ? '1 error' : `${errors} errors`} in its code, so the workflow wasn’t saved`
  }
  return `${held.length} steps have errors in their code, so the workflow wasn’t saved: ${held.map((h) => `“${h.name}”`).join(', ')}`
}
