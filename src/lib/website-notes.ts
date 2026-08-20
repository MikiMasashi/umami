export const WEBSITE_NOTES_MAX_LENGTH = 500;
export const WEBSITE_NOTES_MAX_LENGTH_ERROR = 'Notes must be 500 characters or less.';
export const WEBSITE_NOTES_PREVIEW_LENGTH = 120;

export function getWebsiteNotesPreview(notes: string | null | undefined) {
  if (notes == null || notes === '') {
    return null;
  }

  if (notes.length <= WEBSITE_NOTES_PREVIEW_LENGTH) {
    return {
      text: notes,
      truncated: false,
    };
  }

  return {
    text: notes.slice(0, WEBSITE_NOTES_PREVIEW_LENGTH).trimEnd(),
    truncated: true,
  };
}
