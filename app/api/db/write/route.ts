import { NextResponse } from "next/server";
import { isSheetConfigured, appendRow, updateRow } from "@/lib/sheets";
import { getSchema, type DbRow } from "@/lib/schema";
import type { AgentKey } from "@/lib/agents";

/**
 * POST /api/db/write
 * Retail:  { agent: "retail",  row: DbRow }                      → appends a new call-log row.
 * Partner: { agent: "partner", patch: DbRow, match: { partnerName?, partnerEmail? } }
 *          → updates the matched partner's row; if no partner matches, appends a
 *            new row flagged as an unverified caller so nothing is lost.
 * Returns { success, row } where `row` is what the sheet now holds.
 */
export async function POST(request: Request) {
  let body: {
    agent?: AgentKey;
    row?: DbRow;
    patch?: DbRow;
    match?: { partnerName?: string | null; partnerEmail?: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const agent: AgentKey = body.agent === "partner" ? "partner" : "retail";

  if (!isSheetConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google Sheet not configured", reason: "not_configured" },
      { status: 503 }
    );
  }

  try {
    if (agent === "retail") {
      if (!body.row) return NextResponse.json({ success: false, error: "Missing row" }, { status: 400 });
      const row = await appendRow("retail", body.row);
      return NextResponse.json({ success: true, mode: "append", row });
    }

    // Partner: find the verified partner's row.
    const name = (body.match?.partnerName || "").trim().toLowerCase();
    const email = (body.match?.partnerEmail || "").trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    const matcher = (r: DbRow) => {
      const rEmail = String(r.Email || "").trim().toLowerCase();
      const rName = String(r.Partner || "");
      if (email && rEmail && rEmail === email) return true;
      if (name && rName) {
        const a = norm(name);
        const b = norm(rName);
        if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
      }
      return false;
    };

    const patch = body.patch || {};
    const updated = await updateRow("partner", matcher, patch);
    if (updated) return NextResponse.json({ success: true, mode: "update", row: updated });

    // No match → append so the call is still captured.
    const schema = getSchema("partner");
    const fallback: DbRow = Object.fromEntries(schema.columns.map((c) => [c, ""]));
    fallback.Partner = body.match?.partnerName || "Unverified caller";
    fallback.Email = body.match?.partnerEmail || "";
    const row = await appendRow("partner", { ...fallback, ...patch });
    return NextResponse.json({ success: true, mode: "append-unmatched", row });
  } catch (error) {
    console.error("[db/write] error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 502 });
  }
}
