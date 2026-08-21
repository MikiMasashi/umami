import { z } from 'zod';
import { describe, it, expect } from 'vitest';

/**
 * Test suite for website note field validation.
 * Validates that the zod schema for note field behaves correctly.
 */

const noteSchema = z.string().max(500, { message: 'Note must be 500 characters or less' }).nullable().optional();

describe('Website Note Validation', () => {
  describe('Valid notes', () => {
    it('should accept a valid note string', () => {
      const result = noteSchema.safeParse('This is a test note');
      expect(result.success).toBe(true);
    });

    it('should accept a note exactly 500 characters', () => {
      const note = 'a'.repeat(500);
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should accept a null note', () => {
      const result = noteSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it('should accept undefined (optional)', () => {
      const result = noteSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should accept an empty string', () => {
      const result = noteSchema.safeParse('');
      expect(result.success).toBe(true);
    });

    it('should accept a note with newlines', () => {
      const note = 'Line 1\nLine 2\nLine 3';
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should accept a note with special characters', () => {
      const note = 'Note with special chars: !@#$%^&*()_+-=[]{}|;:"\',.<>?/';
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should accept a note with unicode characters', () => {
      const note = '日本語のメモです🎉';
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid notes', () => {
    it('should reject a note longer than 500 characters', () => {
      const note = 'a'.repeat(501);
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Note must be 500 characters or less');
      }
    });

    it('should reject a note with 501 characters', () => {
      const note = 'a'.repeat(501);
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject a note with 1000 characters', () => {
      const note = 'a'.repeat(1000);
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(false);
    });

    it('should reject a non-string, non-null value', () => {
      const result = noteSchema.safeParse(123);
      expect(result.success).toBe(false);
    });

    it('should reject an object', () => {
      const result = noteSchema.safeParse({ note: 'test' });
      expect(result.success).toBe(false);
    });

    it('should reject an array', () => {
      const result = noteSchema.safeParse(['test']);
      expect(result.success).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle unicode characters within 500 char limit', () => {
      // Each emoji can count differently depending on encoding
      const note = '😀'.repeat(200); // 200 emojis
      const result = noteSchema.safeParse(note);
      // Should succeed as it's under 500 character limit
      expect(result.success).toBe(true);
    });

    it('should handle whitespace correctly', () => {
      const note = '   spaces and tabs\t\tand newlines\n   ';
      const result = noteSchema.safeParse(note);
      expect(result.success).toBe(true);
    });

    it('should parse successfully when defined in object schema', () => {
      const websiteUpdateSchema = z.object({
        name: z.string().optional(),
        domain: z.string().optional(),
        note: z.string().max(500).nullable().optional(),
      });

      const result = websiteUpdateSchema.safeParse({
        name: 'Example Site',
        domain: 'example.com',
        note: 'This is a test note',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('This is a test note');
      }
    });

    it('should normalize empty string context in form submission', () => {
      // In the API/form, empty string should be converted to null
      const formData = { note: '' };
      const normalizedData = { note: formData.note === '' ? null : formData.note };
      const result = noteSchema.safeParse(normalizedData.note);
      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });
  });

  describe('Backward compatibility', () => {
    it('should handle websites without note field (undefined)', () => {
      const result = noteSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should handle websites with note field as null', () => {
      const result = noteSchema.safeParse(null);
      expect(result.success).toBe(true);
    });

    it('should coerce undefined to undefined, not empty string', () => {
      const result = noteSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });
});
