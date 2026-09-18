# Temporary deployment password

Edit `deployment-settings.js` in the GitHub repository:

- `PASSWORD_PROTECTION_ENABLED = true` locks deployed pages and the API.
- `PASSWORD_PROTECTION_ENABLED = false` opens them and restores production search indexing.

Commit the change and wait for Vercel to deploy it. No Vercel environment variable is needed.

The browser presents a standard sign-in prompt. Use any username (for example `preview`) and password `HAMILTON` (case-sensitive). Browsers remember this login; use a private window to check the locked state.

This gate runs on Vercel, not the ordinary local Astro development server. The password is intentionally in the repository for this temporary launch gate. It is not protection against anyone who can read the repository, and does not retroactively protect older deployment URLs. Google cannot index the gated site; turn it off when launching.
