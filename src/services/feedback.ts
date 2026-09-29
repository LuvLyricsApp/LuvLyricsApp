/**
 * Bug reports from the About sheet, stored in the `feedbacks` table of the
 * Convex project the website uses (luvlyricsweb). The app talks to Convex's
 * public HTTP API directly — one POST, no SDK — and only ever calls the
 * `feedbacks:send` mutation, which checks everything again on the server.
 *
 * EXPO_PUBLIC_CONVEX_URL points it at another deployment (e.g. production).
 */
import { Platform } from 'react-native';
import appConfig from '../../app.json';
import { cleanDraft, FeedbackDraft, feedbackProblem } from './feedbackDraft';

export { FEEDBACK_MAX, feedbackProblem } from './feedbackDraft';
export type { FeedbackDraft } from './feedbackDraft';

/** The website's Convex deployment (not a secret: it is the public API address). */
const DEFAULT_CONVEX_URL = 'https://charming-jaguar-140.convex.cloud';
export const CONVEX_URL = (process.env.EXPO_PUBLIC_CONVEX_URL || DEFAULT_CONVEX_URL).replace(/\/+$/, '');

/** The mutation's arguments: the cleaned report, and which build and phone it came from. */
const feedbackArgs = (draft: FeedbackDraft) => ({
  ...cleanDraft(draft),
  appVersion: appConfig.expo.version,
  platform: Platform.OS,
  osVersion: String(Platform.Version),
});

type ConvexReply = { status: 'success'; value: unknown } | { status: 'error'; errorMessage?: string };

/** Sends a report. Throws with a readable message when it does not get through. */
export const sendFeedback = async (draft: FeedbackDraft): Promise<void> => {
  const problem = feedbackProblem(draft);
  if (problem) throw new Error(problem);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'feedbacks:send', args: feedbackArgs(draft), format: 'json' }),
      signal: controller.signal,
    });
    const reply = (await res.json().catch(() => null)) as ConvexReply | null;
    if (!res.ok || !reply || reply.status !== 'success') {
      throw new Error(reply && reply.status === 'error' && reply.errorMessage ? 'The server turned it away. Try again in a bit.' : 'Could not reach the server. Try again in a bit.');
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('That took too long. Check your connection and try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
};
