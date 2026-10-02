/** True only when chat content crosses the bottom of the measured floating header. */
export function hasHeaderOverlap(offset: number, contentTop: number, headerBottom: number, hasContent: boolean): boolean {
  return hasContent && Number.isFinite(offset) && offset > Math.max(0, contentTop - headerBottom);
}
