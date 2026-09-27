jest.mock('../services/stream/officialSearch', () => ({ searchOfficial: jest.fn() }));
jest.mock('../services/stream/StreamService', () => ({ StreamService: { play: jest.fn() } }));
jest.mock('../store/playerStore', () => ({ usePlayerStore: { getState: () => ({ currentSongId: null }) } }));
jest.mock('../utils/navigationService', () => ({ navigationRef: { isReady: () => true, navigate: jest.fn() } }));
jest.mock('react-native', () => ({ Linking: { getInitialURL: jest.fn(), addEventListener: jest.fn() } }));

import { parseDeepLink } from './useDeepLinks';

describe('parseDeepLink', () => {
  it('reads the action and decoded params', () => {
    expect(parseDeepLink('lyricflow://play?q=Blinding+Lights%20The%20Weeknd&lyrics=1')).toEqual({
      action: 'play',
      params: { q: 'Blinding Lights The Weeknd', lyrics: '1' },
    });
    expect(parseDeepLink('lyricflow://open/settings')).toEqual({ action: 'open/settings', params: {} });
    expect(parseDeepLink('lyricflow://diagnose/')).toEqual({ action: 'diagnose', params: {} });
    expect(parseDeepLink('https://example.com')).toBeNull();
  });
});

describe('player and invite links', () => {
  it('parses a sheet request and an invite code', () => {
    expect(parseDeepLink('lyricflow://player?sheet=menu')).toEqual({ action: 'player', params: { sheet: 'menu' } });
    expect(parseDeepLink('lyricflow://together?code=ab12cd')).toEqual({ action: 'together', params: { code: 'ab12cd' } });
  });
});
