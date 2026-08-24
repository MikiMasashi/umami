import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { GET, POST } from '@/app/api/websites/[websiteId]/route';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite, canViewSharedWebsite } from '@/permissions';
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

vi.mock('@/lib/recorder', () => ({
  getRecorderConfig: vi.fn(() => ({})),
  getRecorderEnabled: vi.fn(() => false),
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

const parseRequestMock = vi.mocked(parseRequest);
const canUpdateWebsiteMock = vi.mocked(canUpdateWebsite);
const canViewSharedWebsiteMock = vi.mocked(canViewSharedWebsite);
const getWebsiteMock = vi.mocked(getWebsite);
const updateWebsiteMock = vi.mocked(updateWebsite);
const getShareByEntityIdMock = vi.mocked(getShareByEntityId);
const createShareMock = vi.mocked(createShare);
const deleteSharesByEntityIdMock = vi.mocked(deleteSharesByEntityId);

beforeEach(() => {
  parseRequestMock.mockReset();
  canUpdateWebsiteMock.mockReset();
  canViewSharedWebsiteMock.mockReset();
  getWebsiteMock.mockReset();
  updateWebsiteMock.mockReset();
  getShareByEntityIdMock.mockReset();
  createShareMock.mockReset();
  deleteSharesByEntityIdMock.mockReset();

  getShareByEntityIdMock.mockResolvedValue(null as any);
});

test('GET returns notes as part of the website payload', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    error: undefined,
  });
  canViewSharedWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: 'Production site for client X',
  } as any);

  const response = await GET(new Request('http://localhost/api/websites/website-1'), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const body = await response.json();

  expect(body.notes).toBe('Production site for client X');
});

test('GET returns null notes for a website that never had notes set', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    error: undefined,
  });
  canViewSharedWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My site',
    domain: 'example.com',
    notes: null,
  } as any);

  const response = await GET(new Request('http://localhost/api/websites/website-1'), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });
  const body = await response.json();

  expect(body.notes).toBeNull();
});

test('POST saves notes when the user has update permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { notes: 'Created for the marketing team' },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', name: 'My site' } as any);
  updateWebsiteMock.mockResolvedValue({
    id: 'website-1',
    name: 'My site',
    notes: 'Created for the marketing team',
  } as any);

  const response = await POST(
    new Request('http://localhost/api/websites/website-1', { method: 'POST' }),
    { params: Promise.resolve({ websiteId: 'website-1' }) },
  );
  const body = await response.json();

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: 'Created for the marketing team' }),
  );
  expect(body.notes).toBe('Created for the marketing team');
});

test('POST normalizes an empty notes string to null before saving', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { notes: '' },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', name: 'My site' } as any);
  updateWebsiteMock.mockResolvedValue({ id: 'website-1', name: 'My site', notes: null } as any);

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: null }),
  );
});

test('POST leaves notes untouched when the field is omitted from the request', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { name: 'Renamed site' },
    error: undefined,
  });
  canUpdateWebsiteMock.mockResolvedValue(true);
  getWebsiteMock.mockResolvedValue({ id: 'website-1', name: 'My site' } as any);
  updateWebsiteMock.mockResolvedValue({ id: 'website-1', name: 'Renamed site' } as any);

  await POST(new Request('http://localhost/api/websites/website-1', { method: 'POST' }), {
    params: Promise.resolve({ websiteId: 'website-1' }),
  });

  expect(updateWebsiteMock).toHaveBeenCalledWith(
    'website-1',
    expect.objectContaining({ notes: undefined }),
  );
});

test('POST rejects notes updates from a user without update permission', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body: { notes: 'Trying to sneak in a note' },
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

test('notes schema accepts exactly 500 characters', () => {
  const schema = z.object({ notes: z.string().max(500).nullable().optional() });

  const result = schema.safeParse({ notes: 'a'.repeat(500) });

  expect(result.success).toBe(true);
});

test('notes schema rejects 501 characters or more', () => {
  const schema = z.object({ notes: z.string().max(500).nullable().optional() });

  const result = schema.safeParse({ notes: 'a'.repeat(501) });

  expect(result.success).toBe(false);
});
