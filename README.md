# Case Brief (live)


A ninety-second case brief for any Clio Manage matter, plus a filtered version a treating
medical provider can open with a protected link.

## How it works

- `server/clio.mjs`: read-only Clio v4 client (GET only). Paginates, retries on 429, times out
  after 15s. Custom fields are resolved **by name** at runtime, so no field IDs are hardcoded.
- `server/digest.mjs`: pulls notes, communications, tasks, calendar, documents and expenses for
  the requested matter, picks the signal (recent items, deadlines, treatment, client contact),
  and asks Claude for a digest where every line cites the Clio record it came from. Digests are
  cached per matter and section with a fingerprint of record IDs and `updated_at`, so opening a
  matter twice costs nothing and a new note only re-digests the notes section.
- `server/provider.mjs`: the provider view is built from an allowlist. Valuation, internal
  digests, expenses and documents are never shared. Policy limits are shown as the three lines
  from Clio, never summed.
- `server/share.mjs`: signed, expiring, revocable links with a generated password (scrypt
  hash stored, never the password). Opens are logged; an open is not proof of reading.

## Setup

```
CLIO_ACCESS_TOKEN=...      # OAuth token from your own Clio developer app
ANTHROPIC_API_KEY=...
SHARE_SIGNING_SECRET=...   # 32+ random characters
npm start                  # http://localhost:3000/?matter=<Clio matter id>
npm test
```

Internal routes expect the firm's SSO proxy to set `x-firm-user`; only `/api/share/open` is
public.

## Known gaps

- Scanned PDFs are listed, not OCR'd. Injury extraction from medical records is not built.
- No client photo from the ID document.
- The digest store is a JSON file; a firm deployment would need a database.
