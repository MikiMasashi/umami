import { beforeEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/websites/[websiteId]/route';
import { getRecorderConfig, getRecorderEnabled } from '@/lib/recorder';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';
import {
  createShare,
  deleteSharesByEntityId,
  getShareByEntityId,
  getWebsite,
  updateWebsite,
} from '@/queries/prisma';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canDeleteWebsite: vi.fn(),
  canUpdateWebsite: vi.fn(),
  canViewSharedWebsite: vi.fn(),
}));

vi.mock('@/lib/recorder', () => ({
  getRecorderConfig: vi.fn(),
  getRecorderEnabled: vi.fn(),
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
const getRecorderConfigMock = vi.mocked(getRecorderConfig);
const getRecorderEnabledMock = vi.mocked(getRecorderEnabled);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);
const createShareMock = vi.mocked(createShare);
const deleteSharesByEntityIdMock = vi.mocked(deleteSharesByEntityId);

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  getRecorderConfigMock.mockReset();
  getRecorderEnabledMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();
  createShareMock.mockReset();
  deleteSharesByEntityIdMock.mockReset();

  getRecorderConfigMock.mockImplementation(config => (config as Record<string, any>) ?? {});
  getRecorderEnabledMock.mockReturnValue(false);
  getShareByEntityIdMock.mockResolvedValue(null as any);
});

test('POST normalizes blank notes to null', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      name: 'Example',
      domain: 'example.com',
      notes: '   ',
    },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'Example',
    replayConfig: {},
  } as any);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'Example',
  } as any);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', { method: 'POST' }),
    {
      params: Promise.resolve({ websiteId: 'website-1' }),
    },
  );

  expect(response.status).toBe(200);
  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({
      notes: null,
    }),
  );
});

test('POST persists notes text when provided', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      notes: 'Production website',
    },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'Example',
    replayConfig: {},
  } as any);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'Example',
  } as any);

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({
      notes: 'Production website',
    }),
  );
});

test('POST rejects updates when user lacks permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    body: {
      notes: 'Do not save',
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
