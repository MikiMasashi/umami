export const users = {
  userCreate: {
    username: 'playwright1',
    password: 'password',
    role: 'user',
  },
  userUpdate: {
    username: 'playwright1',
    role: 'view-only',
  },
};

export const teams = {
  teamCreate: {
    name: 'playwright',
  },
  teamUpdate: {
    name: 'playwrightUpdate',
  },
};

export const websites = {
  websiteCreate: {
    name: 'Playwright Website',
    domain: 'playwright.com',
  },
  websiteUpdate: {
    name: 'Playwright Website Updated',
    domain: 'playwrightupdated.com',
  },
};

// US-201: notes フィールドに関するテストデータ
export const notesFixtures = {
  // 上限ちょうど（500文字）: 保存が成功するケース
  validNotes: 'A'.repeat(500),
  // 上限超過（501文字）: サーバー・クライアント双方で拒否されるケース
  tooLongNotes: 'A'.repeat(501),
  // 一覧の省略表示を確認するための長文（80文字の省略しきい値を超える）
  longNotes: 'This is a long note used for truncation testing. '.repeat(3),
  // 通常の短い文字列
  shortNotes: 'Production site for marketing team.',
  updatedNotes: 'Updated note content for regression testing.',
};
