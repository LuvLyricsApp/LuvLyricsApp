/**
 * What the voice card says when listening ends without a song. Every native
 * code (VoiceInputModule.kt) gets a plain sentence that says what happened
 * and what to do — never a bare "something went wrong".
 */
export const voiceErrorMessage = (code: string): string => {
  switch (code) {
    case 'no_speech':
      return 'Didn’t hear a song — hold the mic and say its name';
    case 'permission_denied':
      return 'Allow the microphone to search by voice';
    case 'not_available':
    case 'no_context':
      return 'This phone has no speech recognition';
    case 'network_error':
      return 'Voice search needs a connection on this phone';
    case 'language_unavailable':
      return 'Speech for your phone’s language isn’t installed';
    case 'busy':
      return 'The microphone is busy — try again';
    case 'audio_error':
      return 'Couldn’t use the microphone — is another app recording?';
    default:
      return 'Voice search stopped — hold the mic and try again';
  }
};

/** Codes that are the listener's choice (let go early), not a fault: no error shake. */
export const isQuietVoiceEnd = (code: string): boolean => code === 'no_speech';
