# Johnson Health Tech × Aistra — Voice AI demo

An inbound-call demo for Johnson Health Tech Australia built on [Ultravox](https://www.ultravox.ai).
Calls run in the browser (WebRTC, no telephony). The storyline has three steps, each a tab in the
app, plus the customer record every call writes to a Google Sheet.

| Tab | Step | Who answers | What it shows |
|---|---|---|---|
| AI-enabled IVR | **Route** | Mia (IVR agent) | No menu. Mia asks what the call is about, recognises the intent, names the team she is routing to and transfers with the reason attached. Resolves nothing. |
| AI-enabled customer support | **Resolve** | Mia (IVR agent → support stage) | Same front door, but simple queries are routed to the AI support agent in the **same call** and voice. Complex calls still go to a human team. |
| Virtual agent (B2B) | **Assist** | Alex | The reseller line: verify the partner, find the order, give the honest delivery status, raise a priority logistics request. |
| Customer DB | | | One inbound-calls table (tabs 1 and 2) and one partner table (tab 3), live from the Google Sheet. |

Routing departments: **Sales, Home Customer Support, Commercial Service, Spare Parts and Service**.

## How a call flows

1. Pick a tab → *Simulate inbound call*. `/call?mode=ivr|support|partner` creates an Ultravox
   agent call (`POST /api/calls`) and joins it with `ultravox-client`. You speak as the caller.
2. **IVR (tabs 1 and 2):** Mia calls the client tool `routeCall` with the intent, the department,
   who should handle it and a one-sentence summary. The browser answers the tool:
   - tab 1, or anything complex: *handled by a human team* → Mia says the routing line and hangs up
     (the transfer is simulated by the hang-up);
   - tab 2 and a simple query: the browser returns a **new call stage** carrying the live prompt and
     tools of the AI support agent (fetched from Ultravox when the call was created), so Mia
     continues as the support agent without a new call.
3. The support agent (and Alex) log the case themselves before hanging up, through the client tools
   `recordRetailCase` / `recordPartnerCase`. OpenAI extraction is only a fallback.
4. After hang-up the app fetches the Ultravox summary and transcript, builds the row and writes it:
   **inbound calls** append a row keyed by a generated `Caller ID` with `Intent`, `Routed To`,
   `Handled By` (Human team / AI agent) and the case fields; **partner** calls update the matched
   partner's row. You land on the Customer DB with the row highlighted.

If the Google Sheet is not configured (or a write fails) the app runs in *demo mode*: seed rows
plus browser-session results.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

### Environment variables (`.env.local`, see `.env.local.example`)

| Variable | Required | Notes |
|---|---|---|
| `ULTRAVOX_API_KEY` | yes | Server-side only. Also used to fetch the support agent's prompt for the tab 2 stage switch. |
| `NEXT_PUBLIC_ULTRAVOX_AGENT_IVR` | yes | Ultravox agent `johnson-ivr` (Mia as the IVR). Tools: hangUp, routeCall. |
| `NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL` | yes | Ultravox agent `johnson-retail` (Mia as the AI support agent). Its live prompt and tools become stage 2 of a tab 2 call. |
| `NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER` | yes | Ultravox agent `Johnson_b2b` (Alex). |
| `OPENAI_API_KEY` | no | Fallback extraction only, for calls where the agent did not log the case. |
| `GOOGLE_SHEET_ID` | for write-back | Share the sheet (**Editor**) with the service-account email. |
| `GOOGLE_SERVICE_ACCOUNT_B64` | for write-back | Base64 of the service-account JSON key. Alternatives: `GOOGLE_SERVICE_ACCOUNT_JSON` or a local `./google_service_credentials.json` (gitignored). |
| `SHEET_TAB_RETAIL` / `SHEET_TAB_PARTNER` | no | Tab names; default `Retail Support` / `Partner Desk`. Created and seeded automatically if missing. |
| `NEXT_PUBLIC_DEMO_TIMEZONE` | no | Default `Australia/Melbourne`. |

`NEXT_PUBLIC_*` values are inlined at build time: on Vercel, set them before the build and redeploy
after changing them.

### Google Sheet

Column layout lives in `lib/schema.ts` and is the single source of truth for sheet headers, table
columns and the expanded-row details. When the schema changes, the Customer DB tab shows a banner;
*Reset demo data* rewrites that tab's headers and seed rows (`POST /api/db/seed`).

### Ultravox agents

All three agents live in the Ultravox console; the prompts are mirrored in `../agents/`
(`07_agent0_ivr_prompt.md`, `02_agent1_retail_ivr_prompt.md`, `04_agent2_reseller_prompt.md`).
Client tools used by the browser: `routeCall`, `recordRetailCase`, `recordPartnerCase`.
Every call passes `templateContext.current_datetime` and `metadata.mode` (+ `callerId`).

## Project structure

```
app/
  page.tsx                 Home: AI-enabled IVR | AI-enabled customer support | Virtual agent (B2B) | Customer DB
  call/page.tsx            Live call screen (?mode=ivr|support|partner)
  api/calls/               POST create call (+ support stage for mode=support) · status · transcripts
  api/extract/             POST OpenAI structured extraction (fallback)
  api/db/rows|write|seed   Google Sheet read / write / reseed
components/
  HomeClient, AgentCards (DemoCard), CustomerDbTable, InboundCallComponent, Header, Footer
lib/
  agents.ts     demo modes + agent IDs (from env)
  schema.ts     per-table DB schema + seed rows
  sheets.ts     Google Sheets I/O (googleapis, service account)
  google.ts     service-account loading
  datetime.ts   demo-timezone helpers
  local-overlay.ts  sessionStorage fallback when the sheet isn't connected
```

## Deploy (Vercel)

Import the repo as a Vercel project and set the environment variables above. No persistent disk is
used; all state lives in the Google Sheet.

## Before a real demo

- Shift the hardcoded dates in the agent prompts, the reseller script and `05_partner_orders_db.xlsx`
  (written against 14–16 Oct 2026). Seed rows in `lib/schema.ts` are dated 13–14 Oct 2026.
