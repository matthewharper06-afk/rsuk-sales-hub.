# RSUK sales assistants

Three on-demand AI assistants are available in **Sales Assistants** after staff sign-in:

1. **Prospect researcher:** searches public web sources for 1–10 accounts in social housing maintenance, roofing or solar, covering the Midlands and surrounding areas. Returns evidence, sources, published contact details where found and recommended approaches. Existing CRM company names are supplied for deduplication; contact emails/history are not included in the research snapshot. Review results before importing contacts using the existing Find Customers CSV workflow.
2. **Follow-up assistant:** select an eligible contact, optionally paste a reply or relevant context, then generate an email draft, call opener and next action. Opted-out and Not suitable contacts are excluded. It cannot read Outlook replies or send email.
3. **Pipeline reviewer:** reads the current CRM snapshot and prepares priorities and a 30-hour weekly plan. One-off jobs, quotations and opportunity values do not count as confirmed recurring revenue. The CRM does not yet have a dedicated confirmed recurring revenue field, so progress against the revenue target remains unknown unless explicitly documented.

The agreed goal is £250,000 sustained monthly turnover excluding VAT from January 2027, versus £215,000 expected baseline. Increment: £35,000/month. New account target: at least £500/week, ideally £5,000/week. These are qualification targets, not verified budgets.

## Runtime and access

This extends the existing static/Supabase application with a Vercel Node function at `/api/sales-agent`; it does not replace the application or its authentication. Install with `npm ci`. The AI SDK is pinned to 7.0.155. Vercel detects the function alongside the static frontend.

AI Gateway uses the deployment's automatic `VERCEL_OIDC_TOKEN`, or server-only `AI_GATEWAY_API_KEY`. Gateway access and sufficient credit must be available in the hosting team. Never place AI credentials in `config.js`. Default model `openai/gpt-5-mini` was checked against the Gateway model catalogue during implementation; optional server environment variable `RSUK_AGENT_MODEL` can override it.

Public Supabase settings in the API match `config.js`. If the Supabase project changes, update both. Server requests use the staff user's JWT and publishable key, never a service role. The server verifies Auth and active team membership before accessing CRM data or invoking AI. No database migration is required. Approved team members share report history under existing activity RLS.

Only explicitly requested AI runs, contact imports and email sends execute. No background schedules or automatic sending are configured. Model/search usage can incur AI Gateway charges. Each run has bounded tokens, search steps and timeout. Activity-backed limits allow 20 starts per user per rolling day, with 30 seconds between new reports and five seconds between replies. This is a soft limit, not a transactional spend cap; use Gateway budgets for a hard spending policy.

CRM data, contact notes and optional context are sent to the configured model. Public research uses Gateway web search. Review what you enter in context. Reports are stored as `sales_agent_run` activities and rendered as plain text. Starts are logged separately to count failed attempts too. A report-saving failure is shown clearly; copy the report before leaving.

The first release reads up to 500 companies, contacts and recent activities, displaying an incomplete-snapshot warning when a limit is reached. Individual follow-up history includes up to 30 records; pipeline review includes up to 150 activities. Large CRM snapshots are rejected rather than silently exceeding the model budget. This is a first release for a small sales team, not an unattended sales service.

## Validation and rollout

Run `npm test`. Tests exercise signed-out/inactive access, malformed requests, missing AI configuration, soft rate limits, opted-out/disqualified contacts, provider error redaction, server-side CRM context, required research tooling and report-only writes. Provider calls are mocked in these tests: they do not verify live credentials, search quality or actual model output.

In a Vercel preview, verify an invited user can run each assistant and read its saved report, a suspended/signed-out user cannot run it, opt-outs cannot be selected, and a failed Gateway request has a useful error. Check existing contacts, pipeline, follow-up plans, Outlook drafts and CSV import still work. Real AI output needs review for source quality and commercial accuracy.

Live model-access check: this team accepted openai/gpt-5-mini while newer model requests returned HTTP 403 with a free-tier restriction despite a positive balance. The default uses the tested accessible model.

Reliability update: research uses one search round followed by synthesis, low reasoning effort, up to two transient-error retries, a 150-second generation deadline and 180-second function duration. The UI waits up to 185 seconds. A live replay of the five-account social-housing workflow with a synthetic 500-company CRM snapshot completed successfully in 20 seconds with finishReason=stop. Auth/database writes in that replay were simulated; signed-in production CRM integration remains a separate check.

## Replying to an agent

Open a report under Saved conversations, type in Reply to this agent and select Send reply. Older reports can be continued too. Replies use the stored report history plus a fresh CRM snapshot; client-supplied conversation history is never trusted. Follow-up conversations re-check the current contact opt-out/Not suitable state when the saved report identifies a contact.

Each saved turn is an append-only sales_agent_run activity containing the conversation ID, parent report ID, messages and original settings. The history lists the latest turn for each conversation. Exports already include activity details, so no database migration is needed. If a report cannot be saved, copy remains available and replies are disabled to prevent context loss.

Conversation questions are limited to 3,000 characters. A thread accepts up to eleven replies and a maximum 100,000 characters of stored history plus the next question; long threads ask the user to start a new report with a summary. Twenty total report/reply starts are allowed per person per rolling 24 hours. Replies may use web search when new information is required, and incur Gateway usage. No automatic emails, lead imports, downloads or schedules are created by chat replies.

DOM checks verified legacy-report opening, plain-text rendering, reply submission, thread restoration after refresh, grouped history and draft preservation after an error. Node tests also cover saved-history ownership, malformed/inaccessible parents, invalid stored roles, opt-outs, save failure and reply cooldown.

## Research quality update

New research runs now use two explicit, bounded AI calls: discovery of relevant programmes and delivery contractors, then a separate contact/date verification search. The same 150-second overall deadline applies. Both searches must return usable source evidence. The final response uses a structured schema and is converted to a readable shortlist server-side.

Research focus defaults to contractors delivering work; housing providers/procurement can be selected separately. The operating area can be narrowed. Generic resident repair policies alone are not treated as scaffold opportunities. Candidates carry a specific buying signal, retrieved source, dates, contact route, next action and unresolved qualification point.

Post-processing removes already-listed companies, legal-name/group duplicates and candidates whose programme URL was not retrieved. Email export requires the literal email in returned search text and matching evidenced company-domain provenance. Guessed/unmatched addresses and recruitment/privacy mailboxes are withheld. This verifies returned source evidence, not email deliverability or every commercial claim. Missing contacts are left blank, not guessed. Expired deadlines and awarded frameworks are labelled for successor/appointed-contractor checks; post-January starts are longer term. Old/unknown dates and generic fit are downgraded. £500/week and £5,000/week remain qualification targets only.

A Download shortlist contacts button exports only evidenced email contacts with the exact importer headers company,name,role,email,phone,verified. Quoting, UTF-8 BOM and spreadsheet-formula escaping are applied. The original shortlist stays attached to its saved conversation and remains available after replies. There are now 34 Node tests plus DOM/CSV checks. The new staged structured workflow has not been live-tested: automatic approval review blocked the separate hosted paid-search diagnostic; only normal authenticated user runs should be used for the remaining live check.

Live research check (28 October 2026): one user-approved, secret-gated test used the same research handler with synthetic CRM access and real Gateway/search calls. The three-account workflow returned HTTP 200 in 51 seconds, with three candidates and two published business emails. Both email addresses were independently found on company contact pages. The test revealed that secondary trade sources and a general framework portfolio could pass the programme gate, and that a crawl-like date could be promoted into an evidence date. Post-processing now rejects known secondary source domains, requires company/official procurement provenance, checks source dates rather than lastUpdated, and downgrades general framework listings. Unchecked model-wide action summaries are suppressed; each retained account has its own next action. Regression checks pass (36 Node tests). The tightened post-processing was verified locally; no second paid generation was run.


## Outlook outreach setup

The research report now offers direct saving of sourced contacts to the CRM and a separate action to save the contacts and send individual introduction emails. Sending is user-triggered for the selected saved report, requires a confirmation that recipients are eligible business contacts and have not opted out, skips opted-out or Not suitable contacts, records successful sends, moves newly contacted people to Contacted, and is capped at 20 messages per user per UTC day. A saved conversation ID is used as the campaign idempotency key so retries do not duplicate a sent email. The email includes RSUK identity, business address and a reply-to-opt-out line. The currently connected sender is matthew.harper@risescaffolding.co.uk.

Microsoft Graph uses delegated Mail.Send, User.Read and offline_access. The OAuth code flow uses PKCE. Register this exact production redirect URI in Microsoft Entra:

https://rsuk-sales-hub.vercel.app/api/outlook-callback

Set these Vercel project environment variables (Production and Preview): OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID, OUTLOOK_TOKEN_ENCRYPTION_KEY, OUTLOOK_REDIRECT_URI, and RSUK_SALES_HUB_URL. OUTLOOK_REDIRECT_URI must equal the registered URL above; RSUK_SALES_HUB_URL is https://rsuk-sales-hub.vercel.app. OUTLOOK_TOKEN_ENCRYPTION_KEY is a 32-byte base64 secret. Client secret and encryption key must be sensitive/server-only values. The OAuth callback stores only an AES-GCM-encrypted refresh token in an activity row; Sales Hub screens and AI CRM context exclude that row. The integration accepts only the verified RSUK sender mailbox.

After the app registration and Vercel values are configured, open Sales Assistants, select Connect RSUK Outlook and sign into the business mailbox. Confirm the status shows the expected sender before using the research report's send action. The Outlook app registration and live OAuth/send flow still require owner setup and a signed-in user connection.
