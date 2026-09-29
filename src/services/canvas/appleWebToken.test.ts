import { findBundlePath, findToken, jwtExpiry } from './appleWebToken';
import { fetchAppleMusicCanvas } from './providers';
import { mockFetch } from '../testing/mockFetch';

const AMP = 'https://amp-api.music.apple.com/v1/catalog';
// A throwaway JWT-shaped string (header.payload.sig) with exp = 2000000000.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/[=]+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOKEN = `${b64({ alg: 'ES256' })}.${b64({ iss: 'test', exp: 2000000000 })}.c2lnbmF0dXJl`;

describe('Apple web player token', () => {
  it('finds the index bundle and the JWT inside it', () => {
    expect(findBundlePath('<script type="module" crossorigin src="/assets/index-Bx12_aZ.js"></script>')).toBe('/assets/index-Bx12_aZ.js');
    expect(findBundlePath('<html></html>')).toBeNull();
    expect(findToken(`const a="x";const devToken="${TOKEN}";`)).toBe(TOKEN);
    expect(jwtExpiry(TOKEN)).toBe(2000000000 * 1000);
  });

  it('reads motion artwork through amp-api with the web token and web-player headers', async () => {
    const f = mockFetch([
      [`${AMP}/in/search`, {
        results: { songs: { data: [{
          id: '1', type: 'songs',
          attributes: { name: 'Levitating', artistName: 'Dua Lipa', albumName: 'Future Nostalgia', editorialVideo: { motionDetailSquare: { video: 'https://mvod/lev.m3u8' } } },
        }] } },
      }],
    ]);
    const hit = await fetchAppleMusicCanvas(
      { title: 'Levitating', artist: 'Dua Lipa' },
      { storefront: 'IN' },
      undefined,
      { webToken: async () => TOKEN, invalidateWebToken: () => {} },
    );
    f.restore();
    expect(hit?.url).toBe('https://mvod/lev.m3u8');
    expect(f.calls[0]).toContain('extend=editorialVideo');
  });

  it('re-reads the token once when Apple rejects it', async () => {
    let tokens = [TOKEN, `${TOKEN}x`];
    let invalidated = 0;
    const f = mockFetch([
      [`${AMP}/us/search`, (url: string) => (url ? null : null)], // every search rejected
    ]);
    const hit = await fetchAppleMusicCanvas(
      { title: 'Song', artist: 'Artist' },
      {},
      undefined,
      { webToken: async () => tokens[0], invalidateWebToken: () => { invalidated++; tokens = tokens.slice(1); } },
    );
    f.restore();
    expect(hit).toBeNull();
    expect(invalidated).toBe(1);
    expect(f.calls.filter(u => u.includes('/search'))).toHaveLength(2);
  });
});
