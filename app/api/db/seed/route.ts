import { NextResponse } from "next/server";
import { isSheetConfigured, writeSeed } from "@/lib/sheets";
import type { AgentKey } from "@/lib/agents";

/**
 * POST /api/db/seed  { agent: "retail" | "partner" | "all" }
 * Rewrites the tab(s) with headers + seed rows — the "Reset demo data" action.
 */
export async function POST(request: Request) {
  let body: { agent?: AgentKey | "all" } = {};
  try {
    body = await request.json();
  } catch {
    /* default to all */
  }

  if (!isSheetConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google Sheet not configured", reason: "not_configured" },
      { status: 503 }
    );
  }

  const targets: AgentKey[] =
    body.agent === "retail" ? ["retail"] : body.agent === "partner" ? ["partner"] : ["retail", "partner"];

  try {
    for (const agent of targets) await writeSeed(agent);
    return NextResponse.json({ success: true, reset: targets });
  } catch (error) {
    console.error("[db/seed] error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 502 });
  }
}
