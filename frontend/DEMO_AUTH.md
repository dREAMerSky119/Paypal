<<<<<<< HEAD
# Wayfare browser demo session and profiles

The current flow is a frontend prototype, not production authentication. Login accepts any syntactically valid email and non-empty password. The password is used only for the form validation step and is never persisted or sent. The temporary session stores the normalized email in `sessionStorage`; it provides navigation continuity only and is not a credential, token, or security boundary.

Profiles are keyed by normalized email and saved in `localStorage`. Profile information is readable and editable by the browser user and must not be treated as verified identity or sensitive account data. Logging out clears only the session; saved demo profiles remain available for the next visit.

Storage keys:

- `wayfare.demo.session.v1` — `{ email, startedAt }` in `sessionStorage`.
- `wayfare.demo.profiles.v1` — email-to-profile map in `localStorage`.

Storage access is isolated in `src/lib/profileStorage.js`. UI components use `AuthContext`; replace that adapter/context implementation when backend APIs are ready. Do not use this prototype to protect real data. Production authorization must be enforced by the backend, ideally with secure HttpOnly cookies and server-side checks.

## Backend replacement contract (proposed, not currently implemented)

The FastAPI router currently has no authentication or profile endpoints. The following contract is the frontend integration target and must be agreed with the backend owner before wiring requests:

- `POST /api/auth/login` — request `{ email, password }`; response `{ user: { id, email }, profile: null | Profile }`; establish an HttpOnly session cookie. Do not return or persist the password.
- `GET /api/auth/me` — response `{ user: { id, email }, profile: null | Profile }`; use this for session restoration and profile retrieval.
- `POST /api/profiles` — create the authenticated user's profile; request and response use `Profile` below.
- `PATCH /api/profiles/me` — update the authenticated user's profile; request and response use `Profile` below.
- `POST /api/auth/logout` — invalidate the server session and expire the cookie; response `204`.

`Profile` fields: `fullName`, `phone`, `nationality`, `agencyType` (`organisation` or `self-employed`), `organisationName`, `organisationAddress`, `organisationWebsite`, and `designation`. The server should associate the profile with the authenticated account rather than trusting a client-supplied email.

When that API is available, replace `writeDemoSession`/`readDemoSession`/`clearDemoSession` with login/session/logout calls and replace `getSavedProfile`/`saveProfile` with authenticated retrieval/create/update calls. Keep the context interface stable so page components do not need to change.

Google OAuth remains unconfigured and the UI does not claim it succeeded.
=======
# Frontend demo authentication

The `/login` page is a frontend-only demo. It checks basic email formatting and requires a non-empty password, then navigates to `/home`. It does not call an authentication service, create a session, issue tokens, or verify credentials.

Password input remains only in component memory while the page is mounted. The app does not write passwords to `localStorage` or `sessionStorage`. The Google sign-in control only explains that Google OAuth is not configured; it never reports a successful OAuth sign-in.

This demo flow is not production authentication or a security boundary. Do not use it to protect real data. Production access requires backend authentication, secure session handling, and server-side authorization.

updating auth for vercel checks
>>>>>>> fe70b5b (Add updated project files final one)
