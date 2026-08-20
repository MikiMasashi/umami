# E2E Test Result (US-201)

- 実行日時: 2026-08-21
- 対象テスト: `tests/e2e/website-notes.spec.ts`
- 実行コマンド: `npm run test:e2e -- tests/e2e/website-notes.spec.ts`
- 実行結果サマリ: **6 passed / 0 failed / 0 skipped**

## 受入条件ごとの合否

| 受入条件 | 対応シナリオ | 判定 | 根拠 |
|---|---|---|---|
| AC-201-01 | E2E-201-01 | PASS | `AC-201-01: persists notes after save and reload` が成功 |
| AC-201-02 | E2E-201-02 | PASS | `AC-201-02: updates notes and reflects on list and settings` が成功 |
| AC-201-03 | E2E-201-03 | PASS | `AC-201-03 & AC-201-07: notes shown only when set; notes-null website remains stable` が成功 |
| AC-201-04 | E2E-201-04 | PASS | `AC-201-04: long notes are truncated in website list` が成功 |
| AC-201-05 | E2E-201-05 | PASS | `AC-201-05: rejects notes longer than 500 chars` が成功 |
| AC-201-06 | E2E-201-06 | PASS | `AC-201-06: unauthorized user cannot update notes` が成功 |
| AC-201-07 | E2E-201-03 | PASS | `AC-201-03 & AC-201-07: notes shown only when set; notes-null website remains stable` が成功 |

## 検出した欠陥

今回の実行では、受入条件に対する失敗は検出されませんでした。
