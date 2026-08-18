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
  websiteWithNote: {
    name: 'Website with Note',
    domain: 'note.playwright.com',
    note: 'Production environment. Managed by Alice.',
  },
};

export const notes = {
  shortNote: 'Short memo',
  longNote: 'A'.repeat(150), // 150 文字
  maxLengthNote: 'B'.repeat(500), // 500 文字（上限）
  invalidNote: 'C'.repeat(501), // 501 文字（超過）
  noteWithLineBreaks: 'Line 1\nLine 2\nLine 3',
  noteWithSpecialChars: 'Prod/Staging - Purpose: API Tests & QA',
};
