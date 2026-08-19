import { describe, expect, test } from 'vitest';
import {
  getWebsiteNotesPreview,
  hasWebsiteNotes,
  normalizeWebsiteNotes,
  WEBSITE_NOTES_PREVIEW_LENGTH,
} from '@/lib/website-notes';

describe('website notes helpers', () => {
  test('normalizes empty notes to null', () => {
    expect(normalizeWebsiteNotes(undefined)).toBeNull();
    expect(normalizeWebsiteNotes(null)).toBeNull();
    expect(normalizeWebsiteNotes('')).toBeNull();
    expect(normalizeWebsiteNotes('   ')).toBeNull();
  });

  test('trims meaningful notes', () => {
    expect(normalizeWebsiteNotes('  Production website  ')).toBe('Production website');
    expect(hasWebsiteNotes('Production website')).toBe(true);
    expect(hasWebsiteNotes('   ')).toBe(false);
  });

  test('builds a compact notes preview', () => {
    const longNotes = 'a'.repeat(WEBSITE_NOTES_PREVIEW_LENGTH + 1);

    expect(getWebsiteNotesPreview(null)).toBeNull();
    expect(getWebsiteNotesPreview('Short note')).toBe('Short note');
    expect(getWebsiteNotesPreview(longNotes)).toBe(
      `${'a'.repeat(WEBSITE_NOTES_PREVIEW_LENGTH)}...`,
    );
  });
});
