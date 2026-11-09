# RSUK AI Command Centre — Phase 1 architecture (planning only)

Status: Draft on isolated planning branch. No live application changes.

## Existing Sales Hub (read-only assessment)
- Static frontend; Supabase Postgres/Auth and RLS according to README.
- Outlook compose links; no verified automatic sending/reply synchronization.
- Existing CRM database should remain the system of record for companies, contacts, campaign states.
- Production Vercel project remains untouched.

## Separate command centre
Create a new private repository and Vercel project (not this repository) with:
- Authenticated web UI; six dashboard modules: Sales, Operations, Finance, Safety, Estimating, Director.
- Server-side integration adapters and background job queue.
- Shared audit log and approval queue; per-user permissions and role-based access.
- Tenant-level data isolation; no secrets in browser or Git.
- Read-only integrations first, then approved write actions.

## Data integration sequence
1. Sales Hub: review schema.sql and RLS, then design server-side least-privilege read-only CRM adapter; avoid duplicating contact records.
2. Scheduling: Google Sheet read-only connector, preserving source job IDs and timestamps.
3. Workever: manual CSV/XLSX import first; assess official API access before automatic synchronization.
4. Finance: import cost/revenue reports; do not infer missing labour, transport or hire costs.
5. Safety: flag due/overdue inspections, never mark an inspection as completed without competent-person sign-off.
6. Estimating: draft quotes only; require price and design approval.

## Sales Agent workflow
- Prospect discovery -> source verification -> duplicate check -> qualification -> draft -> approval -> sending -> reply classification -> follow-up.
- No auto-send initially; respect opt-outs and UK GDPR/PECR.
- Every researched contact stores source URL, verification timestamp and confidence.
- Draft emails omit Matthew's name and state Midlands coverage.
- Approval is recorded with approver, timestamp, message snapshot and recipient.

## Permissions
- Director/Admin: all modules, approve outreach and quotations, manage users.
- Sales: sales records and draft outreach, cannot self-approve bulk sending.
- Operations: scheduling and gang assignments, no unrestricted finance access.
- Safety: compliance records, safety alerts, competent-person sign-off remains external.
- Finance: financial reports, not customer outreach.
- Viewer: read-only limited to assigned modules.

## First delivery gates
- Inspect schema.sql and existing auth before implementing any CRM connection.
- Confirm Supabase project ownership and approved service-to-service authentication.
- Create new private repo/project with separate staging environment.
- Implement login, six empty dashboard views, audit log and approval queue.
- Test least-privilege access, backups, failure handling, and no production writes.
- Only then consider production integration after user acceptance.
