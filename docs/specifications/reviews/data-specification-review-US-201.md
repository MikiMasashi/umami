# Data Specification Review US-201

## Result

Approved for test-first implementation.

## Review findings

| Area | Finding | Decision |
| --- | --- | --- |
| Field type | `varchar(500)` plus nullable Prisma `String?` models the exact requirement. | Accept. `text` was rejected because the database would not enforce the maximum. |
| Null semantics | `null` represents unset notes. | Accept. Empty strings were rejected because list suppression and existing-data compatibility are simpler with one unset state. |
| Indexing | No index is needed. | Accept. Search, filter, and sort by notes are out of scope. |
| Backward compatibility | Existing rows remain valid with `notes = null`. | Accept. No backfill is required. |

## Concerns and mitigations

Whitespace normalization belongs in the application layer, not the database. Component and E2E tests assert blank saves become unset so implementation cannot leave whitespace-only notes visible.
