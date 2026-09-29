/**
 * How many columns a Settings choice (the pill picker) lays its options in, so
 * no label ever wraps or is cut off: up to two options, or three short ones,
 * share one row; anything else sits in a two-column grid.
 */
export const SHORT_LABEL = 10;

export const choiceColumns = (labels: readonly string[]): number => {
  const count = labels.length;
  if (count <= 2) return Math.max(1, count);
  if (count === 3 && labels.every(l => l.length <= SHORT_LABEL)) return 3;
  return 2;
};
