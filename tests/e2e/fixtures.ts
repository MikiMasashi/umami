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

export const notes = {
  // US-201 FR-2: 通常のメモ入力
  short: 'Production site for the marketing team.',
  // US-201 FR-3: 境界値（500文字ちょうど = 許容される最大長）
  atLimit: 'A'.repeat(500),
  // US-201 FR-3: 境界値超過（501文字 = 拒否されるべき最小長）
  overLimit: 'A'.repeat(501),
  // US-201 FR-4: 一覧の省略表示閾値（60文字）を超える長さのメモ
  longForTruncation: 'B'.repeat(120),
};
