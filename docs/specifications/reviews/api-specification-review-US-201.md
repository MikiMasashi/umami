# API Specification Review US-201

## Result

Approved for test-first implementation.

## Review findings

| Area | Finding | Decision |
| --- | --- | --- |
| API boundary | Reusing `POST /api/websites/{websiteId}` keeps notes inside the existing Website settings API. | Accept. A separate notes endpoint was rejected as unnecessary and likely to duplicate authorization. |
| Validation | Server-side 500-character validation is required even when the textarea has `maxlength`. | Accept. Client-only validation would not cover direct API requests. |
| Error shape | The response uses the existing `error` envelope and a specific `validation-error` code for field-level failure. | Accept. Tests assert this exact response to avoid ambiguous failures. |
| Authorization | Existing website update permission is reused. | Accept. A note-specific permission model is out of scope. |

## Concerns and mitigations

The current API may strip unknown request fields unless `notes` is added to the route schema. The tests explicitly assert `body.notes` on update responses so this cannot pass accidentally.
