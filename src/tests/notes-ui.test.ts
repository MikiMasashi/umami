import { describe, expect, test } from 'vitest';
import { NOTES_MAX_LENGTH, notesSchema, truncateNotes } from '@/lib/notes';

describe('notes utilities', () => {
  test('50文字未満はそのまま返す', () => {
    expect(truncateNotes('abc', 50)).toBe('abc');
  });

  test('50文字ちょうどはそのまま返す', () => {
    expect(truncateNotes('a'.repeat(50), 50)).toBe('a'.repeat(50));
  });

  test('51文字以上は省略する', () => {
    expect(truncateNotes('a'.repeat(51), 50)).toBe(`${'a'.repeat(50)}...`);
  });

  test('null/undefined は空文字を返す', () => {
    expect(truncateNotes(null, 50)).toBe('');
    expect(truncateNotes(undefined, 50)).toBe('');
  });
});

describe('notes validation', () => {
  test('空文字を許可する', () => {
    expect(notesSchema.safeParse('').success).toBe(true);
  });

  test('500文字を許可する', () => {
    expect(notesSchema.safeParse('a'.repeat(NOTES_MAX_LENGTH)).success).toBe(true);
  });

  test('501文字以上を拒否する', () => {
    const result = notesSchema.safeParse('a'.repeat(NOTES_MAX_LENGTH + 1));
    expect(result.success).toBe(false);
  });
});
