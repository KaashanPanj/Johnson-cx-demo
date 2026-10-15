import { NextResponse } from "next/server";
import { richLocalDateTime } from "@/lib/datetime";

/**
 * POST /api/calls — starts an inbound-style in-browser call with one of the
 * Johnson agents. Uses the plain agent-call path, so the agent keeps the tools
 * configured in Ultravox (queryCorpus, hangUp). The only template variable we
 * supply is `current_datetime` (the caller identifies themselves in-call, as a
 * real inbound call would).
 *
 * Body: { agent: <ultravox agent id>, metadata?: Record<string,string>, templateContext?: Record<string,string> }
 */
export async function POST(request: Request) {
  const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
  if (!ULTRAVOX_API_KEY) {
    return NextResponse.json(
      { error: "Missing ULTRAVOX_API_KEY environment variable" },
      { status: 500 }
    );
  }

  let body: { agent?: string; metadata?: Record<string, string>; templateContext?: Record<string, string> } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const agentId = String(body.agent || "").trim();
  if (!agentId) {
    return NextResponse.json(
      {
        error:
          "No Ultravox agent id. Set NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL / NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER.",
      },
      { status: 400 }
    );
  }

  const templateContext: Record<string, string> = {
    ...(body.templateContext || {}),
    current_datetime: richLocalDateTime(),
  };

  // metadata values must be strings and keys must not start with "ultravox."
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.metadata || {})) {
    if (!k.startsWith("ultravox.")) metadata[k] = String(v);
  }

  try {
    const response = await fetch(`https://api.ultravox.ai/api/agents/${agentId}/calls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ULTRAVOX_API_KEY,
      },
      body: JSON.stringify({
        recordingEnabled: true,
        templateContext,
        ...(Object.keys(metadata).length ? { metadata } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ultravox API error:", errorText);
      return NextResponse.json(
        { error: "Error calling Ultravox API", details: `${response.status}: ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /api/calls:", error);
    return NextResponse.json(
      { error: "Error calling Ultravox API", details: String(error) },
      { status: 500 }
    );
  }
}
