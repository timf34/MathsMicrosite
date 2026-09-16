# Maths Matters

An Astro open-letter microsite with a linked essay and moderated Google Sheets signatories, deployed through GitHub and Vercel.

## Start collecting signatures

Follow [the setup guide](docs/SIGNATURE-SETUP.md). The code is implemented; the Google account owner must authorise/deploy the supplied Apps Script and add two server-only Vercel settings. Until then the form stays disabled. No example signatories appear on the production homepage.

## Run

Use Node 22.12 or newer. Install dependencies with `npm install`, then run `npm run dev -- --background`. Manage the server with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`. Build with `npm run build`. Run the integration checks with `npm test`.

The local Astro server also serves `/api/signatures` through the same handler used on Vercel. To connect locally, copy `.env.example` to `.env.local`, enter the private settings, and restart. The normal Vercel build remains static Astro plus a Node function at `api/signatures.js`.

## Editing

- Homepage and letter: `src/pages/index.astro`.
- Essay: `src/pages/Maths curriculum.md`, rendered at `/explainer/`; its section menu is generated automatically.
- Appearance: `src/styles/global.css`.
- Moderation: the private Google Sheet. No rebuild is needed for approvals or ordering changes.
- API and validation: `api/signatures.js` and `server/signatures.mjs`.
- Google-side script: `scripts/google-signatures.gs`.
- Archived example-name data in `src/data/site.ts` is not used by the homepage.

## Design previews

Use `/?design=white` to open the optional style switcher. Normal URLs use crisp white with fine lines. The original grey and warm white remain available for comparison. During local development the switcher also offers experimental graphics. Only the sine wave appears on the production site.

## Launch notes

The site remains noindex pending final launch review. The supplied letter text is preserved; confirm whether “rigourous qualitative metrics” should read “rigorous quantitative metrics”. The Google integration requires a real end-to-end check after account setup; mocked tests cannot verify Google permissions or Vercel environment variables. See the setup guide for the approval, privacy, and identity-review workflow.
