import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { POST } from '@/app/api/websites/[websiteId]/route';
import { parseRequest } from '@/lib/request';
import { badRequest } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { getShareByEntityId, getWebsite, updateWebsite } from '@/queries/prisma';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
  canDeleteWebsite: vi.fn(),
  canViewSharedWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  createShare: vi.fn(),
  deleteSharesByEntityId: vi.fn(),
  deleteWebsite: vi.fn(),
  getShareByEntityId: vi.fn(),
  getWebsite: vi.fn(),
  updateWebsite: vi.fn(),
}));

// Mirrors the notes constraint from the update route's zod schema (api-specification.md §2.2)
// so tests can exercise the same 500 character validation contract without loading the real
// parseRequest implementation (which pulls in the Prisma client).
const notesSchema = z.object({ notes: z.string().max(500).nullable().optional() }).partial();

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);

const websiteId = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

function buildRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/websites/${websiteId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callPost(body: Record<string, unknown>) {
  const result = notesSchema.safeParse(body);

  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body,
    error: result.success ? undefined : () => badRequest(z.treeifyError(result.error)),
  });

  return POST(buildRequest(body), { params: Promise.resolve({ websiteId }) });
}

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();

  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: websiteId,
    name: 'Existing site',
    domain: 'example.com',
    notes: 'old note',
    replayConfig: null,
  } as any);
  updateWebsiteMock.mockImplementation(
    (_id, data) =>
      Promise.resolve({
        id: websiteId,
        name: 'Existing site',
        domain: 'example.com',
        ...data,
      }) as any,
  );
  getShareByEntityIdMock.mockResolvedValue(null);
});

test('saves a notes value within the 500 character limit', async () => {
  const response = await callPost({ notes: 'This is a valid note.' });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: 'This is a valid note.' }),
  );
});

test('rejects notes exceeding the 500 character limit with a 400 response', async () => {
  const response = await callPost({ notes: 'a'.repeat(501) });

  expect(response.status).toBe(400);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});

test('accepts exactly 500 characters', async () => {
  const response = await callPost({ notes: 'a'.repeat(500) });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: 'a'.repeat(500) }),
  );
});

test('normalizes an empty string notes value to null', async () => {
  const response = await callPost({ notes: '' });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: null }),
  );
});

test('normalizes a whitespace-only notes value to null', async () => {
  const response = await callPost({ notes: '   ' });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: null }),
  );
});

test('leaves notes untouched when omitted from the request body (backward compatibility)', async () => {
  const response = await callPost({ name: 'Renamed site' });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: undefined }),
  );
});

test('accepts an explicit null notes value', async () => {
  const response = await callPost({ notes: null });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ notes: null }),
  );
});

test('rejects a notes update from a user without update permission', async () => {
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await callPost({ notes: 'Attempted change' });

  expect(response.status).toBe(401);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
