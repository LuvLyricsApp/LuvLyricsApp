/**
 * YouTube Music sends some shelf straplines in capitals ("CLASSICS FROM EVERY
 * DECADE"). LuvLyrics' copy is sentence case, so shouting text is brought
 * down; anything already mixed-case (names, titles) is left alone.
 */
export const sentenceCase = (text: string): string => {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || letters !== letters.toUpperCase()) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
