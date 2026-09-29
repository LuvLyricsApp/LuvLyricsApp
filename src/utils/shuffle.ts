/** A shuffled copy (Fisher–Yates); the list you pass is left alone. */
export const shuffled = <T,>(list: readonly T[], random: () => number = Math.random): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
