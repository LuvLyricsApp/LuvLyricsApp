import { sentenceCase, titleCaseShouting } from './sentenceCase';

describe('sentenceCase', () => {
  it('brings all-caps straplines down to sentence case', () => {
    expect(sentenceCase('CLASSICS FROM EVERY DECADE')).toBe('Classics from every decade');
  });
  it('leaves mixed-case text and short acronyms alone', () => {
    expect(sentenceCase('Quick picks from AR Rahman')).toBe('Quick picks from AR Rahman');
    expect(sentenceCase('BTS')).toBe('BTS');
  });
});

describe('displayPlaylistName', () => {
  it('shows the built-in playlist in sentence case and leaves others alone', () => {
    const { displayPlaylistName } = jest.requireActual('./sentenceCase');
    expect(displayPlaylistName('Liked Songs')).toBe('Liked songs');
    expect(displayPlaylistName('Road Trip')).toBe('Road Trip');
  });
});

describe('titleCaseShouting', () => {
  it('brings shouting song titles and names to title case', () => {
    expect(titleCaseShouting('DIL KAA JO HAAL HAI')).toBe('Dil Kaa Jo Haal Hai');
    expect(titleCaseShouting('TUM HI HO (FROM "AASHIQUI 2")')).toBe('Tum Hi Ho (From "Aashiqui 2")');
  });
  it('handles an artist list name by name, leaving one-word acts alone', () => {
    expect(titleCaseShouting('ABHIJEET BHATTACHARYA, ALKA YAGNIK')).toBe('Abhijeet Bhattacharya, Alka Yagnik');
    expect(titleCaseShouting('BTS, HALSEY')).toBe('BTS, HALSEY');
    expect(titleCaseShouting('ABBA & MARIAH CAREY')).toBe('ABBA & Mariah Carey');
  });
  it('leaves mixed-case text alone', () => {
    expect(titleCaseShouting('Blinding Lights')).toBe('Blinding Lights');
    expect(titleCaseShouting('AC/DC')).toBe('AC/DC');
    expect(titleCaseShouting('Dil Ne Yeh Kaha Hai Dil Se')).toBe('Dil Ne Yeh Kaha Hai Dil Se');
  });
});
