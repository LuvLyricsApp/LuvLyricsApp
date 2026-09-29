/**
 * Ways to read the download queue without waking on every progress tick.
 *
 * A download reports progress up to four times a second, and each report gives
 * the store a new `queue` array. A screen that subscribes to the array itself
 * therefore re-renders four times a second per download, even if all it draws is
 * "3 in progress". Screens read the queue's *shape* instead (which items exist
 * and what state each is in), which only changes when something is added,
 * removed or moves to another state, and each row subscribes to its own item.
 */
import { useDownloadQueueStore, QueueItem } from './downloadQueueStore';

/** Which items are queued and in what state; progress and stage text do not count. */
export const queueShape = (queue: readonly QueueItem[]): string =>
  queue.map(item => `${item.id}:${item.status}`).join('|');

/** Re-renders the caller only when the queue's shape changes. Read the items with `getState()`. */
export const useQueueShape = (): string => useDownloadQueueStore(state => queueShape(state.queue));

/** One item, live: only the row showing it re-renders as its progress moves. */
export const useDownloadItem = (id: string): QueueItem | undefined =>
  useDownloadQueueStore(state => state.queue.find(item => item.id === id));
