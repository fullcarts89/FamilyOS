/**
 * Where the phone's fixed controls sit, in one place, so pages keep room for them and toasts sit
 * above them instead of over them (BottomBar, CaptureFab, Page, Toast).
 */
export const bottomBar = {
  /** Above the safe area: 8 top padding + the 44pt tabs, and at least 10 below. */
  pad: 10,
  height: 8 + 44,
};

export const fab = {
  size: 58,
  /** Gap between the screen's bottom edge (plus the safe area) and the button. */
  offset: 70,
};

/** The capture button's distance from the screen's bottom edge. */
export const fabBottom = (insetBottom: number) => Math.max(insetBottom, bottomBar.pad) + fab.offset;

/** A toast's distance from the bottom on phones: just above the capture button, never over it. */
export const toastBottom = (insetBottom: number) => fabBottom(insetBottom) + fab.size + 12;

/**
 * Room a phone page keeps below its content, inside the scroll view (which ends at the bottom
 * bar): how far the capture button reaches up into the page, plus a 44pt margin, so the last
 * row's controls always scroll clear of it.
 */
export const pageReserve = fab.offset - bottomBar.height + fab.size + 44;
