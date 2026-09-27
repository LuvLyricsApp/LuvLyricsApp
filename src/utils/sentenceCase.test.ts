import { sentenceCase } from './sentenceCase';

describe('sentenceCase', () => {
  it('brings all-caps straplines down to sentence case', () => {
    expect(sentenceCase('CLASSICS FROM EVERY DECADE')).toBe('Classics from every decade');
  });
  it('leaves mixed-case text and short acronyms alone', () => {
    expect(sentenceCase('Quick picks from AR Rahman')).toBe('Quick picks from AR Rahman');
    expect(sentenceCase('BTS')).toBe('BTS');
  });
});
