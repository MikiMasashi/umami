import { describe, expect, test } from 'vitest';
import {
  isWebsiteNotesValid,
  normalizeWebsiteNotes,
  WEBSITE_NOTES_MAX_LENGTH,
} from '@/lib/website-notes';

describe('website notes', () => {
  test('normalizes omitted and blank notes for update payloads', () => {
    expect(normalizeWebsiteNotes(undefined)).toBeUndefined();
    expect(normalizeWebsiteNotes(null)).toBeNull();
    expect(normalizeWebsiteNotes('')).toBeNull();
    expect(normalizeWebsiteNotes('   ')).toBeNull();
  });

  test('preserves non-blank text exactly as entered', () => {
    expect(normalizeWebsiteNotes('  Production owner: Growth team.  ')).toBe(
      '  Production owner: Growth team.  ',
    );
  });

  test('accepts notes at the 500 character boundary and rejects longer notes', () => {
    expect(isWebsiteNotesValid('N'.repeat(WEBSITE_NOTES_MAX_LENGTH))).toBe(true);
    expect(isWebsiteNotesValid('N'.repeat(WEBSITE_NOTES_MAX_LENGTH + 1))).toBe(false);
  });
});
