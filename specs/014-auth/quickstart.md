# Quickstart: Setting up Google Sign-In (Slice 14)

This walks through everything needed on the Google side before Slice 14's
code will work, aimed at someone setting up OAuth for the first time.

## 1. Create a Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or reuse an existing personal one) — the name
   doesn't matter, it's never shown to end users during sign-in in Testing
   mode beyond an app name you choose in step 2.

## 2. Configure the OAuth consent screen

1. In the console, go to **APIs & Services → OAuth consent screen**.
2. **User type**: choose **External** (this app has no Google Workspace
   organization to restrict to).
3. Fill in the required fields (app name, support email, developer contact
   email). No logo, no scopes beyond the default (`email`, `profile`,
   `openid`) are needed.
4. **Publishing status**: leave it in **Testing**. This caps external users
   at 100 and limits each person's consent grant to 7 days (they just click
   through the consent screen again after that — this does not affect this
   app's own session, only Google's own re-consent).
5. Under **Test users**, add the Google email address of every person who
   should be able to sign in. This list is separate from, and in addition
   to, this app's own `PATCHPLANNER_ALLOWED_EMAILS` allow-list — someone
   needs to be in **both** to actually get in.

## 3. Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
2. **Application type**: Web application.
3. **Authorized JavaScript origins**: add `http://localhost:5173` (the dev
   frontend origin — where the "Sign in with Google" link lives).
4. **Authorized redirect URIs**: add
   `http://localhost:7331/api/v1/auth/google/callback` (the dev backend
   callback). Google explicitly permits `localhost` here with no
   verification step.
5. Save. Copy the generated **Client ID** and **Client Secret**.

**Before deploying to production (Slice 16)**: come back here and add the
real production callback URL (e.g.
`https://your-domain.example/api/v1/auth/google/callback`) and the
production origin to the same client — forgetting this step is the single
most common cause of a `redirect_uri_mismatch` error on a freshly deployed
instance.

## 4. Configure the backend

Set these environment variables before starting the Go server (extends the
table in the project README):

```
PATCHPLANNER_GOOGLE_CLIENT_ID=<client id from step 3>
PATCHPLANNER_GOOGLE_CLIENT_SECRET=<client secret from step 3>
PATCHPLANNER_GOOGLE_REDIRECT_URL=http://localhost:7331/api/v1/auth/google/callback
PATCHPLANNER_FRONTEND_URL=http://localhost:5173
PATCHPLANNER_ALLOWED_EMAILS=you@example.com,teammate@example.com
PATCHPLANNER_SESSION_TTL=720h
```

## 5. Try it

1. Start the backend (`go run ./cmd/main.go`) and frontend (`npm run dev`)
   as usual.
2. Visit `http://localhost:5173` — you should be redirected to `/login`.
3. Click "Sign in with Google," complete Google's consent screen with an
   email that's both a Google test user (step 2) and in
   `PATCHPLANNER_ALLOWED_EMAILS` (step 4).
4. You should land back on the Dashboard, signed in.
5. To verify rejection works: try the same flow with a Google account
   that's a test user but **not** in `PATCHPLANNER_ALLOWED_EMAILS` (or vice
   versa) — you should see a clear "not authorized" message and land back
   on `/login`, and no row should appear for that person in the `users`
   table.

## What's not covered here

The actual browser round-trip through Google's real consent screen is the
one part of this feature that isn't automated in tests — this manual
walkthrough is intentionally the verification step for it.
