import { NextResponse } from "next/server";
import { richLocalDateTime } from "@/lib/datetime";
import { parseMode, type DemoMode } from "@/lib/agents";

/**
 * POST /api/calls — starts an inbound-style in-browser call for one of the three demo modes.
 *
 *   ivr      → an agent call on the AI-enabled IVR agent (routing only), with that agent's voice
 *   support  → a DIRECT call built from the IVR agent's live settings but with the SUPPORT
 *              agent's voice from the first word, so tab 2 sounds like the support agent
 *              throughout. The response also carries the support agent's live prompt + tools
 *              ("supportStage") so the browser can switch the call into the support stage
 *              when the IVR routes a simple query to the AI agent.
 *   partner  → an agent call on Alex, the B2B partner desk
 *
 * Body: { mode: "ivr" | "support" | "partner", metadata?: Record<string,string> }
 */
interface SupportStage {
  systemPrompt: string;
  selectedTools: unknown[];
  /** the support agent's own voice, so the stage switch also carries the voice */
  voice: string | null;
}

interface CallTemplate {
  systemPrompt?: string;
  model?: string;
  voice?: string;
  languageHint?: string;
  temperature?: number;
  firstSpeakerSettings?: unknown;
  selectedTools?: unknown[];
  vadSettings?: unknown;
  inactivityMessages?: unknown[];
  maxDuration?: string;
  joinTimeout?: string;
  timeExceededMessage?: string;
}

const UV = "https://api.ultravox.ai/api";

function agentIdFor(mode: DemoMode): string {
  const env = process.env;
  if (mode === "partner") return env.NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER || "";
  return env.NEXT_PUBLIC_ULTRAVOX_AGENT_IVR || "";
}

async function fetchTemplate(apiKey: string, agentId: string): Promise<CallTemplate | null> {
  if (!agentId) return null;
  try {
    const r = await fetch(`${UV}/agents/${agentId}`, { headers: { "X-API-Key": apiKey }, cache: "no-store" });
    if (!r.ok) return null;
    const a = await r.json();
    return (a?.callTemplate as CallTemplate) || null;
  } catch {
    return null;
  }
}

function toSupportStage(ct: CallTemplate | null): SupportStage | null {
  if (!ct?.systemPrompt) return null;
  return {
    systemPrompt: String(ct.systemPrompt),
    selectedTools: Array.isArray(ct.selectedTools) ? ct.selectedTools : [],
    voice: typeof ct.voice === "string" && ct.voice ? ct.voice : null,
  };
}

/** The agent-call template fields that a direct call accepts, copied verbatim. */
function directCallBody(ivr: CallTemplate, voice: string | null) {
  const body: Record<string, unknown> = {};
  const copy: (keyof CallTemplate)[] = [
    "systemPrompt",
    "model",
    "languageHint",
    "temperature",
    "firstSpeakerSettings",
    "selectedTools",
    "vadSettings",
    "inactivityMessages",
    "maxDuration",
    "joinTimeout",
    "timeExceededMessage",
  ];
  for (const k of copy) {
    const v = ivr[k];
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) body[k] = v;
  }
  if (voice) body.voice = voice;
  else if (ivr.voice) body.voice = ivr.voice;
  return body;
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

  const headers = { "Content-Type": "application/json", "X-API-Key": ULTRAVOX_API_KEY };

  try {
    let supportStage: SupportStage | null = null;
    let response: Response | null = null;
    let path = "agent";

    if (mode === "support") {
      const [ivr, support] = await Promise.all([
        fetchTemplate(ULTRAVOX_API_KEY, agentId),
        fetchTemplate(ULTRAVOX_API_KEY, process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL || ""),
      ]);
      supportStage = toSupportStage(support);
      if (ivr?.systemPrompt) {
        // Direct call: the IVR agent's live settings, voiced by the support agent from the start.
        const direct = directCallBody(ivr, supportStage?.voice ?? null);
        response = await fetch(`${UV}/calls`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...direct, recordingEnabled: true, metadata: { ...metadata, voiceSource: "support-agent" } }),
        });
        path = "direct";
        if (!response.ok) {
          console.error("Direct call failed, falling back to the agent call:", response.status, await response.text());
          response = null;
        }
      }
    }

    if (!response) {
      response = await fetch(`${UV}/agents/${agentId}/calls`, {
        method: "POST",
        headers,
        body: JSON.stringify({ recordingEnabled: true, templateContext, metadata }),
      });
      path = "agent";
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ultravox API error:", errorText);
      return NextResponse.json(
        { error: "Error calling Ultravox API", details: `${response.status}: ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ ...data, mode, path, supportStage });
  } catch (error) {
    console.error("Error in /api/calls:", error);
    return NextResponse.json({ error: "Error calling Ultravox API", details: String(error) }, { status: 500 });
  }
}
