// How wide a button is. A button is as wide as its words ask for, with a
// floor so a short word is still easy to press, and it never runs from one
// edge of the screen to the other: not on a phone, not on a desktop.
//
// Fields, rows of a list and the bars of a screen are not buttons and keep
// the width of their container.

/** One button on its own: as wide as its label, at least 176 px. */
export const BUTTON_FIT = 'w-fit min-w-44 max-w-full';

/**
 * Puts a button in the middle of its row. A button is drawn inline, so the
 * row does the centring, not the button.
 */
export const BUTTON_ROW = 'flex justify-center';

/**
 * Two or more buttons of one form that are not next to each other in the
 * page (a line or a field sits between them): the same floor for each, wide
 * enough for the longest of them, so they still line up.
 */
export const BUTTON_FIT_WIDE = 'w-fit min-w-56 max-w-full';

/**
 * Buttons one under another: the group is as wide as its widest label and
 * every button in it takes that width, so they line up. Give each button
 * `w-full`.
 */
export const BUTTON_STACK = 'grid w-fit min-w-44 max-w-full gap-3';
