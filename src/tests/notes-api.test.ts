import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';
import { getWebsite, updateWebsite } from '@/queries/prisma';
import { normalizeWebsiteNotes, POST } from '@/app/api/websites/[websiteId]/notes/route';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getWebsite: vi.fn(),
  updateWebsite: vi.fn(),
}));

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);

const websiteId = 'website-1';
const auth = { user: { id: 'user-1', isAdmin: false } } as any;

describe('website notes helpers', () => {
  test('normalizes empty string to null', () => {
    expect(normalizeWebsiteNotes('')).toBeNull();
  });

  test('keeps multiline note text unchanged', () => {
    const notes = `line1\nline2`;
    expect(normalizeWebsiteNotes(notes)).toBe(notes);
  });
});

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

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
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

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
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

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'メモは500文字以内です',
        code: 'VALIDATION_ERROR',
        status: 400,
      },
    });
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

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
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

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'メモを編集する権限がありません',
        code: 'FORBIDDEN_WEBSITE_UPDATE',
        status: 401,
      },
    });
  });

  test('returns 404 when website does not exist', async () => {
    parseRequestMock.mockResolvedValue({
      auth,
      body: { notes: 'missing' },
      error: undefined,
    });
    canUpdateWebsiteMock.mockResolvedValue(true);
    getWebsiteMock.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/websites/website-1/notes', { method: 'POST' }), {
      params: Promise.resolve({ websiteId }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: '対象のウェブサイトが見つかりません',
        code: 'WEBSITE_NOT_FOUND',
        status: 404,
      },
    });
  });
});
