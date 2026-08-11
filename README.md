# RENDO

Utility-first recipe extraction engine (Phase 1 web prototype).

## App

The Next.js app lives in [`rendo-app/`](rendo-app/).

```bash
cd rendo-app
cp .env.example .env.local   # optional: GEMINI_API_KEY, Supabase
npm install
npm run dev
```

## Deploy

- **Live:** https://rendorecipes.netlify.app
- **GitHub:** https://github.com/helloaxis01/rendo
- **Netlify:** root `netlify.toml` uses base `rendo-app` + `@netlify/plugin-nextjs`
- Optional env vars in Netlify:
  - `GEMINI_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Cloud backup setup

1. Create a Supabase project and run [`rendo-app/supabase/migrations/001_rendo_core.sql`](rendo-app/supabase/migrations/001_rendo_core.sql).
2. Enable **Google** (and optionally **Apple**) under Authentication → Providers.
3. Add redirect URL `https://rendorecipes.netlify.app/auth/callback` (plus localhost for dev).
4. Set the env vars above in Netlify and redeploy.

Until cloud is configured, Settings still supports **Download** / **Import file** local backups.
