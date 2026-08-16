import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';
import { getShareByEntityId, getWebsite, updateWebsite } from '@/queries/prisma';
import { POST } from '@/app/api/websites/[websiteId]/route';

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

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);

const websiteId = 'website-1';

function makeRequest() {
  return new Request(`http://localhost/api/websites/${websiteId}`, { method: 'POST' });
}

function makeContext() {
  return { params: Promise.resolve({ websiteId }) };
}

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();

  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: websiteId, replayConfig: null } as any);
  updateWebsiteMock.mockResolvedValue({ id: websiteId } as any);
  getShareByEntityIdMock.mockResolvedValue(null as any);
});

test('POST forwards a provided notes value to updateWebsite', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'admin-id', isAdmin: true } },
    body: { notes: 'A helpful note' },
    error: undefined,
  } as any);

  const response = await POST(makeRequest(), makeContext());

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledTimes(1);
  expect(updateWebsiteMock.mock.calls[0][1]).toMatchObject({ notes: 'A helpful note' });
});

test('POST forwards a null notes value (clearing the note)', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'admin-id', isAdmin: true } },
    body: { notes: null },
    error: undefined,
  } as any);

  await POST(makeRequest(), makeContext());

  expect(updateWebsiteMock.mock.calls[0][1]).toHaveProperty('notes', null);
});

test('POST omits notes from the update when it is not provided', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'admin-id', isAdmin: true } },
    body: { name: 'New name' },
    error: undefined,
  } as any);

  await POST(makeRequest(), makeContext());

  expect(updateWebsiteMock.mock.calls[0][1]).not.toHaveProperty('notes');
});

test('POST returns 401 without update when the user cannot edit the website', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'viewer-id', isAdmin: false } },
    body: { notes: 'Attempted note' },
    error: undefined,
  } as any);
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await POST(makeRequest(), makeContext());

  expect(response.status).toBe(401);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});

test('POST surfaces the parseRequest validation error (e.g. notes too long)', async () => {
  const error = vi.fn(() => new Response(null, { status: 400 }));
  parseRequestMock.mockResolvedValue({ auth: undefined, body: undefined, error } as any);

  const response = await POST(makeRequest(), makeContext());

  expect(response.status).toBe(400);
  expect(error).toHaveBeenCalledTimes(1);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
