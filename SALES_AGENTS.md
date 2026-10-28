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

Only explicitly requested runs execute. No background schedules, automatic mail, calls or lead imports are configured. Model/search usage can incur AI Gateway charges. Each run has bounded tokens, search steps and timeout. Activity-backed limits allow 20 starts per user per rolling day, with 30 seconds between runs. This is a soft limit, not a transactional spend cap; use Gateway budgets for a hard spending policy.

CRM data, contact notes and optional context are sent to the configured model. Public research uses Gateway web search. Review what you enter in context. Reports are stored as `sales_agent_run` activities and rendered as plain text. Starts are logged separately to count failed attempts too. A report-saving failure is shown clearly; copy the report before leaving.

The first release reads up to 500 companies, contacts and recent activities, displaying an incomplete-snapshot warning when a limit is reached. Individual follow-up history includes up to 30 records; pipeline review includes up to 150 activities. Large CRM snapshots are rejected rather than silently exceeding the model budget. This is a first release for a small sales team, not an unattended sales service.

## Validation and rollout

Run `npm test`. Tests exercise signed-out/inactive access, malformed requests, missing AI configuration, soft rate limits, opted-out/disqualified contacts, provider error redaction, server-side CRM context, required research tooling and report-only writes. Provider calls are mocked in these tests: they do not verify live credentials, search quality or actual model output.

In a Vercel preview, verify an invited user can run each assistant and read its saved report, a suspended/signed-out user cannot run it, opt-outs cannot be selected, and a failed Gateway request has a useful error. Check existing contacts, pipeline, follow-up plans, Outlook drafts and CSV import still work. Real AI output needs review for source quality and commercial accuracy.

Live model-access check: this team accepted openai/gpt-5-mini while newer model requests returned HTTP 403 with a free-tier restriction despite a positive balance. The default uses the tested accessible model.
