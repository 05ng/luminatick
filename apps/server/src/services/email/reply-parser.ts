export class ReplyParser {
  /**
   * Isolates the newest message in an email thread.
   */
  static stripHistory(text?: string, html?: string): string {
    if (!text && !html) return '';

    // If text is available, prefer it for parsing
    if (text) {
      let cleaned = text;

      // 1. Look for pre-defined delimiter
      const delimiter = /##- Please type your reply above this line -##/i;
      const delimIndex = cleaned.search(delimiter);
      if (delimIndex !== -1) {
        cleaned = cleaned.substring(0, delimIndex);
      }

      // 2. Common Patterns like "On DATE, NAME wrote:"
      const commonPatterns = [
        /^On\s.+\sat\s.+\s.+wrote:$/m,
        /^From:\s/m,
        /^Sent:\s/m,
        /^---------- Forwarded message ----------/m,
        /^________________________________/m,
      ];

      for (const pattern of commonPatterns) {
        const match = cleaned.match(pattern);
        if (match && match.index !== undefined) {
          cleaned = cleaned.substring(0, match.index);
        }
      }

      // 3. Quoted blocks
      const lines = cleaned.split('\n');
      const filteredLines: string[] = [];
      for (const line of lines) {
        if (line.trim().startsWith('>')) {
          // If we hit a quoted line, assume the rest is history
          break;
        }
        filteredLines.push(line);
      }

      cleaned = filteredLines.join('\n').trim();
      return cleaned;
    }

    // Fallback for HTML if text is not available
    // For now, a very basic HTML stripper or use the plain text equivalent
    // Ideally, we'd use a DOM parser if available, but for now we'll return a basic strip
    return html ? html.replace(/<[^>]*>?/gm, '').trim() : '';
  }
}
