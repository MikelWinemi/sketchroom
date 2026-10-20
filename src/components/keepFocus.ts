import type { PointerEvent } from 'react';

/**
 * Stops UI buttons from taking focus, so clicking a color or size while
 * editing text keeps the caret in the text box.
 */
export const keepFocus = (e: PointerEvent) => e.preventDefault();
