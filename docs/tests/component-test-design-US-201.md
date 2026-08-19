# Component Test Design US-201

## Scope

Component tests are route-entry tests only. They import Next.js page modules and assert observable DOM through labels, `data-test`, attributes, and text. They do not assert child component props or component decomposition.

## Scenarios

| ID | Page module | Scenario | Assertions |
| --- | --- | --- | --- |
| CT-US-201-01 | `src/app/(main)/settings/websites/[websiteId]/page.tsx` | Website edit page exposes the Notes field contract. | `input-notes` exists, label is `Notes`, control name is `notes`, saved value is rendered, `maxlength` is `500`, no validation error is shown initially. |
| CT-US-201-02 | `src/app/(main)/settings/websites/page.tsx` | Website list page renders note summaries only for websites with notes. | `website-note-summary-{websiteId}` contains the note; unset website has no summary; no `No notes` placeholder appears. |

## Acceptance traceability

| Acceptance condition | Component scenarios |
| --- | --- |
| US-201-1 AC1 | CT-US-201-01 |
| US-201-1 AC2 | CT-US-201-01 |
| US-201-1 AC3 | CT-US-201-01 |
| US-201-1 AC4 | CT-US-201-02 |
| US-201-2 AC1 | CT-US-201-02 |
| US-201-2 AC2 | CT-US-201-02 |
| US-201-2 AC3 | CT-US-201-02 |
| US-201-3 AC1 | CT-US-201-01 |
| US-201-3 AC2 | CT-US-201-01 |
| US-201-3 AC3 | Not a component concern; covered by E2E/API scenario. |
| US-201-4 AC1 | Not a component concern; covered by E2E/API scenario. |
| US-201-4 AC2 | Not a component concern; covered by E2E/API scenario. |
| US-201-4 AC3 | CT-US-201-01 |

## Review notes

The tests mock data hooks rather than child components. This keeps the route entry point under test while avoiding live network dependency and preserving implementation freedom for internal component splits.
