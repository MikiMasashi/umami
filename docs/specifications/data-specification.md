# Data Specification

## US-201 Website notes

### Domain model

`Website` gains an optional note:

| Field | Type | Invariant |
| --- | --- | --- |
| `notes` | `string \| null` | `null` means unset. Non-null values are plain text and must be 1-500 characters. |

Whitespace-only input is normalized to `null` by the application layer before persistence. Notes are treated as plain text and must be rendered through React text nodes or equivalent escaped output.

### Database schema

Add a nullable column to the existing website table and Prisma `Website` model:

```prisma
model Website {
  // existing fields
  notes String? @db.VarChar(500)
}
```

SQL migration intent:

```sql
alter table website add column notes varchar(500);
```

No index is required because US-201 explicitly excludes searching, filtering, or sorting by note.

### Backward compatibility

Existing website rows receive `notes = null`, so current websites remain valid and can be listed, viewed, edited, and deleted without data migration backfill. The API serializes unset notes as `null`; the UI suppresses list placeholders for `null` and empty normalized values.

### Data integrity

The database column length and server-side zod validation both enforce the 500-character maximum. The server validates before calling the update query so an invalid 501-character value does not overwrite an existing valid note.
