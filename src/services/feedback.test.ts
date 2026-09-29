import { cleanDraft, FEEDBACK_MAX, feedbackProblem } from './feedbackDraft';

describe('feedbackProblem', () => {
  it('asks for a little more when the message is too short to act on', () => {
    expect(feedbackProblem({ message: '  hi ' })).not.toBeNull();
  });

  it('accepts a real report, with or without a contact', () => {
    expect(feedbackProblem({ message: 'Lyrics froze on the second verse' })).toBeNull();
    expect(feedbackProblem({ message: 'Lyrics froze on the second verse', contact: '@someone' })).toBeNull();
  });

  it('turns away a message or contact that is too long, as the server would', () => {
    expect(feedbackProblem({ message: 'x'.repeat(FEEDBACK_MAX + 1) })).not.toBeNull();
    expect(feedbackProblem({ message: 'Lyrics froze again', contact: 'x'.repeat(201) })).not.toBeNull();
  });
});

describe('cleanDraft', () => {
  it('trims the message and leaves out an empty contact', () => {
    expect(cleanDraft({ message: '  It crashed when I opened Luvs  ', contact: '   ' })).toEqual({ message: 'It crashed when I opened Luvs' });
  });

  it('keeps a contact when there is one', () => {
    expect(cleanDraft({ message: 'It crashed', contact: ' @me ' })).toEqual({ message: 'It crashed', contact: '@me' });
  });
});
