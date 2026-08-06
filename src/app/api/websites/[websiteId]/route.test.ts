import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';
import { getWebsite, updateWebsite } from '@/queries/prisma';
import { POST } from './route';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/lib/recorder', () => ({
  getRecorderConfig: vi.fn((config: any) => config ?? {}),
  getRecorderEnabled: vi.fn(() => false),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
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

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
});

test('POST saves notes for a website when the user has update permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { notes: 'Production site for the marketing team.' },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', replayConfig: null } as any);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    notes: 'Production site for the marketing team.',
  } as any);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', { method: 'POST' }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: 'Production site for the marketing team.' }),
  );
});

test('POST rejects notes updates from a user without update permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-2', isAdmin: false } },
    body: { notes: 'Attempted note change.' },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(false);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', { method: 'POST' }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );

  expect(response.status).toBe(401);
  expect(updateWebsiteMock).not.toHaveBeenCalled();
});
