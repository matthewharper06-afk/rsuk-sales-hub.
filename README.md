# RSUK Sales Hub — Live deployment

This is a functional static frontend backed by Supabase Postgres/Auth. It is NOT yet deployed and no domain, account or Microsoft mailbox has been connected. Email preparation uses Outlook web draft links, NOT Microsoft Graph automatic sending or reply sync.

## 1. Back up the old hub
Open RSUK_Sales_Hub_Multi_Select.html → Backup → Download full JSON backup. Keep it private.

## 2. Supabase (database + staff login)
1. Sign in at https://supabase.com/dashboard and create a project in an appropriate UK/EU region. Save the database password privately.
2. In SQL Editor run `schema.sql` in its entirety. It creates tables and row-level security. Anonymous visitors cannot read CRM records.
3. In Authentication → Providers, enable email/password. Disable public self-registration in Authentication settings. For security, enable MFA for team users if available, and configure email delivery (SMTP) for password resets/invitations.
4. In Authentication → Users, invite/create the initial administrator. Copy their user UUID. Run in SQL Editor (replace placeholders):
   `insert into public.team_members(user_id,email,role) values ('YOUR_AUTH_USER_UUID','your@rsuk.org.uk','admin');`
5. For additional team members: invite/create them in Authentication → Users, then insert their UUID/email with role `staff` into `team_members`. Do not give staff the Supabase project admin password.
6. In Project Settings → API copy **Project URL** and **publishable/anon** key (NOT secret/service_role). Copy `config.example.js` to `config.js` and replace the placeholders. The public key is safe in browser because RLS is enabled. Do not paste secret keys into the website.
7. Authentication → URL Configuration: set Site URL to `https://YOUR-VERCEL-URL.vercel.app` and add redirect URLs `https://YOUR-VERCEL-URL.vercel.app/**` and your temporary Vercel domain. Password recovery flows may require additional UI handling depending on auth settings.

## 3. Publish using a free Vercel web address (no website company or DNS changes)
1. Create/sign into https://vercel.com using your own account. Create a private GitHub repository containing this folder, with `config.js` generated from `config.example.js` and filled with only the Supabase Project URL and public publishable/anon key. Alternatively, deploy the folder using Vercel CLI on your own computer. Never include database passwords or service-role keys.
2. Deploy the project on Vercel. Vercel assigns a working `*.vercel.app` URL; its exact name is not guaranteed until deployment. You do NOT need a custom domain or website company.
3. In Supabase Authentication → URL Configuration, use your ACTUAL deployed `https://...vercel.app` address as Site URL and add it to allowed redirect URLs.
4. Test login with an invited administrator, then a staff user. Verify uninvited users cannot read records. Invite the rest of the team after testing.
5. Optional later: connect `sales.rsuk.org.uk` with your website company; it is not needed now.

## 4. Migrate existing data
Log in as admin → Import / Export → upload the JSON backup. Company names and email addresses are deduplicated. Check all campaigns and statuses afterwards. The importer migrates companies, contacts and basic campaigns; historic activities and complex per-recipient campaign history require separate mapping and are NOT fully migrated. Preserve the old JSON backup. Contacts CSV imports are also supported.

## 5. Outlook
Company → Email contacts → select multiple people → Prepare selected drafts. Each recipient receives an individual Outlook compose link for manual sending. Campaigns → create campaign → choose contacts → open drafts → mark sent/replied manually. This release does not connect to Microsoft Graph and cannot automatically send, verify delivery or read replies. For real automatic Outlook sync, a server-side Microsoft Entra OAuth integration with explicit delegated permissions and secure token handling is a separate phase.

## 6. Security / operations
- All business tables have RLS restricting access to explicitly provisioned active team members. Team admins can manage membership via SQL; no self-registration.
- Do not store passwords, secrets or SMTP credentials in `config.js` or Git.
- Back up via Import / Export regularly; use Supabase managed backups appropriate to your plan.
- Before sending marketing emails, verify the contact data and UK GDPR/PECR lawful basis, respect opt-outs and provide clear identification and opt-out options.
- This is a starter CRM, not a production-audited application. Before wide rollout, test backup restoration, access revocation, contact import, campaign states, and permissions with a small staff group.
