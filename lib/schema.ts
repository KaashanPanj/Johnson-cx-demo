import type { AgentKey } from "./agents";

// Per-agent "customer DB" schema. Each agent owns one tab in the Google Sheet.
// `columns` is the exact header order written to the sheet; the UI uses
// `displayColumns` for the compact table and shows `detailColumns` when a row
// is expanded. Seed rows are written when a tab is empty (and on "Reset").

export type DbRow = Record<string, string>;

export interface DbSchema {
  agent: AgentKey;
  title: string;
  /** Column that identifies a row (retail: generated per call; partner: the partner name). */
  keyColumn: string;
  /** retail = every call appends a new row; partner = the matched partner row is updated. */
  writeMode: "append" | "update";
  columns: string[];
  displayColumns: string[];
  detailColumns: string[];
  seedRows: DbRow[];
}

export const RETAIL_SCHEMA: DbSchema = {
  agent: "retail",
  title: "Retail support — call log",
  keyColumn: "Caller ID",
  writeMode: "append",
  columns: [
    "Caller ID",
    "Number",
    "Product Serial Number",
    "Issue",
    "Resolution",
    "Call Summary",
    "Transferred To",
    "Hand-off Brief",
    "Call Outcome",
    "Call Time",
    "Duration",
    "Call ID",
  ],
  displayColumns: [
    "Caller ID",
    "Number",
    "Product Serial Number",
    "Issue",
    "Resolution",
    "Transferred To",
    "Call Time",
  ],
  detailColumns: ["Call Summary", "Hand-off Brief", "Call Outcome", "Duration", "Call ID"],
  seedRows: [
    {
      "Caller ID": "CALL-0001",
      Number: "0412 345 678",
      "Product Serial Number": "",
      Issue: "Delivery status for order JF-10234 (Horizon Paragon X treadmill)",
      Resolution: "Confirmed dispatched 10 Oct, expected 15 Oct, kerbside delivery",
      "Call Summary":
        "Caller asked when their Horizon Paragon X would arrive. The assistant found order JF-10234, confirmed it was dispatched on 10 October with delivery expected on 15 October, and reminded them it is a kerbside delivery so someone needs to be home.",
      "Transferred To": "none",
      "Hand-off Brief": "",
      "Call Outcome": "Resolved by assistant",
      "Call Time": "2026-10-13T09:14:00+11:00",
      Duration: "1m 48s",
      "Call ID": "seed-0001",
    },
    {
      "Caller ID": "CALL-0002",
      Number: "0433 221 904",
      "Product Serial Number": "",
      Issue: "Delivery delayed — order JF-10587 (Schwinn SFT3.5)",
      Resolution: "Apologised, advised new date 20 Oct, offered a tracking update",
      "Call Summary":
        "Caller chased a Schwinn SFT3.5 that had not arrived. The assistant found order JF-10587, explained the carrier had reported a delay, gave the new expected delivery of 20 October and offered to have the delivery team send a tracking update.",
      "Transferred To": "none",
      "Hand-off Brief": "",
      "Call Outcome": "Resolved by assistant",
      "Call Time": "2026-10-13T11:02:00+11:00",
      Duration: "2m 05s",
      "Call ID": "seed-0002",
    },
    {
      "Caller ID": "CALL-0003",
      Number: "0401 778 332",
      "Product Serial Number": "",
      Issue: "Warranty terms for a two-year-old Horizon treadmill",
      Resolution: "Explained 5-year frame and motor, 2-year parts, 1-year labour cover",
      "Call Summary":
        "Caller wanted to know what their Horizon treadmill warranty still covered after two years. The assistant explained the Horizon terms: five years on the frame and motor, two years on parts and one year on labour, and noted a serial number is needed for any claim.",
      "Transferred To": "none",
      "Hand-off Brief": "",
      "Call Outcome": "Information only",
      "Call Time": "2026-10-13T14:37:00+11:00",
      Duration: "1m 21s",
      "Call ID": "seed-0003",
    },
    {
      "Caller ID": "CALL-0004",
      Number: "0400 123 456",
      "Product Serial Number": "",
      Issue: "Commercial gym (Fitlab Richmond) — three Matrix treadmills down, service contract",
      Resolution: "Transferred straight to the commercial service team with a brief",
      "Call Summary":
        "Fitlab Richmond reported three Matrix treadmills out of action under a service contract. The assistant recognised a commercial, multi-unit, contracted issue, collected the gym name and a callback number, and connected the caller to the commercial service team without making them repeat anything.",
      "Transferred To": "commercial service team",
      "Hand-off Brief":
        "Fitlab Richmond (commercial). 3 x Matrix treadmills down. Service contract: yes. Callback 0400 123 456. Urgency: high — gym floor impacted.",
      "Call Outcome": "Transferred to human",
      "Call Time": "2026-10-14T08:52:00+11:00",
      Duration: "1m 12s",
      "Call ID": "seed-0004",
    },
    {
      "Caller ID": "CALL-0005",
      Number: "0422 908 117",
      "Product Serial Number": "HRZ-220981",
      Issue: "Horizon EX59 treadmill will not start",
      Resolution: "Power, safety key and console cable checked — unresolved, transferred to a technician (in warranty)",
      "Call Summary":
        "Caller's Horizon EX59 had stopped working. The assistant took the model and serial number, walked through the basic checks (power at the wall, safety key seated, console cable connected), confirmed the unit was within its five-year frame and motor warranty, and transferred the caller to the service team with the checks already completed.",
      "Transferred To": "technician",
      "Hand-off Brief":
        "Horizon EX59, serial HRZ-220981, purchased ~2 years ago (in warranty: frame/motor 5y, parts 2y). Fault: will not start. Checks tried: wall power OK, safety key seated, console cable connected. Needs technician.",
      "Call Outcome": "Assisted then transferred",
      "Call Time": "2026-10-14T10:19:00+11:00",
      Duration: "3m 40s",
      "Call ID": "seed-0005",
    },
  ],
};

export const PARTNER_SCHEMA: DbSchema = {
  agent: "partner",
  title: "Partner desk — reseller accounts",
  keyColumn: "Partner",
  writeMode: "update",
  columns: [
    "Partner",
    "Contact",
    "Email",
    "Mobile",
    "Open Orders",
    "Call Summary",
    "Last Call",
    "Call Outcome",
    "Call ID",
  ],
  displayColumns: ["Partner", "Contact", "Email", "Mobile", "Open Orders", "Last Call"],
  detailColumns: ["Call Summary", "Call Outcome", "Call ID"],
  seedRows: [
    {
      Partner: "Sydney Fitness Solutions",
      Contact: "David Miller",
      Email: "david@sydneyfitness.example",
      Mobile: "ends 284",
      "Open Orders": "3",
      "Call Summary": "",
      "Last Call": "",
      "Call Outcome": "",
      "Call ID": "",
    },
    {
      Partner: "Brisbane Gym Supplies",
      Contact: "Rachel Nguyen",
      Email: "rachel@brisgymsupplies.example",
      Mobile: "ends 517",
      "Open Orders": "3",
      "Call Summary": "",
      "Last Call": "",
      "Call Outcome": "",
      "Call ID": "",
    },
    {
      Partner: "Melbourne Commercial Fitness",
      Contact: "Tom Harrington",
      Email: "tom@melbcomfit.example",
      Mobile: "ends 902",
      "Open Orders": "3",
      "Call Summary": "",
      "Last Call": "",
      "Call Outcome": "",
      "Call ID": "",
    },
    {
      Partner: "Perth Health Equipment",
      Contact: "Aisha Rahman",
      Email: "aisha@perthhealthequip.example",
      Mobile: "ends 336",
      "Open Orders": "3",
      "Call Summary": "",
      "Last Call": "",
      "Call Outcome": "",
      "Call ID": "",
    },
    {
      Partner: "Adelaide Active Installations",
      Contact: "Mark Kowalski",
      Email: "mark@adelaideactive.example",
      Mobile: "ends 741",
      "Open Orders": "3",
      "Call Summary": "",
      "Last Call": "",
      "Call Outcome": "",
      "Call ID": "",
    },
  ],
};

export function getSchema(agent: AgentKey): DbSchema {
  return agent === "retail" ? RETAIL_SCHEMA : PARTNER_SCHEMA;
}
