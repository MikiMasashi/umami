# API Specification

## US-201 Website notes

### Rationale

Website notes are part of website settings, so they reuse the existing website API and update authorization. This keeps the feature compatible with current Settings > Websites flows and avoids a note-specific permission model.

### Website resource shape

`Website` responses returned by `GET /api/websites/{websiteId}`, `POST /api/websites/{websiteId}`, and website list APIs include:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `notes` | `string \| null` | yes | Plain text note. `null` means unset. Maximum 500 characters when non-null. |

Existing fields such as `id`, `name`, `domain`, `createdAt`, `updatedAt`, `teamId`, `shareId`, `recorderEnabled`, and `replayConfig` keep their current behavior.

### Update website

`POST /api/websites/{websiteId}` accepts the existing website update body plus an optional `notes` field.

```json
{
  "name": "Marketing site",
  "domain": "example.com",
  "notes": "Production storefront. Owner: Growth team."
}
```

Processing rules:

1. If `notes` is omitted, the existing note is unchanged.
2. If `notes.trim()` is an empty string, persist `notes` as `null`.
3. If `notes` contains non-whitespace text and has length from 1 to 500 characters, persist the original text as a plain string.
4. If `notes` has 501 or more characters, reject the request before persistence.
5. Authorization uses the existing `canUpdateWebsite(auth, websiteId)` rule.

Success response: HTTP `200` with the updated website resource, including `notes`.

### Error responses

All errors use the existing `error` envelope.

| Case | HTTP status | Response body |
| --- | --- | --- |
| Note exceeds 500 characters | `400` | `{ "error": { "message": "Notes must be 500 characters or fewer.", "code": "validation-error", "status": 400, "field": "notes" } }` |
| Authenticated principal cannot update the website | `401` | `{ "error": { "message": "Unauthorized", "code": "unauthorized", "status": 401 } }` |
| Website does not exist | `400` | `{ "error": { "message": "Website not found.", "code": "bad-request", "status": 400 } }` |

### List websites

Website list endpoints that power Settings > Websites include `notes` in each row object:

- `GET /api/me/websites`
- `GET /api/users/{userId}/websites`
- `GET /api/teams/{teamId}/websites`
- `GET /api/admin/websites`

The API returns the full note value. UI truncation is a presentation concern.
