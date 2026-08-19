# Test Readiness US-201

This file records the test-first validation required before implementation.

## Commands

| Command | Result |
| --- | --- |
| `npx playwright test --list` | Passed collection. 38 E2E tests were listed across 7 files. US-201 added 4 scenarios in `tests/e2e/website-notes.spec.ts`. |
| `npm run test:unit` | Collection and execution completed. 18 Vitest files were collected; 82 tests passed and the 2 US-201 component tests failed as expected because the UI contract is not implemented yet. |

## Added libraries

None. Existing Playwright, Vitest, Testing Library, and jsdom dependencies are sufficient.

## Script adjustment

`package.json` now defines `test:unit` as `vitest run --pool=threads` because the requested command did not exist in the project. The threads pool avoids Windows fork worker startup timeouts observed during the initial `vitest run` execution and does not change Vitest include rules.

## Observed implementation-gap failures

| Test | Expected reason before implementation |
| --- | --- |
| `tests/e2e/website-notes.spec.ts` | Listed successfully by Playwright. Execution is expected to fail because the UI does not yet expose `input-notes`, the API does not yet persist or return `notes`, and the 501-character validation response is not implemented. |
| `src/component-tests/website-notes-page.test.tsx` / `US-201 edit page exposes the Notes field with the saved value and 500 character contract` | Failed with `TestingLibraryElementError: Unable to find an element by: [data-test="input-notes"]`. This is the expected implementation gap: the route page does not yet render the reviewed Notes textarea contract. |
| `src/component-tests/website-notes-page.test.tsx` / `US-201 websites list page renders note summaries only for websites with notes` | Failed with `TestingLibraryElementError: Unable to find an element by: [data-test="website-note-summary-11111111-1111-4111-8111-111111111111"]`. This is the expected implementation gap: the list page does not yet render reviewed note summaries. |
