# Frontend demo authentication

The `/login` page is a frontend-only demo. It checks basic email formatting and requires a non-empty password, then navigates to `/home`. It does not call an authentication service, create a session, issue tokens, or verify credentials.

Password input remains only in component memory while the page is mounted. The app does not write passwords to `localStorage` or `sessionStorage`. The Google sign-in control only explains that Google OAuth is not configured; it never reports a successful OAuth sign-in.

This demo flow is not production authentication or a security boundary. Do not use it to protect real data. Production access requires backend authentication, secure session handling, and server-side authorization.

updating auth for vercel checks
