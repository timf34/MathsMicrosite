# Maths Matters

An Astro design prototype for an open letter about Leaving Cert mathematics. The supplied reference archive is preserved in `openletter.svangel.com/`.

## Run

Use Node 22.12 or newer. Install dependencies with `npm install`, then run `npm run dev -- --background`. Manage the server with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`. Build with `npm run build`.

## Editing

- Letter and page content: `src/pages/index.astro`.
- Names: `src/data/site.ts`. Add a record to add a person, set `visible: false` to hide one (or delete the record), and change `priority` to curate the order. Smaller numbers come first. Rebuild to publish changes.
- Explainer: `/explainer/` renders `src/pages/Maths curriculum.md`. Edit that Markdown to update the essay; its section menu is generated from the headings. The homepage links to it in the same tab.
- Appearance: `src/styles/global.css`.

## Design previews

Open `/?design=white` for the temporary style switcher. Compare original grey, crisp white, white with fine rules, and warm white with softer rules. The essay already uses serif body text. The selection travels to the essay and back via the URL; it is not stored as a site-wide preference. Exit using the switcher’s ×. Normal URLs retain the original design.

## Current scope

This is a design-first prototype. All six political names are explicitly labelled examples, not endorsements. The signing form validates input and displays a private preview; it does not send, store, or add any information to the signatory list. No database, live submission endpoint, admin login, or anti-bot service is connected. JavaScript is required for the form preview. The preview is marked noindex until real content and consenting signatories are ready.

The supplied letter is retained, including “rigourous qualitative metrics”; confirm whether “rigorous quantitative metrics” was intended before launch.

## Suggested next phase

Keep the Astro frontend and add a server submission endpoint plus a small hosted database. Store public name, optional role, publication status, featured priority, and creation date separately from private email and verification data. Public reads must only return approved public fields. Support self-submission and authenticated organiser entry; give organisers approve/hide/delete/reorder controls. A verified email and moderation queue would help avoid impersonation of politicians. Validate anti-bot tokens on the server, add rate limits and a honeypot, and validate/normalise all inputs on the server. An email verification flow can confirm email control but does not establish political identity.

Choose hosting and database together when moving to live collection. Add an appropriate privacy notice, retention policy and explicit publication consent, replace example entries with authorised signatories, and remove preview notices/noindex only when ready. No public deployment has been configured.
