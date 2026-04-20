import { describe, it, expect } from 'vitest';
import { ReplyParser } from '../reply-parser';

describe('ReplyParser', () => {
  it('should extract the latest message from a Gmail-style reply', () => {
    const text = `This is the new reply.

On Tue, Feb 20, 2024 at 10:00 AM John Doe <john@example.com> wrote:
> This is the previous message.
> Some more context.`;
    
    const result = ReplyParser.stripHistory(text);
    expect(result).toBe('This is the new reply.');
  });

  it('should extract the latest message from an Outlook-style reply', () => {
    const text = `This is the new reply from Outlook.

From: Jane Doe <jane@example.com>
Sent: Tuesday, February 20, 2024 10:05 AM
To: Support <support@luminatick.com>
Subject: Re: [#123] Help needed

This was the original message.`;

    const result = ReplyParser.stripHistory(text);
    expect(result).toBe('This is the new reply from Outlook.');
  });

  it('should extract the latest message from an Apple Mail-style reply', () => {
    const text = `This is the new reply from Apple Mail.

On Feb 20, 2024, at 10:10, John Smith wrote:

> Some quoted text here.`;

    const result = ReplyParser.stripHistory(text);
    expect(result).toBe('This is the new reply from Apple Mail.');
  });

  it('should use the delimiter if present', () => {
    const text = `This is my reply above the line.
##- Please type your reply above this line -##
Old history that should be removed.`;

    const result = ReplyParser.stripHistory(text);
    expect(result).toBe('This is my reply above the line.');
  });

  it('should handle quoted blocks correctly', () => {
    const text = `This is a fresh message.
> This is a quote.
> Another quote.`;

    const result = ReplyParser.stripHistory(text);
    expect(result).toBe('This is a fresh message.');
  });

  it('should handle empty input', () => {
    expect(ReplyParser.stripHistory('')).toBe('');
    expect(ReplyParser.stripHistory(undefined, undefined)).toBe('');
  });
});
