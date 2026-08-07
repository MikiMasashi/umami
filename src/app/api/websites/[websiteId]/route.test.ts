import { beforeEach, expect, test, vi } from 'vitest';
import { checkAuth } from '@/lib/auth';
import { canDeleteWebsite, canUpdateWebsite, canViewSharedWebsite } from '@/permissions';
import { getShareByEntityId, getWebsite, updateWebsite } from '@/queries/prisma';
import { GET, POST } from './route';

vi.mock('@/lib/auth', () => ({
  checkAuth: vi.fn(),
}));

vi.mock('@/lib/load', () => ({
  fetchAccount: vi.fn(),
  fetchWebsite: vi.fn(),
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
}));

const checkAuthMock = vi.mocked(checkAuth);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const canViewSharedWebsiteMock = vi.mocked(canViewSharedWebsite);
const canDeleteWebsiteMock = vi.mocked(canDeleteWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);

const AUTH = { user: { id: 'user-1', isAdmin: false } };

function postRequest(body: Record<string, any>) {
  return new Request('http://localhost/api/websites/website-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  checkAuthMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  canViewSharedWebsiteMock.mockReset();
  canDeleteWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();

  checkAuthMock.mockResolvedValue(AUTH as any);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My Website',
    domain: 'example.com',
    notes: null,
    replayConfig: null,
  } as any);
  getShareByEntityIdMock.mockResolvedValue(null);
});

test('GET includes notes in the response for an authorized viewer (FR-10, AC-10)', async () => {
  canViewSharedWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My Website',
    domain: 'example.com',
    notes: 'Production site for Client A.',
  } as any);

  const response = await GET(new Request('http://localhost/api/websites/website-1'), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.notes).toBe('Production site for Client A.');
});

test('POST saves notes within the 500 character limit (AC-1, AC-2)', async () => {
  canUpdateWebsiteMock.mockResolvedValue(true);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My Website',
    domain: 'example.com',
    notes: 'A'.repeat(500),
  } as any);

  const response = await POST(postRequest({ name: 'My Website', notes: 'A'.repeat(500) }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.notes).toBe('A'.repeat(500));
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: 'A'.repeat(500) }),
  );
});

test('POST rejects notes longer than 500 characters with a 400 error (FR-4, AC-3)', async () => {
  canUpdateWebsiteMock.mockResolvedValue(true);

  const response = await POST(postRequest({ name: 'My Website', notes: 'A'.repeat(501) }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(response.status).toBe(400);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});

test('POST allows saving an empty notes string (FR-3, AC-4)', async () => {
  canUpdateWebsiteMock.mockResolvedValue(true);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My Website',
    domain: 'example.com',
    notes: '',
  } as any);

  const response = await POST(postRequest({ name: 'My Website', notes: '' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.notes).toBe('');
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: '' }),
  );
});

test('POST omitting notes leaves the existing value unchanged (NFR-3, AC-8)', async () => {
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My Website',
    domain: 'example.com',
    notes: 'Existing note',
    replayConfig: null,
  } as any);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'Renamed Website',
    domain: 'example.com',
    notes: 'Existing note',
  } as any);

  const response = await POST(postRequest({ name: 'Renamed Website' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ name: 'Renamed Website', notes: undefined }),
  );
});

test('POST rejects a notes update from a user without update permission (FR-9, AC-9)', async () => {
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await POST(postRequest({ notes: 'Attempted note change' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(response.status).toBe(401);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
