import { escapeCss } from './css-escape'

/** The step the open file is the module of. */
const PRIMARY = 'outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: 4px;'
/** A step that imports the open file. */
const SECONDARY =
  'outline: 1px solid color-mix(in oklab, var(--color-primary) 50%, transparent); outline-offset: 2px; border-radius: 4px;'

function selectorFor(scope: string, id: string): string {
  return `.${scope} .react-flow__node[data-id="${escapeCss(id)}"]`
}

/**
 * Stylesheet text that outlines steps in the preview. It is CSS keyed on the
 * node wrapper's `data-id`, not a class on the node, because changing a node
 * object makes React Flow rebuild it and forget its measured size, which
 * hides the node and detaches its edges until it is measured again.
 */
export function outlineCss(scope: string, primary: readonly string[], usedBy: readonly string[]) {
  const main = new Set(primary)
  const rules = [
    ...usedBy
      .filter((id) => !main.has(id))
      .map((id) => `${selectorFor(scope, id)} { ${SECONDARY} }`),
    ...primary.map((id) => `${selectorFor(scope, id)} { ${PRIMARY} }`),
  ]
  return rules.join('\n')
}
