import { describe, expect, test } from 'vitest';
import {
  getWebsiteNotesPreview,
  WEBSITE_NOTES_PREVIEW_LENGTH,
} from '@/lib/website-notes';

describe('website notes helpers', () => {
  test('returns null for unset notes', () => {
    expect(getWebsiteNotesPreview(null)).toBeNull();
    expect(getWebsiteNotesPreview(undefined)).toBeNull();
    expect(getWebsiteNotesPreview('')).toBeNull();
  });

  test('returns full text for short notes', () => {
    const note = 'Production site for JP market';
    expect(getWebsiteNotesPreview(note)).toEqual({
      text: note,
      truncated: false,
    });
  });

  test('truncates long notes for preview', () => {
    const longNote = 'x'.repeat(WEBSITE_NOTES_PREVIEW_LENGTH + 10);
    expect(getWebsiteNotesPreview(longNote)).toEqual({
      text: 'x'.repeat(WEBSITE_NOTES_PREVIEW_LENGTH),
      truncated: true,
    });
  });
});
