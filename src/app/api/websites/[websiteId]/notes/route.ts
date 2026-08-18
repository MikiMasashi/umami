import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, serverError, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { getWebsite, updateWebsite } from '@/queries/prisma';
import { NOTES_VALIDATION_MESSAGE, notesSchema } from '@/lib/notes';

const validationMessage = NOTES_VALIDATION_MESSAGE;
const unauthorizedMessage = 'メモを編集する権限がありません';
const notFoundMessage = '対象のウェブサイトが見つかりません';

const schema = z.object({
  notes: notesSchema,
});

export function normalizeWebsiteNotes(notes: string) {
  return notes === '' ? null : notes;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    const response = error();

    if (response?.status === 400) {
      return badRequest({
        message: validationMessage,
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    return response;
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized({
      message: unauthorizedMessage,
      code: 'FORBIDDEN_WEBSITE_UPDATE',
      status: 401,
    });
  }

  try {
    const website = await getWebsite(websiteId);

    if (!website) {
      return notFound({
        message: notFoundMessage,
        code: 'WEBSITE_NOT_FOUND',
        status: 404,
      });
    }

    const updatedWebsite = await updateWebsite(websiteId, {
      notes: normalizeWebsiteNotes(body.notes),
    });

    return json(updatedWebsite);
  } catch (error) {
    return serverError(error);
  }
}
