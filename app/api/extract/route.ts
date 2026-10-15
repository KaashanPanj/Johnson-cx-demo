import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { AgentKey } from "@/lib/agents";

// Per-agent structured extraction from the transcript + Ultravox summary.
// The model is given the deterministic facts (end reason, customer turns) so it
// cannot invent a conversation that didn't happen.

interface TranscriptMessage {
  role: string;
  text: string;
}

export interface RetailExtraction {
  callerPhone: string | null;
  product: string | null;
  productSerial: string | null;
  issue: string | null;
  resolution: string | null;
  transferredTo: "none" | "customer support" | "commercial service team" | "technician" | null;
  handoffBrief: string | null;
  callOutcome: string | null;
}

export interface PartnerExtraction {
  partnerName: string | null;
  partnerEmail: string | null;
  contactName: string | null;
  orderDiscussed: string | null;
  deliveryStatusGiven: string | null;
  priorityRequestRef: string | null;
  callOutcome: string | null;
}

const RETAIL_SCHEMA = {
  type: "object",
  properties: {
    callerPhone: { type: ["string", "null"], description: "Phone number the caller gave, if any" },
    product: { type: ["string", "null"], description: "Brand and model mentioned, if any" },
    productSerial: { type: ["string", "null"], description: "Serial number the caller gave, if any" },
    issue: { type: ["string", "null"], description: "One short line: why they called" },
    resolution: {
      type: ["string", "null"],
      description: "One short line: what was resolved, advised, or agreed (including that it was transferred)",
    },
    transferredTo: {
      type: ["string", "null"],
      enum: ["none", "customer support", "commercial service team", "technician", null],
    },
    handoffBrief: {
      type: ["string", "null"],
      description:
        "Only if transferred: the brief a human agent should see — caller/business, equipment, the issue, checks already tried, warranty position, urgency. Otherwise null",
    },
    callOutcome: {
      type: ["string", "null"],
      enum: [
        "Resolved by assistant",
        "Transferred to human",
        "Assisted then transferred",
        "Information only",
        "Caller hung up early",
        "No engagement",
        "Not connected",
        "Call failed (technical)",
        null,
      ],
    },
  },
  required: [
    "callerPhone",
    "product",
    "productSerial",
    "issue",
    "resolution",
    "transferredTo",
    "handoffBrief",
    "callOutcome",
  ],
  additionalProperties: false,
};

const PARTNER_SCHEMA = {
  type: "object",
  properties: {
    partnerName: { type: ["string", "null"], description: "The reseller business name the caller gave" },
    partnerEmail: { type: ["string", "null"], description: "The business email the caller stated for verification" },
    contactName: { type: ["string", "null"] },
    orderDiscussed: { type: ["string", "null"], description: "Order number discussed, e.g. JHT-AU-48291" },
    deliveryStatusGiven: { type: ["string", "null"], description: "One line: the delivery status the assistant gave" },
    priorityRequestRef: { type: ["string", "null"], description: "Logistics request reference if one was raised, e.g. LOG-48291" },
    callOutcome: {
      type: ["string", "null"],
      enum: [
        "Status given",
        "Priority request raised",
        "Verification failed",
        "Caller hung up early",
        "No engagement",
        "Not connected",
        "Call failed (technical)",
        null,
      ],
    },
  },
  required: [
    "partnerName",
    "partnerEmail",
    "contactName",
    "orderDiscussed",
    "deliveryStatusGiven",
    "priorityRequestRef",
    "callOutcome",
  ],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ success: false, data: null, error: "Missing OPENAI_API_KEY" });
  }

  try {
    const body = await request.json();
    const agent = (body.agent as AgentKey) === "partner" ? "partner" : "retail";
    const transcriptArray: TranscriptMessage[] = Array.isArray(body.transcriptArray) ? body.transcriptArray : [];
    const summary: string = body.summary || "";
    const endReason: string = body.endReason || "unknown";
    const customerTurns: number = Number(body.customerTurns) || 0;

    const transcriptText = transcriptArray
      .filter((t) => t.role === "MESSAGE_ROLE_USER" || t.role === "MESSAGE_ROLE_AGENT")
      .map((t) => `${t.role === "MESSAGE_ROLE_USER" ? "Caller" : "Agent"}: ${t.text}`)
      .join("\n");

    const groundTruth = `GROUND TRUTH (do not contradict these facts):
- End reason: ${endReason}
- Caller spoke: ${customerTurns > 0 ? `Yes (${customerTurns} turns)` : "No (0 turns)"}
If the caller never spoke, every conversation-dependent field must be null. Be concise and factual. Never invent details that are not in the transcript or summary.`;

    const systemPrompt =
      agent === "retail"
        ? `You are a customer-service call analyst for Johnson Health Tech Australia (fitness equipment). The call was between "Mia", an AI support assistant on the inbound retail line, and a caller. Extract structured data.

${groundTruth}

Rules: "transferredTo" is "none" unless the assistant explicitly connected the caller to a person/team. If it did, write "handoffBrief" as the note a human agent would read before picking up. Use "Resolved by assistant" when the assistant fully handled it, "Transferred to human" when it handed off without troubleshooting, "Assisted then transferred" when it helped first and then handed off.`
        : `You are a call analyst for Johnson Health Tech Australia's partner (reseller) desk. The call was between "Alex", an AI assistant, and a reseller partner calling about an order delivery. Extract structured data.

${groundTruth}

Rules: "partnerName" and "partnerEmail" are the business and email the caller stated when verifying (the assistant says "that matches" when verified). If verification failed or never happened, set callOutcome to "Verification failed" where appropriate.`;

    const userPrompt = `TRANSCRIPT:\n${transcriptText || "(no transcript)"}\n\nULTRAVOX SUMMARY:\n${summary || "(no summary)"}`;

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: agent === "retail" ? "retail_call_extraction" : "partner_call_extraction",
          strict: true,
          schema: agent === "retail" ? RETAIL_SCHEMA : PARTNER_SCHEMA,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ success: false, data: null, error: "AI returned no content" });
    }
    return NextResponse.json({ success: true, data: JSON.parse(content) });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json({ success: false, data: null, error: String(error) });
  }
}
