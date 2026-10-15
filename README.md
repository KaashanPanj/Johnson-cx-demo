# Johnson Health Tech × Aistra — Voice AI demo

An inbound-call demo for Johnson Health Tech Australia built on [Ultravox](https://www.ultravox.ai).
Two virtual agents answer simulated calls in the browser (WebRTC, no telephony); when a call
ends, the app pulls the Ultravox summary and transcript, extracts the key facts with OpenAI,
and writes a row to a Google Sheet that doubles as the "customer DB".

| Agent | Persona | Line | What it does |
|---|---|---|---|
| Retail support | **Mia** | Consumer IVR | Infers intent and either resolves (delivery status, warranty, troubleshooting), transfers immediately (commercial / urgent), or assists first and then transfers with a hand-off brief. |
| Partner delivery desk | **Alex** | B2B reseller line | Verifies the reseller, finds the order, gives the latest delivery status and raises a priority logistics request. |

## How a demo call flows

1. **Virtual Agents** tab → pick Mia or Alex → *Simulate inbound call*.
2. `/call?agent=retail|partner` creates an Ultravox call (`POST /api/calls`) and joins it with
   `ultravox-client`. You speak as the caller; the live transcript streams on the right.
3. Hang up (or the agent ends the call). The post-call pipeline runs:
   - poll `GET /api/calls/status` until Ultravox has produced its call `summary`;
   - fetch the transcript (`GET /api/calls/transcripts`);
   - `POST /api/extract` → OpenAI structured extraction (serial number, issue, resolution,
     transfer target, hand-off brief, partner matched, …);
   - `POST /api/db/write` → Google Sheet. **Retail** appends a new row with a generated
     `Caller ID` (`CALL-0006`, `CALL-0007`, …). **Partner** updates the matched partner's row.
4. You land on the **Customer DB** tab with the new / updated row highlighted and expanded
   (call summary, hand-off brief, outcome, duration, call ID).

If the Google Sheet is not configured (or a write fails) the app runs in *demo mode*: it shows
the seed rows and keeps your call results in the browser session instead.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

### Environment variables (`.env.local`, see `.env.local.example`)

| Variable | Required | Notes |
|---|---|---|
| `ULTRAVOX_API_KEY` | yes | Server-side only. |
| `NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL` | yes | Ultravox agent ID for Mia. |
| `NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER` | yes | Ultravox agent ID for Alex. |
| `OPENAI_API_KEY` | yes | Post-call field extraction (`gpt-4o-mini`, strict JSON schema). Without it the sheet row still gets the Ultravox summary, outcome, time and duration, but the extracted columns stay blank. |
| `GOOGLE_SHEET_ID` | for write-back | ID from the sheet URL. Share the sheet (**Editor**) with the service-account email. |
| `GOOGLE_SERVICE_ACCOUNT_B64` | for write-back | Base64 of the service-account JSON key. Alternatives: `GOOGLE_SERVICE_ACCOUNT_JSON` (raw JSON) or a local `./google_service_credentials.json` (gitignored). |
| `SHEET_TAB_RETAIL` / `SHEET_TAB_PARTNER` | no | Tab names; default `Retail Support` / `Partner Desk`. Tabs are created and seeded automatically if missing. |
| `NEXT_PUBLIC_DEMO_TIMEZONE` | no | Default `Australia/Melbourne`. Used for the injected `current_datetime` and table timestamps. |

### Google Sheet

Create a blank Google Sheet and share it with the service account as Editor. On first load
the app creates both tabs, writes the headers and the five seed rows per tab. *Reset demo data*
in the UI rewrites the seeds (`POST /api/db/seed`).

Column layout is defined in `lib/schema.ts` and is the single source of truth for the sheet
headers, the table columns and the expanded-row details.

### Ultravox agents

Both agents are created in the Ultravox console (prompts live in
`../agents/02_agent1_retail_ivr_prompt.md` and `../agents/04_agent2_reseller_prompt.md`).
Every call made from this app passes `templateContext.current_datetime` (e.g.
`Thursday, 15 October 2026 | 2026-10-15 | 14:12 | Australia/Melbourne`), so a prompt may use
`{{current_datetime}}` **when driven by the app** — the console's own test call rejects it.
Call metadata carries `agentKey` and, for retail, the assigned `callerId`.

## Project structure

```
app/
  page.tsx                 Home: Virtual Agents | Customer DB tabs (?tab=agents|db&agent=&highlight=)
  call/page.tsx            Live call screen (?agent=retail|partner)
  api/calls/               POST create call · status · transcripts (Ultravox)
  api/extract/             POST OpenAI structured extraction (per-agent schema)
  api/db/rows|write|seed   Google Sheet read / write / reseed
components/
  HomeClient, AgentCards, CustomerDbTable, InboundCallComponent, Header, Footer
lib/
  agents.ts     the two agents (IDs from env)
  schema.ts     per-agent DB schema + seed rows
  sheets.ts     Google Sheets I/O (googleapis, service account)
  google.ts     service-account loading
  datetime.ts   demo-timezone helpers
  local-overlay.ts  sessionStorage fallback when the sheet isn't connected
```

## Deploy (Vercel)

Import the repo as a new Vercel project and set the environment variables above
(use `GOOGLE_SERVICE_ACCOUNT_B64` for the key). No persistent disk is used — all state lives in
the Google Sheet.

## Before a real demo

- Shift the hardcoded dates in the agent prompts, the reseller script and `05_partner_orders_db.xlsx`
  (they are written against 14–16 Oct 2026).
- Seed-row timestamps in `lib/schema.ts` are dated 13–14 Oct 2026 for the same reason.
