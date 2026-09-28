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

/**
 * Catalog metadata sometimes shouts ("DIL KAA JO HAAL HAI", "ABHIJEET
 * BHATTACHARYA"). Song titles and names read in title case, so an all-caps
 * name of two or more words is brought to title case. One-word names stay as
 * they are (ABBA, BTS, BLACKPINK), and so does anything already mixed-case.
 * Artist lists are handled name by name.
 */
const titleCaseName = (name: string): string => {
  const letters = name.replace(/[^A-Za-z]/g, '');
  const words = name.trim().split(/\s+/).filter(w => /[A-Za-z]/.test(w));
  if (words.length < 2 || letters.length < 4 || letters !== letters.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s([\-/"'])([a-z])/g, (_, before: string, c: string) => before + c.toUpperCase());
};

export const titleCaseShouting = (text: string): string =>
  text.split(/(,\s*|\s+&\s+)/).map(part => (/^(,\s*|\s+&\s+)$/.test(part) ? part : titleCaseName(part))).join('');

/** The built-in playlist is stored as "Liked Songs"; our copy is sentence case. */
export const displayPlaylistName = (name: string): string => (name === 'Liked Songs' ? 'Liked songs' : name);
