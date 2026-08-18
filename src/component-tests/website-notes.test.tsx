import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/render';
import { WebsitesPage } from '@/app/(main)/websites/WebsitesPage';
import { SettingsPage } from '@/app/(main)/websites/[websiteId]/settings/SettingsPage';

const successMessage = 'メモが保存されました';
const deletedMessage = 'メモが削除されました';
const validationMessage = 'メモは500文字以内です';
const unauthorizedMessage = 'メモを編集する権限がありません';
const websiteId = 'website-us-201';
const exact500 = 'a'.repeat(500);
const over500 = 'a'.repeat(501);
const longNote = '1234567890'.repeat(6);

const mockPush = vi.fn();
const mockUseWebsite = vi.fn();
const mockUseWebsiteQuery = vi.fn();
const mockUseLoginQuery = vi.fn();
const mockUseTeamMembersQuery = vi.fn();
const mockUseUserWebsitesQuery = vi.fn();
const mockUseUpdateQuery = vi.fn();

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/components/hooks')>('@/components/hooks');

  return {
    ...actual,
    useWebsite: () => mockUseWebsite(),
    useWebsiteQuery: (...args: unknown[]) => mockUseWebsiteQuery(...args),
    useLoginQuery: () => mockUseLoginQuery(),
    useTeamMembersQuery: (...args: unknown[]) => mockUseTeamMembersQuery(...args),
    useUserWebsitesQuery: (...args: unknown[]) => mockUseUserWebsitesQuery(...args),
    useUpdateQuery: (...args: unknown[]) => mockUseUpdateQuery(...args),
    useMessages: () => ({
      t: (value: string) => value,
      labels: {
        websites: 'Websites',
        website: 'Website',
        save: 'Save',
        name: 'Name',
        domain: 'Domain',
        created: 'Created',
      },
      messages: {
        saved: successMessage,
      },
      getMessage: (value: string) => value,
      getErrorMessage: (error?: { message?: string } | string) =>
        typeof error === 'string' ? error : error?.message,
    }),
    useNavigation: () => ({
      teamId: undefined,
      websiteId,
      renderUrl: (path: string) => path,
      updateParams: () => '/websites',
      query: {},
      router: { push: mockPush },
      pathname: '/websites/' + websiteId + '/settings',
      searchParams: new URLSearchParams(),
    }),
    useMobile: () => ({ isMobile: false }),
    useConfig: () => ({}),
  };
});

describe('website notes component tests', () => {
  const mutateAsync = vi.fn();
  const toast = vi.fn();
  const touch = vi.fn();

  function setupSettings({ notes = '', role = 'user', error }: { notes?: string; role?: string; error?: { message: string } | undefined } = {}) {
    mockUseWebsite.mockReturnValue({ id: websiteId, name: 'Website under test', domain: 'example.com', notes });
    mockUseWebsiteQuery.mockReturnValue({
      data: { id: websiteId, name: 'Website under test', domain: 'example.com', notes },
      isFetching: false,
      isLoading: false,
    });
    mockUseLoginQuery.mockReturnValue({ user: { id: 'user-1', role } });
    mockUseUpdateQuery.mockReturnValue({ mutateAsync, error, toast, touch });

    return render(<SettingsPage websiteId={websiteId} />);
  }

  function setupWebsitesPage(data: Array<{ id: string; name: string; domain: string; createdAt: string; notes?: string }>) {
    mockUseLoginQuery.mockReturnValue({ user: { id: 'user-1', role: 'user' } });
    mockUseTeamMembersQuery.mockReturnValue({ data: { data: [] } });
    mockUseUserWebsitesQuery.mockReturnValue({
      data: { data, count: data.length, page: 1, pageSize: 20, isCapped: false },
      isLoading: false,
      isFetching: false,
      error: null,
    });

    return render(<WebsitesPage />, { route: '/websites' });
  }

  test('notes 入力欄が表示される', async () => {
    setupSettings();
    expect(await screen.findByTestId('notes-input')).toBeInTheDocument();
  });

  test('notes 未設定時は空で表示', async () => {
    setupSettings({ notes: '' });
    expect(await screen.findByTestId('notes-input')).toHaveValue('');
  });

  test('notes 既存値が表示される', async () => {
    setupSettings({ notes: 'existing note' });
    expect(await screen.findByTestId('notes-input')).toHaveValue('existing note');
  });

  test('テキスト入力で値が更新される', async () => {
    const { user } = setupSettings();
    const input = await screen.findByTestId('notes-input');
    await user.type(input, 'abc');
    expect(input).toHaveValue('abc');
  });

  test('テキストクリアで空になる', async () => {
    const { user } = setupSettings({ notes: 'clear me' });
    const input = await screen.findByTestId('notes-input');
    await user.clear(input);
    expect(input).toHaveValue('');
  });

  test('500文字で保存可能', async () => {
    const { user } = setupSettings();
    const input = await screen.findByTestId('notes-input');
    await user.type(input, exact500);
    await user.click(screen.getByTestId('notes-save-button'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  test('501文字でエラーメッセージ表示（メモは500文字以内です）', async () => {
    const { user } = setupSettings();
    const input = await screen.findByTestId('notes-input');
    await user.type(input, over500);
    await user.click(screen.getByTestId('notes-save-button'));
    expect(await screen.findByText(validationMessage)).toBeInTheDocument();
  });

  test('エラー時に notes-error-message が表示', async () => {
    const { user } = setupSettings();
    const input = await screen.findByTestId('notes-input');
    await user.type(input, over500);
    await user.click(screen.getByTestId('notes-save-button'));
    expect(await screen.findByTestId('notes-error-message')).toBeInTheDocument();
  });

  test('権限なし時に textarea が read-only/disabled', async () => {
    setupSettings({ role: 'view-only' });
    const input = await screen.findByTestId('notes-input');
    expect(input).toBeDisabled();
  });

  test('権限なし時に save ボタンが disabled/非表示', async () => {
    setupSettings({ role: 'view-only' });
    const saveButton = await screen.findByTestId('notes-save-button');
    expect(saveButton).toBeDisabled();
  });

  test('API 400 エラー時に validation message 表示', async () => {
    mutateAsync.mockRejectedValueOnce(new Error(validationMessage));
    const { user } = setupSettings({ error: { message: validationMessage } });
    await user.click(await screen.findByTestId('notes-save-button'));
    expect(await screen.findByText(validationMessage)).toBeInTheDocument();
  });

  test('API 401 エラー時に メモを編集する権限がありません 表示', async () => {
    mutateAsync.mockRejectedValueOnce(new Error(unauthorizedMessage));
    const { user } = setupSettings({ error: { message: unauthorizedMessage } });
    await user.click(await screen.findByTestId('notes-save-button'));
    expect(await screen.findByText(unauthorizedMessage)).toBeInTheDocument();
  });

  test('保存成功時に メモが保存されました 表示', async () => {
    mutateAsync.mockResolvedValueOnce({ notes: 'saved' });
    const { user } = setupSettings();
    await user.click(await screen.findByTestId('notes-save-button'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(successMessage));
    expect(await screen.findByTestId('notes-success-message')).toHaveTextContent(successMessage);
  });

  test('クリア保存時に メモが削除されました 表示', async () => {
    mutateAsync.mockResolvedValueOnce({ notes: '' });
    const { user } = setupSettings({ notes: 'remove me' });
    const input = await screen.findByTestId('notes-input');
    await user.clear(input);
    await user.click(screen.getByTestId('notes-save-button'));
    expect(await screen.findByText(deletedMessage)).toBeInTheDocument();
  });

  test('既存メモの上書き保存ができる', async () => {
    mutateAsync.mockResolvedValueOnce({ notes: 'updated note' });
    const { user } = setupSettings({ notes: 'old note' });
    const input = await screen.findByTestId('notes-input');
    await user.clear(input);
    await user.type(input, 'updated note');
    await user.click(screen.getByTestId('notes-save-button'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ notes: 'updated note' }), expect.anything()));
  });

  test('notes 列が表示される', () => {
    setupWebsitesPage([{ id: 'a', name: 'A', domain: 'a.example.com', createdAt: '2024-01-01T00:00:00.000Z', notes: '' }]);
    expect(screen.getByTestId('website-notes-column')).toBeInTheDocument();
  });

  test('notes ある website は値表示', () => {
    setupWebsitesPage([{ id: 'a', name: 'A', domain: 'a.example.com', createdAt: '2024-01-01T00:00:00.000Z', notes: 'visible note' }]);
    expect(screen.getByTestId('website-notes-cell-a')).toHaveTextContent('visible note');
  });

  test('notes ない website は空表示', () => {
    setupWebsitesPage([{ id: 'a', name: 'A', domain: 'a.example.com', createdAt: '2024-01-01T00:00:00.000Z', notes: '' }]);
    expect(screen.getByTestId('website-notes-cell-a')).toBeEmptyDOMElement();
  });

  test('50文字超は省略表示（...）', () => {
    setupWebsitesPage([{ id: 'a', name: 'A', domain: 'a.example.com', createdAt: '2024-01-01T00:00:00.000Z', notes: longNote }]);
    expect(screen.getByTestId('website-notes-cell-a')).toHaveTextContent('...');
  });

  test('tooltip 採用時は全文取得可能', () => {
    setupWebsitesPage([{ id: 'a', name: 'A', domain: 'a.example.com', createdAt: '2024-01-01T00:00:00.000Z', notes: longNote }]);
    expect(screen.getByTestId('website-notes-tooltip-a')).toHaveAttribute('title', longNote);
  });
});
