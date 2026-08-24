import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite, canViewSharedWebsite } from '@/permissions';
import { getWebsite, updateWebsite } from '@/queries/prisma';
import { GET, POST } from '@/app/api/websites/[websiteId]/route';

// Unit tests for US-201: notes handling in the website detail/update API route.
// These cover branches (undefined vs. empty-string notes, canUpdate computation)
// that are exercised indirectly by the reviewed E2E/component tests, but are
// verified here in isolation against the route handler contract described in
// docs/specifications/api-specification.md.

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
  canViewSharedWebsite: vi.fn(),
  canDeleteWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getWebsite: vi.fn(),
  updateWebsite: vi.fn(),
  createShare: vi.fn(),
  deleteSharesByEntityId: vi.fn(),
  getShareByEntityId: vi.fn(),
  deleteWebsite: vi.fn(),
}));

vi.mock('@/lib/recorder', () => ({
  getRecorderConfig: (config: any) => config ?? {},
  getRecorderEnabled: () => false,
}));

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const canViewSharedWebsiteMock = vi.mocked(canViewSharedWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  canViewSharedWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
});

test('GET includes canUpdate computed from canUpdateWebsite', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    error: undefined,
  } as any);
  canViewSharedWebsiteMock.mockResolvedValue(true);
  canUpdateWebsiteMock.mockResolvedValue(false);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', notes: null } as any);

  const response = await GET(new Request('http://localhost/api/websites/website-1'), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const body = await response.json();

  expect(body).toHaveProperty('canUpdate', false);
  expect(body).toHaveProperty('notes', null);
});

test('POST normalizes an empty-string notes value to null', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: true } },
    body: { notes: '' },
    error: undefined,
  } as any);
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', replayConfig: null } as any);
  updateWebsiteMock.mockResolvedValue({ id: 'website-1', notes: null } as any);

  await POST(
    new Request('http://localhost/api/websites/website-1', {
      method: 'POST',
      body: JSON.stringify({ notes: '' }),
    }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: null }),
  );
});

test('POST leaves notes untouched when the field is omitted from the request', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: true } },
    body: { name: 'Renamed site' },
    error: undefined,
  } as any);
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', replayConfig: null } as any);
  updateWebsiteMock.mockResolvedValue({ id: 'website-1', notes: 'Existing notes.' } as any);

  await POST(
    new Request('http://localhost/api/websites/website-1', {
      method: 'POST',
      body: JSON.stringify({ name: 'Renamed site' }),
    }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );

  const updateArgs = updateWebsiteMock.mock.calls[0][1] as Record<string, any>;

  expect(updateArgs).not.toHaveProperty('notes');
});

test('POST rejects an update from a user without update permission before touching notes', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { notes: 'Tampered notes.' },
    error: undefined,
  } as any);
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', {
      method: 'POST',
      body: JSON.stringify({ notes: 'Tampered notes.' }),
    }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body).toHaveProperty('error.code', 'unauthorized');
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
