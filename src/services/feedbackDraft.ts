/** The rules for a bug report, kept apart from the sending (services/feedback) so they can be tested. The server checks them again. */
export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 2000;
export const CONTACT_MAX = 200;

export interface FeedbackDraft {
  message: string;
  contact?: string;
}

/** Why a draft cannot be sent yet, or null when it can. */
export const feedbackProblem = (draft: FeedbackDraft): string | null => {
  const message = draft.message.trim();
  if (message.length < FEEDBACK_MIN) return 'Tell me a little more about what happened.';
  if (message.length > FEEDBACK_MAX) return `Keep it under ${FEEDBACK_MAX} characters.`;
  if ((draft.contact ?? '').trim().length > CONTACT_MAX) return 'That contact is too long.';
  return null;
};

/** Trimmed, with an empty contact left out. */
export const cleanDraft = (draft: FeedbackDraft): { message: string; contact?: string } => {
  const contact = (draft.contact ?? '').trim();
  return contact ? { message: draft.message.trim(), contact } : { message: draft.message.trim() };
};
