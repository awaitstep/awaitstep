// A menu choice that opens a name field: the menu must not take focus back
// from it, and the field (mounted while the modal menu held focus, so its
// autofocus was lost) is focused once the menu is gone.

/** For a menu's `onCloseAutoFocus`: leave focus where the choice put it. */
export function keepFocusOnField(event: Event) {
  event.preventDefault()
}

/** Focuses the explorer's open name field on the next frame. */
export function focusNameField() {
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLInputElement>('nav[aria-label="Files"] input[data-ide-text-input]')
      ?.focus(),
  )
}
