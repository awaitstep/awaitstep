const SAFE_LABEL = /^[A-Za-z0-9_-]+$/
/**
 * Characters a node name keeps in its step label. Quotes, backslashes,
 * backticks and `$` would break the generated string literal; brackets are
 * reserved for the `(<id>)` tail and the provider's ` [<i>]` loop suffix.
 */
const NAME_DROP = /[^\p{L}\p{N} _.,:;/&+#'!?@=-]+/gu
const MAX_NAME_LENGTH = 80

/**
 * Deterministic durable-step label for a node: its name followed by its id,
 * `Send welcome email (Mn6a_STiAD3FDtVmpgFvu)`, so the provider's dashboard
 * reads at a glance while the id keeps the label unique and mappable back to
 * the node. A rename changes the label; run telemetry still joins on the id
 * through the step manifest or the `(<id>)` tail (`stepLabelBase`). A node
 * with no usable name labels with its id alone.
 */
export function stepLabel(node: { id: string; name?: string }): string {
  const id = SAFE_LABEL.test(node.id) ? node.id : sanitizeStepLabel(node.id)
  const name = cleanStepName(node.name)
  return name ? `${name} (${id})` : id
}

function cleanStepName(raw: string | undefined): string {
  if (!raw) return ''
  const cleaned = raw.replace(NAME_DROP, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, MAX_NAME_LENGTH).trim()
}

/**
 * Collapse an arbitrary string (an SDK-authored label, a file:line fallback)
 * to the conservative label charset shared with node ids.
 */
export function sanitizeStepLabel(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'step'
}

/**
 * Label for a node that emits more than one durable step (e.g. a
 * sub-workflow's create + await pair).
 */
export function derivedStepLabel(node: { id: string; name?: string }, suffix: string): string {
  return `${stepLabel(node)}--${sanitizeStepLabel(suffix)}`
}

/**
 * The durable-step label literals generators emit (`flow.step("<label>"`,
 * `flow.sleep(…`, `waitForEventOrTimeout(flow, "<label>"`, a loop's
 * `` flow.step(`<label> [${i}]` ``).
 */
const STEP_LABEL_LITERAL =
  /(\bflow\.(?:step|sleep|sleepUntil|waitForEvent)\(|\bwaitForEventOrTimeout\(flow, )(["`])([^"`\n]*)\2/g

/**
 * `code` with the text of every emitted step label blanked (length kept), so
 * a scan for a variable's uses does not count the node's name inside its own
 * label. Labels never hold quotes or backticks (`stepLabel` drops them).
 */
export function maskStepLabels(code: string): string {
  return code.replace(
    STEP_LABEL_LITERAL,
    (_match, call: string, quote: string, label: string) =>
      `${call}${quote}${' '.repeat(label.length)}${quote}`,
  )
}
