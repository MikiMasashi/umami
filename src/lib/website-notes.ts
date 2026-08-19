export const WEBSITE_NOTES_MAX_LENGTH = 500;
export const WEBSITE_NOTES_TOO_LONG_MESSAGE = 'Notes must be 500 characters or fewer.';

export function normalizeWebsiteNotes(notes: string | null | undefined) {
  if (notes === undefined) {
    return undefined;
  }

  if (notes === null || notes.trim() === '') {
    return null;
  }

  return notes;
}

export function isWebsiteNotesValid(notes: string | null | undefined) {
  return notes === undefined || notes === null || notes.length <= WEBSITE_NOTES_MAX_LENGTH;
}
