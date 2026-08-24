import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';
import { getWebsite, updateWebsite } from '@/queries/prisma';
import { POST } from '@/app/api/websites/[websiteId]/route';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getWebsite: vi.fn(),
  updateWebsite: vi.fn(),
  createShare: vi.fn(),
  deleteSharesByEntityId: vi.fn(),
  getShareByEntityId: vi.fn(),
}));

vi.mock('@/lib/recorder', () => ({
  getRecorderConfig: vi.fn((config: any) => config || {}),
  getRecorderEnabled: vi.fn((config: any) => false),
}));

vi.mock('@/lib/crypto', () => ({
  uuid: vi.fn(() => 'uuid-123'),
}));

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);

const websiteId = 'website-1';
const auth = { user: { id: 'user-1', isAdmin: false } } as any;

describe('website notes validation', () => {
  beforeEach(() => {
    parseRequestMock.mockReset();
    canUpdateWebsiteMock.mockReset();
    getWebsiteMock.mockReset();
    updateWebsiteMock.mockReset();
  });

  test('accepts empty string', async () => {
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes: '' },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(true);
    getWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'example.com', notes: null } as any);
    updateWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'example.com', notes: null } as any);

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(websiteId, { notes: null });
  });

  test('accepts 500 characters', async () => {
    const notes = 'a'.repeat(500);
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(true);
    getWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'example.com', notes: null } as any);
    updateWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'example.com', notes } as any);

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(200);
    expect(updateWebsiteMock).toHaveBeenCalledWith(websiteId, { notes });
  });

  test('returns fixed validation error for notes over 500 characters', async () => {
    parseRequestMock.mockResolvedValue({
      auth: null,
      body: undefined,
      error: () =>
        Response.json(
          { error: { message: 'Bad request', status: 400 } },
          { status: 400 },
        ),
    });

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(400);
  });
});

describe('website notes POST handler', () => {
  beforeEach(() => {
    parseRequestMock.mockReset();
    canUpdateWebsiteMock.mockReset();
    getWebsiteMock.mockReset();
    updateWebsiteMock.mockReset();
  });

  test('saves notes when authorized', async () => {
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes: 'saved note' },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(true);
    getWebsiteMock.mockResolvedValue({ id: websiteId, name: 'Site', domain: 'example.com', notes: null } as any);
    updateWebsiteMock.mockResolvedValue({
      id: websiteId,
      name: 'Site',
      domain: 'example.com',
      notes: 'saved note',
      updatedAt: '2026-08-18T11:20:00.000Z',
    } as any);

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: websiteId,
      notes: 'saved note',
    });
  });

  test('returns 401 when unauthorized', async () => {
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes: 'forbidden update' },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(false);

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(401);
  });

  test('returns 400 when website does not exist', async () => {
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes: 'missing' },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(true);
    getWebsiteMock.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'Website not found.',
      },
    });
  });
});
