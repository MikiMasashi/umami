import { beforeEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/websites/[websiteId]/route';
import { parseRequest } from '@/lib/request';
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

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);

const website = {
  id: 'website-1',
  name: 'Example',
  domain: 'example.com',
  notes: null,
  replayConfig: null,
};

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();

  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue(website as any);
  updateWebsiteMock.mockResolvedValue(website as any);
  getShareByEntityIdMock.mockResolvedValue(null);
});

test('POST saves normalized website notes', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      name: 'Example',
      domain: 'example.com',
      notes: '  Production website  ',
    },
    error: undefined,
  });

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({
      name: 'Example',
      domain: 'example.com',
      notes: 'Production website',
    }),
  );
});

test('POST clears whitespace-only website notes to null', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      notes: '   ',
    },
    error: undefined,
  });

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({
      notes: null,
    }),
  );
});

test('POST leaves existing notes unchanged when notes is omitted', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      name: 'Renamed',
    },
    error: undefined,
  });

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.not.objectContaining({
      notes: expect.anything(),
    }),
  );
});

test('POST rejects notes updates without website update permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      notes: 'Unauthorized change',
    },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', { method: 'POST' }),
    {
      params: Promise.resolve({ websiteId: 'website-1' }),
    },
  );

  expect(response.status).toBe(401);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
