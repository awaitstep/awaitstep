import { isTypingTarget } from '../typing-target'
import type { DispatchContext } from './dispatcher'

/**
 * Marks a panel that handles its own keys (Esc closes it): a key pressed
 * inside one is not the app's.
 */
export const OWN_KEYS_ATTRIBUTE = 'data-own-keys'

/**
 * Marks a popup that floats over the page while open (the canvas's right-click
 * menu): no app shortcut runs while one is shown, wherever focus is.
 */
export const OPEN_LAYER_ATTRIBUTE = 'data-open-layer'

/** Where the key landed, if inside one of these, it belongs there. */
const OWNS_KEYS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="listbox"]',
  `[${OWN_KEYS_ATTRIBUTE}]`,
].join(', ')

/**
 * Popups open anywhere on the page. Radix menus and selects portal to the
 * body, outside whatever opened them, and keep focus on their trigger or on
 * themselves; either way the next Esc, letter or arrow is theirs.
 */
const OPEN_LAYERS = [
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-radix-popper-content-wrapper]',
  `[${OPEN_LAYER_ATTRIBUTE}]`,
].join(', ')

/** Plain keys in these are typing or picking: a select's trigger types ahead to an option. */
const PICKS_WITH_KEYS = '[data-ide-text-input], [role="combobox"]'

function closest(target: EventTarget | null, selector: string): boolean {
  const element = target as Element | null
  return typeof element?.closest === 'function' && element.closest(selector) !== null
}

/** What the dispatcher needs to know about where a key was pressed. */
export function keyContext(target: EventTarget | null, page: ParentNode): DispatchContext {
  return {
    typing: isTypingTarget(target) || closest(target, PICKS_WITH_KEYS),
    inDialog: closest(target, OWNS_KEYS) || page.querySelector(OPEN_LAYERS) !== null,
  }
}
