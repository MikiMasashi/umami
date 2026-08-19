# Architecture Specification

## US-201 Website notes

### Architecture decision

Website notes are implemented as a new nullable field on the existing Website aggregate and flow through the existing Settings > Websites page, website update API, Prisma query layer, and website list query layer. This keeps notes inside the current website settings boundary and reuses existing authentication, authorization, caching, and modified-key invalidation.

### Component and data flow

1. The website edit page loads a website through the existing website query and renders a `Notes` textarea as part of the website settings form.
2. Submitting the form sends `notes` to `POST /api/websites/{websiteId}` with the existing name/domain update payload.
3. The route handler validates length, normalizes blank input to `null`, checks the existing website update permission, and persists the field.
4. Successful updates return the website including `notes`, then touch the existing `websites` and `website:{websiteId}` modified keys.
5. The Settings > Websites list receives `notes` in the existing website row data and renders a summary only when the value is non-empty.

### UI contract

The edit form uses a plain textarea labelled `Notes`. The list summary is plain text and may be visually truncated for readability; full persistence and API values are not truncated.

### Testability contract

This section is the external contract for reviewed E2E and component tests. It intentionally fixes only observable URL, DOM, and HTTP behavior. It does not constrain child component decomposition or props signatures.

#### Routing

| Route | Page module | Purpose |
| --- | --- | --- |
| `/settings/websites` | `src/app/(main)/settings/websites/page.tsx` | Settings website list showing note summaries. |
| `/settings/websites/{websiteId}` | `src/app/(main)/settings/websites/[websiteId]/page.tsx` | Settings website edit entry point for route-level component tests. |
| `/websites/{websiteId}/settings` | `src/app/(main)/websites/[websiteId]/settings/page.tsx` | In-app edit route reached from the website settings list edit action. |

#### `data-test` naming convention

Use kebab-case and prefix by role:

| Prefix | Usage |
| --- | --- |
| `input-*` | Form input wrapper. |
| `button-*` | Clickable action button. |
| `website-note-*` | Website note display surface. |

US-201 selectors:

| Selector | Element |
| --- | --- |
| `input-notes` | Notes textarea form field wrapper. The contained control is a `textarea`. |
| `button-submit` | Existing website settings save button. |
| `website-note-summary-{websiteId}` | Website list note summary for a specific website. Omitted entirely when notes are unset. |

#### Form field identifiers

| Field | HTML name | Label | Control |
| --- | --- | --- | --- |
| Website note | `notes` | `Notes` | `textarea` with `maxlength="500"` |

#### UI messages

| Situation | Message |
| --- | --- |
| Notes exceed 500 characters | `Notes must be 500 characters or fewer.` |
| Successful save | Existing saved toast message (`Saved`) |
| Unset notes on list | No note text and no placeholder are rendered. |

#### HTTP contract

| Request | Success | Error |
| --- | --- | --- |
| `POST /api/websites/{websiteId}` with `notes` length <= 500 | `200`, updated website with `notes` string or `null` | N/A |
| `POST /api/websites/{websiteId}` with `notes` length >= 501 | N/A | `400`, `{ "error": { "message": "Notes must be 500 characters or fewer.", "code": "validation-error", "status": 400, "field": "notes" } }` |
| `POST /api/websites/{websiteId}` without update permission | N/A | `401`, `{ "error": { "message": "Unauthorized", "code": "unauthorized", "status": 401 } }` |

#### Component test entry points

| Test target | Page module |
| --- | --- |
| Website edit page | `src/app/(main)/settings/websites/[websiteId]/page.tsx` |
| Website list page | `src/app/(main)/settings/websites/page.tsx` |
