import { NextResponse } from "next/server";
import { isSheetConfigured, readRows, nextCallerId } from "@/lib/sheets";
import { getSchema } from "@/lib/schema";
import type { AgentKey } from "@/lib/agents";

/**
 * GET /api/db/rows?agent=retail|partner
 * Returns the agent's tab (creating + seeding it if needed). When the sheet
 * isn't configured, returns the seed rows with `connected: false` so the UI
 * can still render (writes then fall back to the browser session).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent: AgentKey = searchParams.get("agent") === "partner" ? "partner" : "retail";
  const schema = getSchema(agent);

  if (!isSheetConfigured()) {
    return NextResponse.json({
      success: true,
      connected: false,
      reason: "Google Sheet not configured (GOOGLE_SHEET_ID / service-account credentials missing)",
      headers: schema.columns,
      rows: schema.seedRows,
      nextCallerId: agent === "retail" ? `CALL-${String(schema.seedRows.length + 1).padStart(4, "0")}` : null,
    });
  }

  try {
    const { headers, rows } = await readRows(agent);
    const next = agent === "retail" ? await nextCallerId(agent) : null;
    return NextResponse.json({ success: true, connected: true, headers, rows, nextCallerId: next });
  } catch (error) {
    console.error("[db/rows] error:", error);
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: String(error),
        headers: schema.columns,
        rows: schema.seedRows,
        nextCallerId: agent === "retail" ? `CALL-${String(schema.seedRows.length + 1).padStart(4, "0")}` : null,
      },
      { status: 502 }
    );
  }
}
