import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { POST } from '@/app/api/websites/route';
import { parseRequest } from '@/lib/request';
import { badRequest } from '@/lib/response';
import { canCreateTeamWebsite, canCreateWebsite } from '@/permissions';
import { createShare, createWebsite } from '@/queries/prisma';
import { getAllUserWebsitesIncludingTeamAccess, getUserWebsites } from '@/queries/prisma/website';

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  canCreateWebsite: vi.fn(),
  canCreateTeamWebsite: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  createShare: vi.fn(),
  createWebsite: vi.fn(),
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

// Mirrors the notes constraint from the create route's zod schema (api-specification.md §2.1)
// so tests can exercise the same 500 character validation contract without loading the real
// parseRequest implementation (which pulls in the Prisma client).
const notesSchema = z.object({ notes: z.string().max(500).nullable().optional() }).partial();

const parseRequestMock = vi.mocked(parseRequest);
const canCreateWebsiteMock = vi.mocked(canCreateWebsite);
const canCreateTeamWebsiteMock = vi.mocked(canCreateTeamWebsite);
const createWebsiteMock = vi.mocked(createWebsite);
const createShareMock = vi.mocked(createShare);

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/websites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callPost(body: Record<string, unknown>) {
  const result = notesSchema.safeParse(body);

  parseRequestMock.mockResolvedValue({
    auth: { user: { id: 'user-1', isAdmin: false } },
    body,
    error: result.success ? undefined : () => badRequest(z.treeifyError(result.error)),
  });

  return POST(buildRequest(body));
}

beforeEach(() => {
  parseRequestMock.mockReset();
  canCreateWebsiteMock.mockReset();
  canCreateTeamWebsiteMock.mockReset();
  createWebsiteMock.mockReset();
  createShareMock.mockReset();
  vi.mocked(getAllUserWebsitesIncludingTeamAccess).mockReset();
  vi.mocked(getUserWebsites).mockReset();

  canCreateWebsiteMock.mockResolvedValue(true);
  canCreateTeamWebsiteMock.mockResolvedValue(true);
  createWebsiteMock.mockImplementation(data => Promise.resolve({ ...data }) as any);
});

test('creates a website with a notes value', async () => {
  const response = await callPost({ name: 'Site', domain: 'example.com', notes: 'For QA' });

  expect(response.status).toBe(200);
  expect(createWebsiteMock).toHaveBeenCalledWith(expect.objectContaining({ notes: 'For QA' }));
});

test('rejects creating a website with notes over 500 characters', async () => {
  const response = await callPost({ name: 'Site', domain: 'example.com', notes: 'a'.repeat(501) });

  expect(response.status).toBe(400);
  expect(createWebsiteMock).not.toHaveBeenCalled();
});

test('creates a website without notes (backward compatibility)', async () => {
  const response = await callPost({ name: 'Site', domain: 'example.com' });

  expect(response.status).toBe(200);
  expect(createWebsiteMock).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
});

test('normalizes an empty notes string to null on creation', async () => {
  const response = await callPost({ name: 'Site', domain: 'example.com', notes: '' });

  expect(response.status).toBe(200);
  expect(createWebsiteMock).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
});
