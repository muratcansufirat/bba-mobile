---
name: BBA mobile Supabase auth
description: Notes on the real Supabase auth integration in the BBA Expo app (Türkçe UI), including the Google provider gap.
---

The BBA mobile app (`artifacts/mobile`) uses real Supabase Authentication (email/password + Google OAuth), replacing an earlier fake/local auth system. Session persistence uses AsyncStorage via the Supabase client already configured in `src/lib/supabase.ts`.

- Email/password signup and login are fully functional and were verified end-to-end against the live Supabase project (via direct Auth REST calls), including the "email not confirmed" error path.
- The connected Supabase project has `mailer_autoconfirm: false`, so signup always requires clicking a confirmation link before login succeeds.
- Supabase auth settings (`GET {SUPABASE_URL}/auth/v1/settings` with the anon key) reject signups from certain sandbox-looking email domains (e.g. `example.com` returned `email_address_invalid`) but accept real providers like `gmail.com`. Don't conclude signup is broken from an `example.com` test — retry with a real-looking domain first.
- As of this integration, the Google provider was **disabled** in the Supabase project's auth settings. Agents cannot enable third-party OAuth providers via API — this requires the project owner to configure a Google OAuth client and enable the provider in the Supabase dashboard. Flag this explicitly rather than assuming Google login works after wiring the code.
- Google sign-in code path (`src/lib/googleAuth.ts`) uses `supabase.auth.signInWithOAuth` with `skipBrowserRedirect` + `expo-web-browser`'s `openAuthSessionAsync`, parsing tokens from the redirect URL fragment. On web/canvas preview (react-native-web/iframe), OAuth popup/redirect flows are unreliable due to third-party cookie/iframe restrictions — this is inherent to the preview environment, not a code bug.
