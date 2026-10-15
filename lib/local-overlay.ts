// Browser-session fallback for the customer DB when the Google Sheet isn't
// connected (or a write fails): appended rows and per-row patches are kept in
// sessionStorage and merged over whatever the API returns.

import type { DbRow } from "./schema";
import type { AgentKey } from "./agents";

export interface Overlay {
  appended: DbRow[];
  /** patches keyed by the row's key-column value */
  patches: Record<string, DbRow>;
}

const EMPTY: Overlay = { appended: [], patches: {} };
const storageKey = (agent: AgentKey) => `johnson_db_overlay_${agent}`;

export function getOverlay(agent: AgentKey): Overlay {
  try {
    const raw = sessionStorage.getItem(storageKey(agent));
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(agent: AgentKey, overlay: Overlay): void {
  try {
    sessionStorage.setItem(storageKey(agent), JSON.stringify(overlay));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function overlayAppend(agent: AgentKey, row: DbRow): void {
  const o = getOverlay(agent);
  o.appended = [...o.appended, row];
  save(agent, o);
}

export function overlayPatch(agent: AgentKey, keyValue: string, patch: DbRow): void {
  const o = getOverlay(agent);
  o.patches = { ...o.patches, [keyValue]: { ...(o.patches[keyValue] || {}), ...patch } };
  save(agent, o);
}

export function clearOverlay(agent: AgentKey): void {
  try {
    sessionStorage.removeItem(storageKey(agent));
  } catch {
    /* ignore */
  }
}

/** Applies patches to matching rows, then appends the overlay-only rows. */
export function applyOverlay(rows: DbRow[], keyColumn: string, overlay: Overlay): DbRow[] {
  const patched = rows.map((r) => {
    const p = overlay.patches[r[keyColumn]];
    return p ? { ...r, ...p } : r;
  });
  return [...patched, ...overlay.appended];
}
