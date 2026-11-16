# PLAN-C-01 — Items That Need the Owner

**Status:** Open · **Written:** 2026-11-16 · **Series:** PLAN-C is the owner-action series (PLAN-A is frontend, PLAN-B is backend).
**Purpose:** Everything that cannot be finished by writing code alone: decisions only the owner can make, accounts only the owner can create, reviews only a person can do, and checks that need a real device or real people. Each item says what is blocked, what the owner needs to do or decide, the default I will use if you say "just pick", and what I will do once it is settled.

**How to use this list.** Items are grouped and numbered `C1-01`, `C1-02`, … Tick them off here as they are settled, and tell me which ones you have decided; I will then build the dependent work and update the matching backend plans. Items marked 🔴 block a whole phase, 🟡 block one feature, and 🟢 are low-risk and can wait.

Related: [PLAN-B-00 open questions (section 13)](plan/backend/PLAN-B-00.md#13-open-questions-for-the-owner) · [PLAN-B-00 implementation status (section 16)](plan/backend/PLAN-B-00.md#16-implementation-status).

---

## Summary

| Group | Items | Blocks |
| --- | --- | --- |
| A. Accounts and services only you can create | C1-01 to C1-06 | Email, deployment, file storage, hosting |
| B. Decisions only you can make | C1-07 to C1-13 | Region, retention, sign-in options, sharing, workspaces |
| C. Legal and public-release tasks | C1-14 to C1-18 | Making the repository public, publishing the legal pages |
| D. Checks that need real people or devices | C1-19 to C1-22 | Confidence in accessibility and usability |
| E. Optional choices (defaults are fine) | C1-23 to C1-26 | Nothing; I can proceed with the default |
| F. Mobile app (Flutter) | C1-27 to C1-29 | Connecting the Android app to the backend, notifications, store release |

---

## A. Accounts and services only you can create

I cannot create accounts, accept terms, add payment methods, or enter credentials for you. For each service below, please create the account, then give me the **non-secret** details (names, regions, domains) in chat. **Never paste passwords, API keys, or tokens into chat**: put them in the provider's dashboard or in a git-ignored `.env` file yourself, and tell me the variable names are set.

### C1-01 🔴 Email provider and sending domain
- **Blocks:** email verification, password recovery (so forgotten passwords can be recovered), change of email, "your password changed" notices, export-ready mail. See [PLAN-B-04](plan/backend/PLAN-B-04.md) sections 4–6, [PLAN-B-19](plan/backend/PLAN-B-19.md) section 5.
- **You need to:** choose a provider (default: Resend; alternatives: Postmark, Amazon SES, or SMTP from an existing mailbox), create the account, and verify a sending domain or address.
- **You need to decide:** the "from" address (for example `no-reply@<your domain>`) and the support address people can reply to.
- **If a domain is involved:** add the DNS records the provider shows (SPF, DKIM, and ideally DMARC). This needs access to your domain's DNS.
- **Default if unanswered:** Resend with its test sender during development; the app keeps working without email.
- **Then I will:** build the email service, verification and recovery flows, wire the existing auth pages (PLAN-A-03 already designed every state), add tests with a fake mailbox, and update PLAN-B-04.

### C1-02 🔴 Production domain name
- **Blocks:** deployment, cookies on the real site, email links, the legal pages' contact details. See PLAN-B-00 Q1.
- **You need to decide:** the domain (for example `tsumugi.<yourdomain>`), and confirm the **client and API will share one domain** (recommended, so sign-in cookies are first-party and no cross-site setup is needed).
- **You need to:** buy or point a domain, and be able to edit its DNS.
- **Default if unanswered:** same domain, API under `/api`.
- **Then I will:** set the cookie and CORS configuration, the email link base URL, and the deployment settings.

### C1-03 🔴 Hosting accounts: Vercel and a cloud database
- **Blocks:** putting Tsumugi on the internet (PLAN-B-16, PLAN-B-00 phase 6).
- **You need to:** create a **Vercel** account (the plan targets Vercel Functions) and a **MongoDB Atlas** account with a project and a cluster. Free tiers are fine for testing; the plan recommends a paid dedicated tier for production because of backups and connection limits.
- **You need to decide:** who owns the accounts (personal or a Moeko Works organization) and the spending limit; add billing alerts on every provider.
- **You need to:** invite me to nothing; instead run the commands or dashboard steps I give you, or authorize the connected Vercel and database tools in this app if you want me to do them for you (I will ask before changing anything outward-facing).
- **Default if unanswered:** Vercel Hobby plus Atlas free tier for a preview environment only; production waits for the decisions in C1-04 and C1-07.
- **Then I will:** add the Vercel configuration and serverless entry point, the preview and production environment settings, migrations and index scripts, scheduled cleanup, and write the runbook.

### C1-04 🟡 Object storage for uploaded files
- **Blocks:** files in the hosted version (PLAN-B-10). Locally, files already work on this computer's disk.
- **You need to:** choose a provider (default: Cloudflare R2; alternatives: Amazon S3, Backblaze B2, Supabase Storage) and create a **private** bucket for preview and one for production.
- **You need to decide:** the storage allowance per person (current default 1 GB) and the largest file (current default 100 MB). PLAN-B-00 Q3.
- **Then I will:** replace local-disk storage with presigned uploads and downloads, add upload verification and cleanup, and set the bucket rules.

### C1-05 🟡 Error tracking, logs, and uptime monitoring
- **Blocks:** knowing when production breaks (PLAN-B-16 section 9).
- **You need to:** pick vendors (defaults: Sentry for errors, a log service such as Axiom or Better Stack, an uptime monitor such as UptimeRobot) and create accounts.
- **You need to decide:** where alerts go (an email address or a chat channel) and who is responsible for them.
- **Then I will:** add structured logging, error reporting with personal data scrubbed, health endpoints, and the alert rules.

### C1-06 🟢 GitHub repository settings
- **Blocks:** nothing, but protects the project once others contribute.
- **You need to:** in the repository settings, turn on branch protection for `main` (require the CI checks), secret scanning with push protection, and Dependabot alerts. These are account settings I should not change without you asking.
- **Optional:** decide whether the repository lives under your personal account or a Moeko Works organization.
- **Then I will:** add the Dependabot configuration file and document the settings.

---

## B. Decisions only you can make

### C1-07 🔴 Where the data should live (region and residency)
- **Blocks:** choosing the Atlas, Vercel, and storage regions; the Privacy Policy's list of processors. (PLAN-B-16 "Q-region")
- **You need to decide:** where your expected users are and whether any law or customer requires data to stay in a region (for example the EU).
- **Default if unanswered:** one region close to you for every service, recorded in the Privacy Policy.

### C1-08 🔴 How long to keep things (retention)
- **Blocks:** the final Privacy Policy wording and the cleanup jobs. PLAN-B-00 Q7.
- **You need to decide:**
  - Deleted items: currently **30 days** in Recently deleted.
  - Sign-in and activity records: currently kept until the account is deleted.
  - Server logs: suggested 30 days.
  - Database backups: suggested 35 days.
  - Account deletion: currently **immediate** (no grace period). Do you want a grace period (the plan suggested 14 days) so a mistaken deletion can be undone?
- **Default if unanswered:** the numbers above.

### C1-09 🟡 One workspace per account, or several?
- **Blocks:** small data-model and UI choices. PLAN-B-00 Q4 and RESEARCH.md section 8.
- **You need to decide:** should a person be able to have more than one individual workspace (for example "Personal" and "Client work")? Today each account has exactly one.
- **Default if unanswered:** one per account; the data model already allows several, so this can be added later without a rewrite.

### C1-10 🟡 Is email verification required before using the app?
- **Blocks:** onboarding flow once email exists. PLAN-B-00 Q5.
- **Options:** (a) use the app immediately, but block sharing, export, and changing email until verified (default); (b) require verification before anything.
- **Default if unanswered:** option (a).

### C1-11 🟢 Sign-in with Google or GitHub, later?
- **Blocks:** nothing now (you asked for MERN-only). PLAN-B-00 Q8.
- **You need to decide:** whether this is wanted at all. If yes it needs a developer account with each provider and consent-screen setup. If no, I will remove the placeholder mentions.
- **Default if unanswered:** not planned.

### C1-12 🟢 Sharing and export formats
- **Blocks:** nothing now. PLAN-B-00 Q9, RESEARCH.md section 8.
- **You need to decide:** do you want read-only share links for a document or project, and exports in other formats (Markdown files, ZIP with uploaded files, PDF)? Today only a JSON export and a calendar file exist.
- **Default if unanswered:** JSON export only; no public sharing.

### C1-13 🟢 Folder name `Server/`
- **Blocks:** nothing. PLAN-B-00 Q6.
- **You need to decide:** keep the capitalized `Server/` (default) or rename it to `api/` as the original specification suggested. Renaming touches many paths and docs, so I will only do it if you ask.

---

## C. Legal and public-release tasks

Nothing here is legal advice; these need a person with the right authority, and ideally a qualified reviewer.

### C1-14 🔴 Review and publish the legal pages
- **Blocks:** treating Tsumugi as a real service for other people. The Privacy Policy, Terms of Service, and Cookie & Local Storage Policy in `docs/` are **drafts** with placeholders and are marked `noindex` until published (`LEGAL_STATUS` in the client; `npm run check:legal` refuses a build when it is set to `published` with placeholders left).
- **You need to:** read each document, fill in the placeholders (company details, contact addresses, jurisdiction, retention periods from C1-08, the list of services from C1-01 to C1-05), and have them reviewed by a qualified person if the service will hold other people's data.
- **Then I will:** update the text to match what the system actually stores, flip `LEGAL_STATUS`, and remove `noindex`.

### C1-15 🔴 Minimum age and who may use the service
- **Blocks:** the Terms and registration form.
- **You need to decide:** the minimum age and whether the service is open to everyone or limited to certain regions. Registration already requires accepting the Terms.

### C1-16 🔴 A security contact before the repository goes public
- **Blocks:** making the repository public. `CONTRIBUTING.md` tells people to report security issues privately but names no address.
- **You need to:** create a monitored address (for example `security@<your domain>`) or enable GitHub private vulnerability reporting, and tell me which.
- **Then I will:** add it to `CONTRIBUTING.md`, a `SECURITY.md`, and a `/.well-known/security.txt`.

### C1-17 🟡 License and copyright holder
- **Status:** MIT is in place with "Copyright (c) 2026 Moeko Works".
- **You need to confirm:** that Moeko Works is the right copyright holder (or give me your name or the company's legal name), and that you are comfortable with MIT (anyone may use, change, and sell the code).

### C1-18 🟡 Making the repository public
- **Currently:** the GitHub repository `PastelSalt/tsumugi-webapp` is **private**.
- **You need to decide:** when to make it public. Before you do, please complete C1-14 to C1-17, and check that no personal data, private notes, or school-activity details remain in the history. (The history here is a fresh start and does not include the original class repository's history.)

---

## D. Checks that need real people or devices

These are listed in the frontend plans and testing checklist; I cannot do them for you.

### C1-19 🟡 Screen-reader and keyboard walkthroughs
- **What:** go through the pages with a screen reader (NVDA on Windows, VoiceOver on Mac/iOS, TalkBack on Android), keyboard only, and zoomed to 200–400 percent, following `docs/testing/ux-walkthrough-checklist.md`. Pay particular attention to the new dialogs (Edit task, Edit project, Add file, document editor) and the Account page.
- **Then I will:** fix whatever you find.

### C1-20 🟡 Real-device and dark-mode checks
- **What:** try the app on a real phone and tablet, in light and dark mode, and with the system "reduce motion" setting on. I have only checked a 375-pixel emulated width and desktop.

### C1-21 🟢 User testing with a few people
- **What:** the plans (PLAN-A-04 section 14, PLAN-A-05 W17/W18) call for short sessions with real people to learn whether Quick add syntax, Home, and the Library make sense. Five people is enough to find the main problems.
- **You need to:** recruit and sit with them; I can prepare the scripts and the notes template if you want.

### C1-22 🟢 Try it yourself for a week
- **What:** use Tsumugi for a real project (the plan says Tsumugi should eventually track its own development) and keep a list of what annoys you. This is the cheapest way to find what to build next.

---

## E. Optional choices (defaults are fine)

| # | Choice | Default I will use |
| --- | --- | --- |
| C1-23 | Product naming in the app: keep "Project Garden" as the demo project name and codename | Keep |
| C1-24 | Whether to convert the server to **TypeScript** now or later | Later (recorded in PLAN-B-01) |
| C1-25 | Whether to add an **OpenAPI** document and generated API docs | Yes, when you say go; needs no input |
| C1-26 | Whether to build **team accounts** next, after deployment | Separate matter, as you decided; PLAN-B-18 stays a design |

---

## F. Mobile app (Flutter)

Found while reviewing `../tsumugi-mobile` for [PLAN-D-01](PLAN-D-01.md). These need the owner because the mobile app has its own recorded decisions.

### C1-27 🔴 Lift or narrow the mobile "play-demo" rule
- **Blocks:** any networking in the Android app: sign-in, saving, syncing, files.
- **Why it needs you:** `tsumugi-mobile/CONTEXT.md` records (2026-11-14) that the app never gets a backend, never saves anything on the device, and requests no permissions; `test/privacy_test.dart` fails the build if the app imports networking or storage packages (`http`, `dio`, `shared_preferences`, `sqflite`, `path_provider`, `url_launcher`, …) or if the release manifest asks for `INTERNET`. Connecting to the backend contradicts that rule.
- **You need to decide:** keep the demo promise for people who never sign in (recommended: "Continue as demo user" stays offline and sends nothing), and allow networking and local storage only after sign-in, in clearly named folders, with the privacy text updated. Details in [PLAN-D-01 section 3](PLAN-D-01.md).
- **Default if unanswered:** the mobile app stays a play-demo; I will not touch it. (I have not changed the mobile repository.)
- **Then:** the mobile side adds Dio, a cookie jar, local cache, the `INTERNET` permission, updates `privacy_test.dart` and the legal copy, and replaces the in-memory session overlay with the repository described in PLAN-D-01 section 10.

### C1-28 🟡 Notifications on Android
- **Blocks:** reminders and "due today" alerts (the app removed its reminders setting because the demo forbids notifications).
- **You need to:** create a Firebase project if you want push notifications (needs a Google account and acceptance of terms), or decide on local-only notifications (no Firebase, no server push).
- **Then I will:** add device tokens and reminder scheduling to the backend (PLAN-B-19).

### C1-29 🟡 Google Play release
- **Blocks:** publishing the app.
- **You need to:** create a Google Play developer account (fee and identity verification), choose the final application id (currently `com.moekoworks.tsumugi_mobile`), and complete the data-safety form and privacy-policy link once the legal pages are published (C1-14). Play will also expect in-app account deletion, which the backend already supports.

---

## What I can do without any of the above

For completeness, the work I can still do alone, in the order I would do it, so you can tell me to continue while you handle this list:

1. OpenAPI document and generated tests from it; idempotency keys and `If-Match` conflict handling.
2. A CSRF token and a persistent rate limiter.
3. Moving the UI's derived numbers (progress, health, coverage) onto the server so there is one source.
4. TanStack Query in the client and a clearer "signed out" experience.
5. Move and restore actions in the UI for tasks and files, and bulk selection.
6. Reminders and an in-app notifications list (no email needed), using a local job runner.
7. Accessibility fixes from anything you find in C1-19 and C1-20.

---

## Recording decisions

When you decide an item, tell me the item number and the decision. I will: (1) mark it here as settled with the date and the choice, (2) update the matching plan's open questions and implementation status, and (3) build whatever was waiting on it.

| # | Decision | Date |
| --- | --- | --- |
| — | *(nothing settled yet)* | — |
