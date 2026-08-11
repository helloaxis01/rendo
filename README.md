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

- **Netlify:** root `netlify.toml` uses base `rendo-app` + `@netlify/plugin-nextjs`
- Optional env vars in Netlify: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
