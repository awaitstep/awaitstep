/**
 * Which keystrokes belong to the thing they are typed in. The global
 * shortcuts (⌘S, ⌘P, ⌘B, tab cycling, Search) work from anywhere, the editor
 * included. Run and F4 are the exceptions: they act on the editor, so they
 * step aside when the key is meant for a field or widget of its own.
 */

/** Monaco's reference peek owns F4 and ⇧F4 while it is open. */
export const REFERENCE_PEEK = '.peekview-widget'

/** Monaco's find widget owns ⌥⏎ (select all matches) while it is showing. */
export const FIND_WIDGET = '.find-widget.visible'

/**
 * A text field of its own (the Search box, the filter boxes, Monaco's find or
 * rename input, a quick-test field) keeps the key. The editor's own text area
 * (and its edit context) and the results list are not foreign.
 */
const FOREIGN_FIELD =
  'input, textarea:not(.inputarea), select, [contenteditable=""], [contenteditable="true"]:not(.native-edit-context)'

/** Fields that exist to feed Run (the trigger payload, a step's quick-test arguments). */
const RUN_FIELD = '[data-ide-run-field]'

export function inForeignField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FOREIGN_FIELD) !== null
}

/** True when ⌥⏎ pressed at `target` is not a Run: it is typed into another field or Monaco's find. */
export function runKeyBelongsElsewhere(target: EventTarget | null): boolean {
  if (document.querySelector(FIND_WIDGET)) return true
  if (!(target instanceof Element)) return false
  if (target.closest(RUN_FIELD)) return false
  return inForeignField(target)
}

/** The ⌥⏎ handler: runs, or declines (`false`) so the key stays with its field or widget. */
export function runShortcut(run: () => void): (event: KeyboardEvent) => void | false {
  return (event) => {
    if (runKeyBelongsElsewhere(event.target)) return false
    run()
  }
}
