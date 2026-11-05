/**
 * A whole-row link: the row is `LINKED_ROW`, its one link carries
 * `STRETCHED_LINK` (a layer over the row, so a click anywhere opens it), and
 * each real control in the row — only the control, not its surroundings —
 * sits `ABOVE_LINK`, so a click on it stays its own. Screen readers and Tab
 * still meet one link per row.
 */
export const LINKED_ROW = 'relative cursor-pointer transition-colors hover:bg-muted/30'
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
export const ABOVE_LINK = 'relative z-10'
