import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/websites/[websiteId]/route';
import { checkAuth } from '@/lib/auth';
import { canUpdateWebsite } from '@/permissions';
import { getShareByEntityId, getWebsite, updateWebsite } from '@/queries/prisma';

vi.mock('@/lib/auth', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canDeleteWebsite: vi.fn(),
  canUpdateWebsite: vi.fn(),
  canViewSharedWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  createShare: vi.fn(),
  deleteSharesByEntityId: vi.fn(),
  deleteWebsite: vi.fn(),
  getShareByEntityId: vi.fn(),
  getWebsite: vi.fn(),
  updateWebsite: vi.fn(),
  getWebsiteSegment: vi.fn(),
}));

const checkAuthMock = vi.mocked(checkAuth);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);
const updateWebsiteMock = vi.mocked(updateWebsite);

const websiteId = '00000000-0000-0000-0000-000000000001';

function buildRequest(body: Record<string, any>) {
  return new Request(`http://localhost/api/websites/${websiteId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callPost(request: Request) {
  return POST(request, { params: Promise.resolve({ websiteId }) });
}

beforeEach(() => {
  checkAuthMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();
  updateWebsiteMock.mockReset();

  checkAuthMock.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } } as any);
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'a.com' } as any);
  getShareByEntityIdMock.mockResolvedValue(null as any);
  updateWebsiteMock.mockImplementation(
    async (_id: string, data: any) => ({ id: websiteId, name: 'Site', ...data }) as any,
  );
});

describe('POST /api/websites/[websiteId] notes handling', () => {
  test('AC-2.1: saves notes at the 500 character boundary (200)', async () => {
    const notes = 'a'.repeat(500);

    const response = await callPost(buildRequest({ notes }));

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(websiteId, expect.objectContaining({ notes }));
  });

  test('AC-2.2 / AC-2.3: rejects notes over 500 characters (400) and does not persist', async () => {
    const notes = 'a'.repeat(501);

    const response = await callPost(buildRequest({ notes }));

    expect(response.status).toBe(400);
    expect(updateWebsiteMock).not.toHaveBeenCalled();
  });

  test('AC-1.4 / Q5: empty string is normalized to null', async () => {
    const response = await callPost(buildRequest({ notes: '' }));

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(
      websiteId,
      expect.objectContaining({ notes: null }),
    );
  });

  test('Q5: whitespace-only notes are normalized to null', async () => {
    const response = await callPost(buildRequest({ notes: '   \n  ' }));

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(
      websiteId,
      expect.objectContaining({ notes: null }),
    );
  });

  test('Q5: surrounding whitespace is trimmed before saving', async () => {
    const response = await callPost(buildRequest({ notes: '   hello world  ' }));

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(
      websiteId,
      expect.objectContaining({ notes: 'hello world' }),
    );
  });

  test('AC-1.3: explicit notes value overwrites existing notes', async () => {
    const response = await callPost(buildRequest({ notes: 'updated note' }));

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(
      websiteId,
      expect.objectContaining({ notes: 'updated note' }),
    );
  });

  test('AC-5.2: omitting notes leaves the field untouched (preserved)', async () => {
    const response = await callPost(buildRequest({ name: 'New name' }));

    expect(response.status).toBe(200);
    const passedData = updateWebsiteMock.mock.calls[0][1] as Record<string, any>;
    expect('notes' in passedData).toBe(false);
  });

  test('AC-4.1: users without update permission are rejected (401) and nothing is persisted', async () => {
    canUpdateWebsiteMock.mockResolvedValue(false);

    const response = await callPost(buildRequest({ notes: 'not allowed' }));

    expect(response.status).toBe(401);
    expect(updateWebsiteMock).not.toHaveBeenCalled();
  });
});
