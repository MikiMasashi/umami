import { expect, test } from 'vitest';
import { summarizeNotes } from '@/lib/format';

// Unit tests for US-201-3: notes summary/truncation used by the websites list
// column. Complements the reviewed component/E2E tests, which exercise this
// behavior only indirectly through the rendered table cell.

test('summarizeNotes returns null for unset notes', () => {
  expect(summarizeNotes(null)).toBeNull();
  expect(summarizeNotes(undefined)).toBeNull();
  expect(summarizeNotes('')).toBeNull();
});

test('summarizeNotes returns the notes unchanged when within the summary length', () => {
  expect(summarizeNotes('Short note.')).toBe('Short note.');
  expect(summarizeNotes('A'.repeat(60))).toBe('A'.repeat(60));
});

test('summarizeNotes truncates to 60 characters with an ellipsis when longer', () => {
  const longNotes = 'B'.repeat(120);

  const summary = summarizeNotes(longNotes);

  expect(summary).toBe(`${'B'.repeat(60)}…`);
  expect(summary).not.toBe(longNotes);
});

test('summarizeNotes truncates at exactly 61 characters', () => {
  const notes = 'C'.repeat(61);

  expect(summarizeNotes(notes)).toBe(`${'C'.repeat(60)}…`);
});
