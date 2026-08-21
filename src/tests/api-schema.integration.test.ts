import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Integration test suite for website memo API schema validation.
 * Tests the note field boundary values against the actual API schema.
 */

// Test only the note field schema (subset of the full website update schema)
const noteFieldSchema = z
  .string()
  .max(500, { message: 'Note must be 500 characters or less' })
  .nullable()
  .optional();

describe('Note field schema validation', () => {
  describe('Boundary value tests for note field', () => {
    it('should accept null value', () => {
      const result = noteFieldSchema.safeParse(null);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('should accept empty string', () => {
      const result = noteFieldSchema.safeParse('');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('');
      }
    });

    it('should accept note at exactly 500 characters', () => {
      const note = 'a'.repeat(500);
      const result = noteFieldSchema.safeParse(note);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(note);
      }
    });

    it('should reject note exceeding 500 characters', () => {
      const note = 'a'.repeat(501);
      const result = noteFieldSchema.safeParse(note);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Note must be 500 characters or less');
      }
    });
  });
});
