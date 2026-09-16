# Connect signing to Google Sheets

The website integration is ready, but it does not collect signatures until the two Vercel settings below are configured. No Google Form or new database is needed. Production no longer displays any example politicians or invented signatures.

## 1. Create a private spreadsheet

Use the Google account that will own the campaign setup. Create a blank Google Sheet named **Maths Matters — Signatories**. Share it as **Editor** with the other organisers using their individual accounts. Keep general access **Restricted**. Do not publish the spreadsheet to the web.

## 2. Install the supplied script

1. In the Sheet, open **Extensions → Apps Script**.
2. Replace the starter code with the complete contents of [`scripts/google-signatures.gs`](../scripts/google-signatures.gs) in this repository. Save.
3. Select **setupSignatories** from the function selector, then click **Run**.
4. Authorise the script with the spreadsheet owner's Google account. This authorisation must be done by you. If Google blocks authorisation or your organisation disallows public web apps, tell us the message instead of changing organisational security settings.
5. Return to the Sheet: the **Signatories** tab now has column headings, status dropdowns, and consent checkboxes. Running setup again preserves existing rows and the secret.
6. In Apps Script, open **Project Settings → Script properties**. Copy the generated **SHARED_SECRET** privately. Do not paste it into chat, the Sheet, GitHub, or any field prefixed `PUBLIC_`.

## 3. Deploy the script

In Apps Script, choose **Deploy → New deployment → Web app**:

- Execute as: **Me** (the spreadsheet owner).
- Who has access: **Anyone** (so Vercel can call it without a Google sign-in).

The script checks the private shared secret before reading or writing anything. Selecting Anyone makes the script endpoint reachable; it does not make your spreadsheet public. Copy the Web app URL ending in **/exec**, not the test /dev URL.

When updating the script later, save it and use **Deploy → Manage deployments → Edit → New version → Deploy**. Editing the file alone does not update the deployed web app.

## 4. Add two Vercel settings

Open the existing Vercel project → **Settings → Environment Variables**. Add:

| Name | Value |
| --- | --- |
| `GOOGLE_SCRIPT_URL` | The Web app URL ending in `/exec` |
| `GOOGLE_SCRIPT_SECRET` | The `SHARED_SECRET` value from Apps Script |

Apply to **Production**, then redeploy the latest `main` deployment. Leave Preview deployments unconfigured unless you explicitly want test visitors to write to the same Sheet; a separate test Sheet is preferable.

To test locally, copy `.env.example` to `.env.local`, fill in these same two values privately, and restart the Astro development server. Local submissions then go into that Sheet too. Environment files are ignored by Git.

## 5. Check the whole flow before launch

1. Open the deployed site. The form should become available, with an empty approved list.
2. Submit your own details and tick the publication consent box.
3. Confirm that the row appears as **Pending** and your name is not on the site.
4. Set its status to **Approved**. Within about two minutes, the name and role should appear. Email and notes must never appear.
5. Change Priority to **1** to put it near the top (lower numbers first, blank numbers last). Equal priorities follow Sheet row order.
6. Change status to **Hidden**. Confirm it disappears within about two minutes.
7. Check that another organiser can review and edit the Sheet.

Only rows with Status exactly **Approved**, Consent checked, and a nonempty valid Name are published. An empty approval list is a valid result. Pending, Hidden, Rejected, and blank statuses never appear.

## Everyday moderation

- **Approve:** change Status to Approved; keep Consent checked.
- **Remove from public view:** change Status to Hidden, uncheck Consent, or delete the row. Cached names may remain visible for up to about two minutes.
- **Curate:** edit Priority (1, 2, 3…). Leave it blank for ordinary ordering. Edit Name and Role to adjust the public display.
- **Add manually:** enter Name and optional Role, check Consent only when you have permission to publish that person's signature, set Source to Manual, then choose Approved. Email and Submission ID may be blank for manual entries.
- **Private notes:** use Notes for checks or correspondence. Name and Role are the only fields the public list receives.
- **Duplicates:** a repeat email or retried submission ID is acknowledged without adding a second row or changing existing approval. For corrections to a previous submission, an organiser edits the row.
- Keep the tab name and header names/order unchanged. The script fails closed if headers are changed.

No one is automatically emailed. A supplied email is not proof of identity: verify claimed political identities before approval. The site includes publication consent and tells visitors their email stays private. Add your campaign's contact/retention details and full privacy information before promoting live collection.

## What this first version does

- Keeps the custom website form.
- Starts every public submission as Pending; visitors cannot supply approval or priority.
- Reads only approved public names/roles, cached for 60 seconds; open pages refresh every 60 seconds.
- Escapes user-entered spreadsheet formula prefixes; renders names as text, not HTML.
- Adds a hidden spam field, minimum fill time, basic validation, and a best-effort limit of eight new submissions per hashed connection address in a ten-minute cache window.
- Does not put raw IP addresses in the Sheet. Google/Vercel may keep their own platform logs.
- Uses locking and duplicate checks for simultaneous submissions and retries.
- Shows errors rather than claiming an unconfirmed submission succeeded.

The spam controls are deliberately lightweight and do not stop determined bots. Google Apps Script has quotas; this is intended for a modest-volume campaign. If spam or volume grows, add a proper bot challenge and stronger rate limiting.

## Troubleshooting

- **Signing opens soon:** one or both Vercel variables are missing. Add them and redeploy.
- **Temporarily unavailable:** check the /exec URL, secret, Apps Script authorisation, deployment access, headers, and the deployed script version.
- **Approval not showing:** check Consent, exact Status, nonempty Name, and allow two minutes for caches/refresh. Blank priority is allowed.
- **Too many submissions:** wait ten minutes. People sharing a connection can share the limit.
- The optional local graphic switcher remains a development-only experiment. The sine wave is the production graphic and adapts when the live list changes.

## Update: signatures appearing near row 1001

Replace Code.gs with the latest `scripts/google-signatures.gs`, save, then choose **Deploy → Manage deployments → Edit → New version → Deploy** on the existing deployment. No setup rerun, secret change, or Vercel change is needed when updating that same deployment.

The script now fills the first unused row, ignoring unchecked consent boxes but preserving other values and formulas. Existing signatures at the bottom stay intact. To bring them up, cut their populated cells across columns A–J and paste into an unused range starting at row 2; keep each signature's entire row together. Test with a different email, as repeated emails are deliberately deduplicated.
