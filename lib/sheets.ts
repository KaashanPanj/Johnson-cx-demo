// Google Sheet "customer DB" — one tab per agent, via the Sheets API v4 with
// the service account. The app creates and seeds a tab if it's missing or
// empty, so setup is: create a blank sheet, share it with the service-account
// email, set GOOGLE_SHEET_ID.

import { getSheetsClient, hasGoogleCredentials } from "./google";
import { getSchema, type DbRow } from "./schema";
import type { AgentKey } from "./agents";

export function isSheetConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEET_ID) && hasGoogleCredentials();
}

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

export function getTabName(agent: AgentKey): string {
  return agent === "retail"
    ? process.env.SHEET_TAB_RETAIL || "Retail Support"
    : process.env.SHEET_TAB_PARTNER || "Partner Desk";
}

// A1 range helper — quotes the tab name so spaces are safe.
const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function tabExists(tab: string): Promise<boolean> {
  const meta = await getSheetsClient().spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: "sheets.properties.title",
  });
  return (meta.data.sheets || []).some((s) => s.properties?.title === tab);
}

async function createTab(tab: string): Promise<void> {
  await getSheetsClient().spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
}

/** Overwrites the tab with the schema headers + seed rows (also used by "Reset demo data"). */
export async function writeSeed(agent: AgentKey): Promise<void> {
  const schema = getSchema(agent);
  const tab = getTabName(agent);
  const sheets = getSheetsClient();
  if (!(await tabExists(tab))) await createTab(tab);
  await sheets.spreadsheets.values.clear({ spreadsheetId: spreadsheetId(), range: `${q(tab)}!A:Z` });
  const values = [
    schema.columns,
    ...schema.seedRows.map((r) => schema.columns.map((c) => r[c] ?? "")),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${q(tab)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

interface RawTab {
  headers: string[];
  /** All data rows in sheet order (index 0 = sheet row 2). Blank rows kept so indices stay aligned. */
  raw: string[][];
}

async function readRaw(agent: AgentKey): Promise<RawTab> {
  const schema = getSchema(agent);
  const tab = getTabName(agent);
  if (!(await tabExists(tab))) {
    await createTab(tab);
    await writeSeed(agent);
  }
  const res = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${q(tab)}!A1:Z`,
  });
  let values = (res.data.values || []) as string[][];
  if (values.length === 0) {
    await writeSeed(agent);
    values = [schema.columns, ...schema.seedRows.map((r) => schema.columns.map((c) => r[c] ?? ""))];
  }
  return { headers: values[0].map(String), raw: values.slice(1) };
}

function toRow(headers: string[], cells: string[]): DbRow {
  return Object.fromEntries(headers.map((h, i) => [h, String(cells[i] ?? "")]));
}

/** Rows for display (blank rows dropped). */
export async function readRows(agent: AgentKey): Promise<{ headers: string[]; rows: DbRow[] }> {
  const { headers, raw } = await readRaw(agent);
  const rows = raw
    .filter((cells) => cells.some((c) => String(c ?? "").trim() !== ""))
    .map((cells) => toRow(headers, cells));
  return { headers, rows };
}

/** Next sequential Caller ID for the retail log, e.g. CALL-0006. */
export async function nextCallerId(agent: AgentKey): Promise<string> {
  const { rows } = await readRows(agent);
  const nums = rows
    .map((r) => parseInt(String(r["Caller ID"] || "").replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `CALL-${String(next).padStart(4, "0")}`;
}

/** Appends one row (keys = column headers). Returns the row as written. */
export async function appendRow(agent: AgentKey, row: DbRow): Promise<DbRow> {
  const { headers } = await readRaw(agent);
  const cells = headers.map((h) => row[h] ?? "");
  await getSheetsClient().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${q(getTabName(agent))}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [cells] },
  });
  return toRow(headers, cells);
}

/**
 * Updates the first row matching `match` with `patch` (keys = column headers).
 * Returns the merged row, or null if nothing matched.
 */
export async function updateRow(
  agent: AgentKey,
  match: (row: DbRow) => boolean,
  patch: DbRow
): Promise<DbRow | null> {
  const { headers, raw } = await readRaw(agent);
  const idx = raw.findIndex((cells) => match(toRow(headers, cells)));
  if (idx === -1) return null;
  const merged: DbRow = { ...toRow(headers, raw[idx]), ...patch };
  const sheetRow = idx + 2; // 1-based, plus the header row
  await getSheetsClient().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${q(getTabName(agent))}!A${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [headers.map((h) => merged[h] ?? "")] },
  });
  return merged;
}
