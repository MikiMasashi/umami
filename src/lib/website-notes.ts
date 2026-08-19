export const WEBSITE_NOTES_MAX_LENGTH = 500;
export const WEBSITE_NOTES_PREVIEW_LENGTH = 120;

export function normalizeWebsiteNotes(notes: string | null | undefined) {
  if (notes == null) {
    return null;
  }

  const trimmedNotes = notes.trim();

  return trimmedNotes.length > 0 ? trimmedNotes : null;
}

export function hasWebsiteNotes(notes: string | null | undefined) {
  return normalizeWebsiteNotes(notes) !== null;
}

export function getWebsiteNotesPreview(notes: string | null | undefined) {
  const normalizedNotes = normalizeWebsiteNotes(notes);

  if (!normalizedNotes) {
    return null;
  }

  return normalizedNotes.length > WEBSITE_NOTES_PREVIEW_LENGTH
    ? `${normalizedNotes.slice(0, WEBSITE_NOTES_PREVIEW_LENGTH)}...`
    : normalizedNotes;
}
