/**
 * Centralized promise error handling for services and contexts.
 * Provides a single point for logging and future crash reporting integration.
 *
 * Usage patterns:
 * - For fire-and-forget promises: promise.catch(e => handleAsyncError('ComponentName', e))
 * - For async/await: use try/catch, then call handleAsyncError in the catch block
 * - Silent failures are NOT used (all errors are logged in development)
 */

/**
 * Standardized async error handler for promises and try/catch blocks.
 * In development, logs all errors for visibility.
 * In production, could integrate with crash reporting services.
 *
 * @param context - A descriptive name of the context where the error occurred (e.g., 'PlayerContext.nextInPlaylist')
 * @param error - The caught error object
 * @returns void
 */
export function handleAsyncError(context: string, error: unknown): void {
  if (__DEV__) {
    console.error(`[${context}] Async error:`, error);
  }
  // Future: Send to crash reporting service in production
  // Future: Example - Sentry.captureException(error, { tags: { context } });
}
