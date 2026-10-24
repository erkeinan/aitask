# Woven private pilot

## Current design

Local mode (`node server.mjs`) keeps the original local data and loopback-only server.
Cloud mode (`WOVEN_STORAGE=supabase`) requires an owner account and stores state in
Supabase Postgres and uploads in the private `woven-files` bucket. It never reads
or writes `data/state.json`. Existing local tasks and attachments are not imported
automatically. A new cloud account starts empty.

`supabase/setup.sql` records the initial schema and access policies. Apply it only
once, using Supabase migration tooling. Every data request uses the signed-in
user's access token and Row Level Security. No service-role key is required.

Only `WOVEN_OWNER_ID` can sign in to this pilot. Keep public signups disabled.
Tokens stay in server memory; the browser receives an HttpOnly, SameSite cookie
(Secure when hosted). Sessions last up to 12 hours. Restarting or redeploying the
server signs you out; saved tasks remain in Supabase. Run a single server instance
for this pilot. Concurrent state writes use a version check rather than silently
replacing a newer state. A conflict requires reloading and retrying.

## Local cloud preview

Use Node.js 22 or newer. Copy `.env.example` to `.env` and fill in your project URL,
publishable key and Auth user ID. These are configuration values, not your login
password. Keep `.env` out of GitHub.

Run `node --env-file=.env server.mjs`, then open http://127.0.0.1:4318.
Sign in with the email and password you created in Supabase. Never put your
password in `.env` or send it in chat.

## Render preparation (do not publish until login is tested)

Upload the app source to `erkeinan/aitask`, excluding `data/`, `.env`, and logs.
There are no third-party runtime dependencies. If the app files are at the root
of the repository, leave Render's Root Directory empty; if uploaded as the
`woven-local` folder, use `woven-local` as Root Directory.

Create a Node Web Service with these settings:

- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/healthz`
- `NODE_VERSION`: `24.19.0` (the version used for local verification)
- `WOVEN_STORAGE`: `supabase`
- `SUPABASE_URL`: your project's HTTPS URL
- `SUPABASE_PUBLISHABLE_KEY`: the key starting with `sb_publishable_`
- `WOVEN_OWNER_ID`: your Supabase Authentication user ID
- Optional `OPENAI_API_KEY`: enter privately in Render's environment settings.

Do not set `PORT` or `WOVEN_APP_URL` on Render. Render supplies `PORT` and
`RENDER_EXTERNAL_URL`; Woven uses them for its public origin and listens on
`0.0.0.0`. Check the displayed plan and price before creating the service.

For a custom domain, set `WOVEN_APP_URL` to its exact HTTPS origin. After deployment,
update Supabase Authentication's Site URL to the deployed address for future email
flows. This pilot uses email/password login and does not implement public signup
or password-reset emails. Passwords can be managed through the Supabase dashboard.

## Verification

Run `node --test test/*.test.mjs`. Before publishing, sign in on the real local cloud
preview, save a note, upload and download a file, reload and confirm persistence,
then sign out and confirm saved data is hidden. Test the AI separately using your
own API key; automated checks do not spend AI credits.

Official references: [Supabase passwords](https://supabase.com/docs/guides/auth/passwords),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[Render web services](https://render.com/docs/web-services).
