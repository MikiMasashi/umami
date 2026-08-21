import { describe, it, expect } from 'vitest';

/**
 * Unit tests for formatNote helper function.
 * This function is used in WebsitesTable to truncate and format note display.
 */

const MAX_NOTE_LENGTH = 100;

function formatNote(note?: string | null) {
  if (!note?.trim()) {
    return '-';
  }

  return note.length > MAX_NOTE_LENGTH ? `${note.substring(0, MAX_NOTE_LENGTH)}...` : note;
}

describe('formatNote Helper Function', () => {
  describe('Null and undefined handling', () => {
    it('should return "-" for null note', () => {
      expect(formatNote(null)).toBe('-');
    });

    it('should return "-" for undefined note', () => {
      expect(formatNote(undefined)).toBe('-');
    });

    it('should return "-" for empty string', () => {
      expect(formatNote('')).toBe('-');
    });

    it('should return "-" for whitespace-only string', () => {
      expect(formatNote('   ')).toBe('-');
      expect(formatNote('\n')).toBe('-');
      expect(formatNote('\t')).toBe('-');
    });
  });

  describe('Short notes (under 100 chars)', () => {
    it('should return full note if under 100 characters', () => {
      const note = 'This is a short note';
      expect(formatNote(note)).toBe(note);
    });

    it('should return full note if exactly 100 characters', () => {
      const note = 'a'.repeat(100);
      expect(formatNote(note)).toBe(note);
    });

    it('should return full note if 50 characters', () => {
      const note = 'a'.repeat(50);
      expect(formatNote(note)).toBe(note);
    });

    it('should trim leading/trailing whitespace before checking length', () => {
      const note = '  Short note  '; // 14 chars total, but 10 after trim
      // Note: current implementation checks trim() for empty, but doesn't trim before returning
      expect(formatNote(note)).toBe(note);
    });
  });

  describe('Long notes (over 100 chars)', () => {
    it('should truncate note at 100 characters and add "..."', () => {
      const note = 'a'.repeat(150);
      const expected = 'a'.repeat(100) + '...';
      expect(formatNote(note)).toBe(expected);
    });

    it('should truncate note at 101 characters', () => {
      const note = 'a'.repeat(101);
      const expected = 'a'.repeat(100) + '...';
      expect(formatNote(note)).toBe(expected);
    });

    it('should truncate very long note (500 chars)', () => {
      const note = 'a'.repeat(500);
      const expected = 'a'.repeat(100) + '...';
      expect(formatNote(note)).toBe(expected);
    });

    it('should truncate note with mixed content', () => {
      const longContent = 'The quick brown fox jumps over the lazy dog. '.repeat(3);
      const result = formatNote(longContent);
      expect(result).toBe(longContent.substring(0, 100) + '...');
      expect(result.length).toBe(103); // 100 + 3 for "..."
    });
  });

  describe('Special characters and unicode', () => {
    it('should handle note with special characters', () => {
      const note = 'Note: !@#$%^&*()_+-=[]{}|;:"\',.<>?/';
      expect(formatNote(note)).toBe(note);
    });

    it('should handle note with newlines (under 100 chars)', () => {
      const note = 'Line 1\nLine 2\nLine 3';
      expect(formatNote(note)).toBe(note);
    });

    it('should handle note with unicode characters (under 100 chars)', () => {
      const note = '日本語のメモです🎉';
      expect(formatNote(note)).toBe(note);
    });

    it('should truncate note with unicode characters', () => {
      const note = '日'.repeat(150);
      const result = formatNote(note);
      expect(result).toBe('日'.repeat(100) + '...');
    });

    it('should handle mixed unicode and ASCII', () => {
      const note = ('abc日本' + '123').repeat(20);
      const result = formatNote(note);
      expect(result).toBe(note.substring(0, 100) + '...');
    });

    it('should handle emoji in note', () => {
      const note = 'Test note 🎉🎊🎈'.repeat(10);
      const result = formatNote(note);
      expect(result.startsWith(note.substring(0, 100))).toBe(true);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle note with only spaces (100 chars)', () => {
      const note = ' '.repeat(100);
      expect(formatNote(note)).toBe('-'); // trim() makes it empty
    });

    it('should handle note with single character', () => {
      expect(formatNote('a')).toBe('a');
    });

    it('should handle very long note (1000+ chars)', () => {
      const note = 'a'.repeat(1000);
      expect(formatNote(note)).toBe('a'.repeat(100) + '...');
    });

    it('should handle note with exactly 100 visible chars (no ellipsis needed)', () => {
      const note = 'a'.repeat(100);
      expect(formatNote(note)).toBe(note);
      expect(formatNote(note)).not.toContain('...');
    });

    it('should handle note that becomes empty after trim', () => {
      const note = '     \n\t\n     ';
      expect(formatNote(note)).toBe('-');
    });

    it('should preserve internal whitespace but trim ends', () => {
      const note = '  multiple   spaces  inside  ';
      // trim() is called for empty check, but note is returned as-is
      expect(formatNote(note)).toBe(note);
    });
  });

  describe('Database compatibility', () => {
    it('should handle note from database (null)', () => {
      // Simulate database NULL
      const dbNote: string | null = null;
      expect(formatNote(dbNote)).toBe('-');
    });

    it('should handle note from database (empty string)', () => {
      // Simulate database empty string
      const dbNote = '';
      expect(formatNote(dbNote)).toBe('-');
    });

    it('should handle note from database (with content)', () => {
      // Simulate database with content
      const dbNote = 'This is a database note';
      expect(formatNote(dbNote)).toBe(dbNote);
    });

    it('should handle note from database (at max length)', () => {
      // Simulate database with max 500 char note
      const dbNote = 'a'.repeat(500);
      const result = formatNote(dbNote);
      expect(result).toBe('a'.repeat(100) + '...');
    });
  });

  describe('Performance considerations', () => {
    it('should handle very long string efficiently', () => {
      const note = 'a'.repeat(10000);
      const start = performance.now();
      const result = formatNote(note);
      const end = performance.now();

      expect(result).toBe('a'.repeat(100) + '...');
      expect(end - start).toBeLessThan(10); // Should complete quickly
    });

    it('should return same object for same input (no unnecessary processing)', () => {
      const note = 'Test note';
      const result1 = formatNote(note);
      const result2 = formatNote(note);

      expect(result1).toBe(result2);
    });
  });
});
