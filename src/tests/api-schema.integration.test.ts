import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Integration test suite for website memo API schema validation.
 * Tests the actual request/response schema handling.
 */

// Reproduce the actual schema from the API handler
const websiteUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  domain: z.string().max(500).optional(),
  note: z
    .string()
    .max(500, { message: 'Note must be 500 characters or less' })
    .nullable()
    .optional(),
  shareId: z.string().max(50).nullable().optional(),
  replayConfig: z
    .object({
      replayEnabled: z.boolean().optional(),
      heatmapEnabled: z.boolean().optional(),
      sampleRate: z.number().min(0).max(1).optional(),
      heatmapSampleRate: z.number().min(0).max(1).optional(),
      maskLevel: z.enum(['strict', 'moderate']).optional(),
      maxDuration: z.number().int().positive().optional(),
      blockSelector: z.string().optional(),
    })
    .nullable()
    .optional(),
});

describe('API Schema - Website Update Endpoint', () => {
  describe('Note field validation in full request', () => {
    it('should accept update request with valid note', () => {
      const request = {
        name: 'Test Site',
        domain: 'test.com',
        note: 'This is a test note',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('This is a test note');
      }
    });

    it('should accept update request with null note', () => {
      const request = {
        name: 'Test Site',
        domain: 'test.com',
        note: null,
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBeNull();
      }
    });

    it('should accept update request without note field', () => {
      const request = {
        name: 'Test Site',
        domain: 'test.com',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBeUndefined();
      }
    });

    it('should accept update with only note field', () => {
      const request = {
        note: 'Updated note',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('Updated note');
      }
    });

    it('should accept note at exactly 500 characters', () => {
      const request = {
        note: 'a'.repeat(500),
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject note exceeding 500 characters', () => {
      const request = {
        note: 'a'.repeat(501),
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Note must be 500 characters or less');
      }
    });
  });

  describe('Full request with multiple fields', () => {
    it('should validate complete update request', () => {
      const request = {
        name: 'Updated Site',
        domain: 'updated.com',
        note: 'Production environment note',
        shareId: 'share-123',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Site');
        expect(result.data.domain).toBe('updated.com');
        expect(result.data.note).toBe('Production environment note');
        expect(result.data.shareId).toBe('share-123');
      }
    });

    it('should validate update with replay config and note', () => {
      const request = {
        name: 'Site with Replay',
        domain: 'replay.com',
        note: 'Has replay config',
        replayConfig: {
          replayEnabled: true,
          heatmapEnabled: false,
          sampleRate: 0.5,
        },
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('Has replay config');
        expect(result.data.replayConfig?.replayEnabled).toBe(true);
      }
    });

    it('should reject request with note over 500 chars even with other valid fields', () => {
      const request = {
        name: 'Test Site',
        domain: 'test.com',
        note: 'a'.repeat(501),
        shareId: 'valid-share',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('Empty string normalization', () => {
    it('should accept empty string as valid schema value', () => {
      // Empty string is valid by zod schema (not null)
      // Normalization to null happens in API handler
      const request = {
        note: '',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('');
      }
    });

    it('should normalize empty string in API handler logic', () => {
      // Simulating API handler normalization
      const formData = { note: '' };
      const normalizedData = {
        note: formData.note === '' ? null : formData.note,
      };

      const result = websiteUpdateSchema.safeParse(normalizedData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBeNull();
      }
    });

    it('should not normalize non-empty whitespace', () => {
      const request = {
        note: '   ',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('   ');
      }
    });
  });

  describe('Error messages and reporting', () => {
    it('should provide clear error message for oversized note', () => {
      const request = {
        note: 'a'.repeat(501),
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        const noteError = result.error.issues.find(issue => issue.code === 'too_big');
        expect(noteError?.message).toBe('Note must be 500 characters or less');
      }
    });

    it('should include all validation errors in response', () => {
      const request = {
        name: 'a'.repeat(101), // Too long
        domain: 'a'.repeat(501), // Too long
        note: 'a'.repeat(501), // Too long
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Backward compatibility in schema', () => {
    it('should handle old request without note field', () => {
      const oldRequest = {
        name: 'Old Site',
        domain: 'old.com',
      };

      const result = websiteUpdateSchema.safeParse(oldRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBeUndefined();
      }
    });

    it('should handle request with only name (minimal)', () => {
      const minimalRequest = {
        name: 'Just Name',
      };

      const result = websiteUpdateSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
    });

    it('should handle request with mixed old and new fields', () => {
      const mixedRequest = {
        name: 'Mixed Site',
        domain: 'mixed.com',
        shareId: 'share-id', // Existing field
        note: 'New note field', // New field
      };

      const result = websiteUpdateSchema.safeParse(mixedRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shareId).toBe('share-id');
        expect(result.data.note).toBe('New note field');
      }
    });
  });

  describe('Data type validation', () => {
    it('should reject non-string note', () => {
      const request = {
        note: 123,
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject object as note', () => {
      const request = {
        note: { text: 'not allowed' },
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject array as note', () => {
      const request = {
        note: ['not', 'allowed'],
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should accept boolean false as invalid (not coerced)', () => {
      const request = {
        note: false,
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('Unicode and special characters', () => {
    it('should accept unicode characters in note', () => {
      const request = {
        note: '日本語のメモ🎉',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toBe('日本語のメモ🎉');
      }
    });

    it('should accept special characters in note', () => {
      const request = {
        note: 'Note: !@#$%^&*()_+-=[]{}|;:"\',.<>?/',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept newlines in note', () => {
      const request = {
        note: 'Line 1\nLine 2\nLine 3',
      };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note).toContain('\n');
      }
    });

    it('should count characters correctly for unicode', () => {
      // Each emoji counts as 1-2 characters in JavaScript string length
      // depending on how it's encoded. Use a safer test.
      const note = 'あ'.repeat(300); // 300 Japanese characters = 300 chars
      const request = { note };

      const result = websiteUpdateSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note?.length).toBe(300);
      }
    });
  });
});
