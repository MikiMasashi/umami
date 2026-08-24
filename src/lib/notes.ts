import { z } from 'zod';

export const NOTES_MAX_LENGTH = 500;
export const NOTES_LIST_PREVIEW_LENGTH = 50;
export const NOTES_VALIDATION_MESSAGE = 'メモは500文字以内です';

export const notesSchema = z.string().max(NOTES_MAX_LENGTH, NOTES_VALIDATION_MESSAGE);

export function truncateNotes(text?: string | null, maxLength = NOTES_LIST_PREVIEW_LENGTH) {
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}
