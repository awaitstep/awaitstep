// Monaco's EditContext input is a plain `div`, so a tag-name or
// `isContentEditable` check misses it: anything inside `.monaco-editor` counts.
const TYPING_TARGET =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .monaco-editor'

/** True when a page-wide shortcut must leave the key to the field it was typed in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING_TARGET) !== null
}
