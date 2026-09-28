import { isQuietVoiceEnd, voiceErrorMessage } from './voiceErrors';

describe('voiceErrorMessage', () => {
  it('never falls back to "something went wrong"', () => {
    for (const code of ['no_speech', 'permission_denied', 'not_available', 'network_error', 'busy', 'audio_error', 'error_99', '']) {
      const message = voiceErrorMessage(code);
      expect(message.toLowerCase()).not.toContain('something went wrong');
      expect(message[0]).toBe(message[0].toUpperCase());
    }
  });

  it('tells the listener what to do when nothing was heard', () => {
    expect(voiceErrorMessage('no_speech')).toMatch(/hold the mic/);
    expect(isQuietVoiceEnd('no_speech')).toBe(true);
    expect(isQuietVoiceEnd('audio_error')).toBe(false);
  });
});
