import { NextResponse } from "next/server";
import { richLocalDateTime } from "@/lib/datetime";
import { parseMode, type DemoMode } from "@/lib/agents";

/**
 * POST /api/calls — starts an inbound-style in-browser call for one of the three demo modes.
 *
 *   ivr      → the AI-enabled IVR agent (routing only)
 *   support  → the same IVR agent; the response also carries the AI support agent's live
 *              prompt + tools ("supportStage") so the browser can switch the call into a
 *              new stage when the IVR routes a simple query to the AI agent
 *   partner  → Alex, the B2B partner desk
 *
 * Body: { mode: "ivr" | "support" | "partner", metadata?: Record<string,string> }
 * (legacy: { agent: <ultravox agent id> } is still accepted)
 */
interface SupportStage {
  systemPrompt: string;
  selectedTools: unknown[];
}

const UV = "https://api.ultravox.ai/api";

function agentIdFor(mode: DemoMode): string {
  const env = process.env;
  if (mode === "partner") return env.NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER || "";
  return env.NEXT_PUBLIC_ULTRAVOX_AGENT_IVR || "";
}

async function fetchSupportStage(apiKey: string): Promise<SupportStage | null> {
  const id = process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL || "";
  if (!id) return null;
  try {
    const r = await fetch(`${UV}/agents/${id}`, { headers: { "X-API-Key": apiKey }, cache: "no-store" });
    if (!r.ok) return null;
    const a = await r.json();
    const ct = a?.callTemplate || {};
    if (!ct.systemPrompt) return null;
    return { systemPrompt: String(ct.systemPrompt), selectedTools: Array.isArray(ct.selectedTools) ? ct.selectedTools : [] };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
  if (!ULTRAVOX_API_KEY) {
    return NextResponse.json({ error: "Missing ULTRAVOX_API_KEY environment variable" }, { status: 500 });
  }

  let body: { mode?: string; agent?: string; metadata?: Record<string, string>; templateContext?: Record<string, string> } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const mode = parseMode(body.mode);
  const agentId = String(body.agent || agentIdFor(mode)).trim();
  if (!agentId) {
    return NextResponse.json(
      { error: `No Ultravox agent id for mode "${mode}". Set NEXT_PUBLIC_ULTRAVOX_AGENT_IVR / NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER.` },
      { status: 400 }
    );
  }

  const templateContext: Record<string, string> = {
    ...(body.templateContext || {}),
    current_datetime: richLocalDateTime(),
  };

  // metadata values must be strings and keys must not start with "ultravox."
  const metadata: Record<string, string> = { mode };
  for (const [k, v] of Object.entries(body.metadata || {})) {
    if (!k.startsWith("ultravox.")) metadata[k] = String(v);
  }

  try {
    const [response, supportStage] = await Promise.all([
      fetch(`${UV}/agents/${agentId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": ULTRAVOX_API_KEY },
        body: JSON.stringify({ recordingEnabled: true, templateContext, metadata }),
      }),
      mode === "support" ? fetchSupportStage(ULTRAVOX_API_KEY) : Promise.resolve(null),
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ultravox API error:", errorText);
      return NextResponse.json(
        { error: "Error calling Ultravox API", details: `${response.status}: ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ ...data, mode, supportStage });
  } catch (error) {
    console.error("Error in /api/calls:", error);
    return NextResponse.json({ error: "Error calling Ultravox API", details: String(error) }, { status: 500 });
  }
}
