/**
 * LyricFlow - Formatter Utilities
 */

/**
 * Format seconds to MM:SS display format
 * @param seconds - Total seconds
 * @returns Formatted string like "1:23" or "0:05"
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format seconds to long format MM:SS for display
 * @param seconds - Total seconds
 * @returns Formatted string like "01:23"
 */
export const formatTimeLong = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format date to relative time (e.g., "2 days ago")
 * @param dateString - ISO date string
 * @returns Relative time string
 */
export const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      return `${diffMins} min ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
};

/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

/**
 * Generate unique ID using timestamp + random
 */
export const generateId = (): string => crypto.randomUUID();

/**
 * Format song subtitle (artist • album)
 */
export const formatSongSubtitle = (artist?: string, album?: string): string => {
  const parts = [artist, album]
    .filter(Boolean)
    .filter(p => p !== 'Downloaded'); // Filter out legacy/hardcoded 'Downloaded' album name
  return parts.join(' • ') || 'Unknown';
};
