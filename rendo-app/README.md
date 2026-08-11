# RENDO

Utility-first recipe extraction engine. Single-surface Library, local-first Dexie vault, Gemini extraction, Supabase sync schema.

## Stack

- Next.js App Router + Tailwind CSS v4 + shadcn-style Radix primitives
- Dexie (IndexedDB) local-first reads/writes + sync queue
- Gemini 1.5 Flash via `/api/extract` (mock fallback without `GEMINI_API_KEY`)
- Supabase Postgres/RLS migration in `supabase/migrations/`
- iOS Share Extension scaffold in `ios/`

## Develop

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — local web prototype
- `npm run build` — production build
- `npm run lint` — ESLint

## Env

| Key | Purpose |
|---|---|
| `GEMINI_API_KEY` | Extraction (optional; mock used if unset) |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud sync |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser / server client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server sync upserts |
