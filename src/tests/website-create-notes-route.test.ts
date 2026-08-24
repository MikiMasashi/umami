import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canCreateTeamWebsite, canCreateWebsite } from '@/permissions';
import { createWebsite } from '@/queries/prisma';
import { POST } from '@/app/api/websites/route';

// Unit test for US-201: notes handling in the website creation API route.
// createWebsite (POST /api/websites) accepts an optional notes field so that
// tests/e2e helpers.ts's createWebsite() can seed notes at creation time; this
// verifies the normalization branch (empty string / omitted -> null) that the
// reviewed E2E/component tests do not exercise directly.

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
  getQueryFilters: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canCreateTeamWebsite: vi.fn(),
  canCreateWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  createWebsite: vi.fn(),
  createShare: vi.fn(),
  getTeamWebsiteCount: vi.fn(),
  getWebsiteCount: vi.fn(),
}));

vi.mock('@/queries/prisma/website', () => ({
  getAllUserWebsitesIncludingTeamAccess: vi.fn(),
  getUserWebsites: vi.fn(),
}));

vi.mock('@/lib/load', () => ({
  fetchAccount: vi.fn(),
  fetchTeam: vi.fn(),
}));

const parseRequestMock = vi.mocked(parseRequest);
const canCreateWebsiteMock = vi.mocked(canCreateWebsite);
const canCreateTeamWebsiteMock = vi.mocked(canCreateTeamWebsite);
const createWebsiteMock = vi.mocked(createWebsite);

beforeEach(() => {
  parseRequestMock.mockReset();
  canCreateWebsiteMock.mockReset();
  canCreateTeamWebsiteMock.mockReset();
  createWebsiteMock.mockReset();
  canCreateWebsiteMock.mockResolvedValue(true);
});

test('POST normalizes an empty-string notes value to null on create', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: true } },
    body: { name: 'Site', domain: 'site.com', notes: '' },
    error: undefined,
  } as any);
  createWebsiteMock.mockResolvedValue({ id: 'website-1', notes: null } as any);

  await POST(
    new Request('http://localhost/api/websites', {
      method: 'POST',
      body: JSON.stringify({ name: 'Site', domain: 'site.com', notes: '' }),
    }),
  );

  expect(createWebsiteMock).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
});

test('POST defaults notes to null when omitted on create', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: true } },
    body: { name: 'Site', domain: 'site.com' },
    error: undefined,
  } as any);
  createWebsiteMock.mockResolvedValue({ id: 'website-1', notes: null } as any);

  await POST(
    new Request('http://localhost/api/websites', {
      method: 'POST',
      body: JSON.stringify({ name: 'Site', domain: 'site.com' }),
    }),
  );

  expect(createWebsiteMock).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
});

test('POST preserves a provided notes value on create', async () => {
  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: true } },
    body: { name: 'Site', domain: 'site.com', notes: 'Seeded note.' },
    error: undefined,
  } as any);
  createWebsiteMock.mockResolvedValue({ id: 'website-1', notes: 'Seeded note.' } as any);

  await POST(
    new Request('http://localhost/api/websites', {
      method: 'POST',
      body: JSON.stringify({ name: 'Site', domain: 'site.com', notes: 'Seeded note.' }),
    }),
  );

  expect(createWebsiteMock).toHaveBeenCalledWith(
    expect.objectContaining({ notes: 'Seeded note.' }),
  );
});
