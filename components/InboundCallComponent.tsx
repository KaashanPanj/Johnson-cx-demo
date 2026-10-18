/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PhoneOff,
  PhoneIncoming,
  PhoneForwarded,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Headset,
  Truck,
  Bot,
  ClipboardCheck,
} from "lucide-react";
import SoundWaveAnimation from "./SoundWaveAnimation";
import { getDemo, type DemoMode, type AgentKey } from "@/lib/agents";
import { getSchema, type DbRow } from "@/lib/schema";
import { formatDuration } from "@/lib/datetime";
import { getOverlay, overlayAppend, overlayPatch } from "@/lib/local-overlay";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "connecting" | "in-call" | "post-call" | "error";

interface UltravoxSessionI {
  addEventListener: (event: string, cb: (data: any) => void) => void;
  joinCall: (url: string) => Promise<void>;
  leaveCall: () => Promise<void>;
  registerToolImplementation: (name: string, impl: (params: Record<string, any>) => any) => void;
  transcripts?: { text: string; isFinal: boolean; speaker: string; timestamp: number }[];
  status?: string;
}

interface LiveTranscript {
  text: string;
  isFinal: boolean;
  speaker: string;
  timestamp: number;
}

interface TranscriptMessage {
  role: string;
  text: string;
}

interface CallObject {
  callId: string;
  joined?: string;
  ended?: string;
  endReason?: string;
  summary?: string;
}

/** The AI support agent's live prompt + tools, fetched server-side for tab 2. */
interface SupportStage {
  systemPrompt: string;
  selectedTools: unknown[];
}

/** What the IVR decided when it called routeCall. */
interface RouteInfo {
  intent: string;
  department: string;
  handledBy: "Human team" | "AI agent";
  callerSummary: string;
  urgency: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CASE_TOOL: Record<AgentKey, string> = { retail: "recordRetailCase", partner: "recordPartnerCase" };
const CASE_FIELD_LABELS: Record<string, string> = {
  issue: "Issue",
  resolution: "Resolution",
  transferred_to: "Transferred to",
  outcome: "Outcome",
  handoff_brief: "Hand-off brief",
  product_serial: "Serial number",
  caller_phone: "Callback number",
  partner_name: "Partner",
  partner_email: "Email",
  contact_name: "Contact",
  order_number: "Order",
  delivery_status_given: "Delivery status",
  priority_request_ref: "Priority request",
};

function cleanParams(params: Record<string, any> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params || {})) out[k] = v == null ? "" : String(v);
  return out;
}

/** Maps the tool's snake_case parameters onto the same shape /api/extract returns. */
function caseToExtraction(db: AgentKey, c: Record<string, string>): Record<string, string | null> {
  const v = (k: string) => (c[k] && c[k].trim() ? c[k].trim() : null);
  if (db === "retail") {
    return {
      callerPhone: v("caller_phone"),
      productSerial: v("product_serial"),
      issue: v("issue"),
      resolution: v("resolution"),
      transferredTo: v("transferred_to") ?? "none",
      handoffBrief: v("handoff_brief"),
      callOutcome: v("outcome"),
    };
  }
  return {
    partnerName: v("partner_name"),
    partnerEmail: v("partner_email"),
    contactName: v("contact_name"),
    orderDiscussed: v("order_number"),
    deliveryStatusGiven: v("delivery_status_given"),
    priorityRequestRef: v("priority_request_ref"),
    callOutcome: v("outcome"),
  };
}

/** Safety net for the partner desk: match what the caller said against the known partners. */
function matchPartnerFromTranscript(transcript: TranscriptMessage[], partners: DbRow[]): DbRow | null {
  const text = transcript
    .filter((t) => t.role === "MESSAGE_ROLE_USER")
    .map((t) => t.text.toLowerCase())
    .join(" ");
  if (!text.trim()) return null;
  for (const p of partners) {
    const name = (p.Partner || "").toLowerCase();
    const words = name.split(/\s+/).filter(Boolean);
    const email = (p.Email || "").toLowerCase();
    const contact = (p.Contact || "").toLowerCase();
    if (
      (name && text.includes(name)) ||
      (words.length >= 2 && text.includes(words.slice(0, 2).join(" "))) ||
      (email && text.includes(email)) ||
      (contact && text.includes(contact))
    ) {
      return p;
    }
  }
  return null;
}

function computeOutcome(db: AgentKey, endReason: string, customerTurns: number, aiOutcome: string | null | undefined): string {
  switch (endReason) {
    case "unjoined":
      return "Not connected";
    case "hangup":
      if (customerTurns === 0) return "Caller hung up before speaking";
      return aiOutcome ?? "Caller hung up early";
    case "agent_hangup":
      if (customerTurns === 0) return "No engagement";
      return aiOutcome ?? (db === "retail" ? "Resolved by assistant" : "Status given");
    case "timeout":
      return customerTurns === 0 ? "No answer / silence" : "Conversation stalled";
    case "connection_error":
    case "system_error":
      return "Call failed (technical)";
    default:
      return aiOutcome ?? "Unknown";
  }
}

/** The line the IVR says when it hands a call to a human team (returned to the agent as the tool result). */
function humanRouteLine(info: RouteInfo): string {
  const opener =
    info.urgency === "urgent"
      ? `Thanks, I'll get you straight to our ${info.department} team.`
      : `Thanks, that's one for our ${info.department} team.`;
  return `${opener} I'm connecting you now, and I'll pass on what you've told me so you won't have to repeat it.`;
}

/** Turns the live support-agent prompt into the second stage of the same call. */
function buildSupportPrompt(base: string, info: RouteInfo): string {
  // Drop the "Starting the call." paragraph: the caller has already been greeted by the IVR step.
  const withoutGreeting = base.replace(/\n\s*Starting the call\.[\s\S]*?(?=\n\s*\n)/, "\n");
  const context =
    `Context for this call: you already answered this call as the receptionist, greeted the caller and asked why they were calling. ` +
    `They said they are calling about: ${info.intent || "a support question"}. ${info.callerSummary} ` +
    `Do not greet them again or introduce yourself again. Pick up from here and help them.`;
  return `${context}\n\n${withoutGreeting.trim()}`;
}

const POST_CALL_STEPS = [
  "Fetching call summary from Ultravox…",
  "Fetching transcript…",
  "Collecting the case details…",
  "Writing to the Customer DB…",
  "Opening the Customer DB…",
];

function PostCallProgress({ step }: { step: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-1 text-center">
        <p className="font-medium text-foreground">Processing call…</p>
        <p className="text-sm text-muted-foreground">{POST_CALL_STEPS[step] ?? "Finishing up…"}</p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {POST_CALL_STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                i < step ? "bg-green-500" : i === step ? "animate-pulse bg-primary" : "bg-muted"
              }`}
            >
              {i < step && <CheckCircle className="h-3 w-3 text-white" />}
            </div>
            <span
              className={`text-xs ${
                i < step ? "text-green-600" : i === step ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InboundCallComponent({ mode }: { mode: DemoMode }) {
  const router = useRouter();
  const demo = getDemo(mode);
  const dbKey: AgentKey = demo.db;
  const schema = getSchema(dbKey);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [postCallStep, setPostCallStep] = useState(0);
  const [callerId, setCallerId] = useState<string>("");
  const [loggedCase, setLoggedCase] = useState<Record<string, string> | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [stageSwitched, setStageSwitched] = useState(false);

  const ultravoxRef = useRef<UltravoxSessionI | null>(null);
  const callIdRef = useRef("");
  const callerIdRef = useRef("");
  const caseRef = useRef<Record<string, string> | null>(null);
  const routeRef = useRef<RouteInfo | null>(null);
  const supportStageRef = useRef<SupportStage | null>(null);
  const callEndGuard = useRef(false);
  const initStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = transcriptContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveTranscripts]);

  // ── Post-call pipeline ────────────────────────────────────────────────────
  const runPostCallWorkflow = useCallback(
    async (callId: string) => {
      setPhase("post-call");

      // Step 0: summary (ready ~2–5 s after the call ends — poll briefly)
      setPostCallStep(0);
      let callObj: CallObject | null = null;
      for (let i = 0; i < 7; i++) {
        try {
          const r = await fetch(`/api/calls/status?callId=${callId}`);
          const d = await r.json();
          callObj = d;
          if (d.summary && String(d.summary).trim()) break;
        } catch {
          /* keep polling */
        }
        if (i < 6) await delay(1500);
      }
      const summary = callObj?.summary ?? "";
      const endReason = callObj?.endReason ?? "unknown";
      const joinedMs = callObj?.joined ? new Date(callObj.joined).getTime() : 0;
      const endedMs = callObj?.ended ? new Date(callObj.ended).getTime() : 0;
      const callTimestamp = callObj?.ended ?? new Date().toISOString();
      const durationSec = endedMs && joinedMs ? Math.round((endedMs - joinedMs) / 1000) : 0;

      // Step 1: transcript
      setPostCallStep(1);
      let transcriptArray: TranscriptMessage[] = [];
      try {
        const r = await fetch(`/api/calls/transcripts?callId=${callId}`);
        const d = await r.json();
        if (Array.isArray(d.transcripts)) transcriptArray = d.transcripts;
      } catch {
        /* continue without transcript */
      }
      const customerTurns = transcriptArray.filter(
        (t) => t.role === "MESSAGE_ROLE_USER" && t.text.trim().length > 0
      ).length;

      // Step 2: structured fields. First choice: what the agent logged itself through the
      // recordCase tool. For IVR calls routed to a human team the route itself is the record.
      // Fallback: OpenAI extraction (non-fatal; blank without a key).
      setPostCallStep(2);
      const r = routeRef.current;
      const humanRouted = r?.handledBy === "Human team";
      let ai: any = caseRef.current ? caseToExtraction(dbKey, caseRef.current) : null;
      if (!ai && !humanRouted) {
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: dbKey, transcriptArray, summary, endReason, customerTurns }),
          });
          const d = await res.json();
          if (d.success && d.data) ai = d.data;
        } catch {
          /* AI failed — continue with blanks */
        }
      }
      if (dbKey === "partner" && !ai?.partnerName) {
        const hit = matchPartnerFromTranscript(transcriptArray, schema.seedRows);
        if (hit) ai = { ...(ai || {}), partnerName: hit.Partner, partnerEmail: hit.Email };
      }

      const outcome =
        humanRouted && customerTurns > 0 && !["connection_error", "system_error"].includes(endReason)
          ? "Routed to human team"
          : computeOutcome(dbKey, endReason, customerTurns, ai?.callOutcome ?? null);

      // Step 3: write to the customer DB
      setPostCallStep(3);
      let highlightKey = "";

      if (dbKey === "retail") {
        const transferred =
          ai?.transferredTo && ai.transferredTo !== "none" ? ai.transferredTo : humanRouted ? r!.department : "none";
        const row: DbRow = {
          "Caller ID": callerIdRef.current,
          Intent: r?.intent ?? "",
          "Routed To": r ? (r.handledBy === "AI agent" ? "AI support agent" : r.department) : "",
          "Handled By": r ? r.handledBy : "",
          Issue: ai?.issue ?? r?.callerSummary ?? (customerTurns === 0 ? "No issue stated — caller didn't speak" : ""),
          Resolution: ai?.resolution ?? (humanRouted ? `Routed to the ${r!.department} team with the reason attached` : ""),
          "Call Summary": summary,
          "Hand-off Brief": ai?.handoffBrief ?? (humanRouted ? r!.callerSummary : ""),
          "Transferred To": transferred,
          Number: ai?.callerPhone ?? "",
          "Product Serial Number": ai?.productSerial ?? "",
          "Call Outcome": outcome,
          "Call Time": callTimestamp,
          Duration: formatDuration(durationSec),
          "Call ID": callId,
        };
        highlightKey = row["Caller ID"];
        try {
          const res = await fetch("/api/db/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: "retail", row }),
          });
          const d = await res.json();
          if (!d.success) overlayAppend("retail", row);
        } catch {
          overlayAppend("retail", row);
        }
      } else {
        const patch: DbRow = {
          "Call Summary": summary,
          "Order Discussed": ai?.orderDiscussed ?? "",
          "Priority Request": ai?.priorityRequestRef ?? "",
          "Last Call": callTimestamp,
          "Call Outcome": outcome,
          "Call ID": callId,
        };
        const match = { partnerName: ai?.partnerName ?? null, partnerEmail: ai?.partnerEmail ?? null };
        let written: DbRow | null = null;
        try {
          const res = await fetch("/api/db/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: "partner", patch, match }),
          });
          const d = await res.json();
          if (d.success && d.row) written = d.row as DbRow;
        } catch {
          /* fall through to local overlay */
        }
        if (written) {
          highlightKey = written.Partner || "";
        } else {
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const name = norm(match.partnerName || "");
          const email = (match.partnerEmail || "").trim().toLowerCase();
          const seed = schema.seedRows.find((row) => {
            const rn = norm(row.Partner || "");
            const re = (row.Email || "").trim().toLowerCase();
            return (email && re === email) || (name && rn && (rn === name || rn.includes(name) || name.includes(rn)));
          });
          if (seed) {
            overlayPatch("partner", seed.Partner, patch);
            highlightKey = seed.Partner;
          } else {
            const row: DbRow = Object.fromEntries(schema.columns.map((c) => [c, ""]));
            row.Partner = match.partnerName || "Unverified caller";
            row.Email = match.partnerEmail || "";
            Object.assign(row, patch);
            overlayAppend("partner", row);
            highlightKey = row.Partner;
          }
        }
      }

      // Step 4: land on the Customer DB with the row highlighted
      setPostCallStep(4);
      await delay(400);
      router.push(`/?tab=db&agent=${dbKey}&highlight=${encodeURIComponent(highlightKey)}`);
    },
    [dbKey, router, schema]
  );

  // ── Call initiation ───────────────────────────────────────────────────────
  const initiateCall = useCallback(async () => {
    callEndGuard.current = false;
    setPhase("connecting");

    if (!demo.agentId) {
      setErrorMsg(`No Ultravox agent ID configured for this demo. Set ${demo.agentEnv}.`);
      setPhase("error");
      return;
    }

    try {
      // Inbound calls table: assign the next Caller ID (sheet count, bumped past any session-only rows).
      let nextCallerId = "";
      if (dbKey === "retail") {
        try {
          const r = await fetch("/api/db/rows?agent=retail", { cache: "no-store" });
          const d = await r.json();
          nextCallerId = d.nextCallerId || "";
        } catch {
          /* fall back below */
        }
        const overlayMax = getOverlay("retail")
          .appended.map((r) => parseInt(String(r["Caller ID"] || "").replace(/\D/g, ""), 10))
          .filter((n) => !Number.isNaN(n))
          .reduce((a, b) => Math.max(a, b), 0);
        const serverNum = parseInt(nextCallerId.replace(/\D/g, ""), 10) || 1;
        const n = Math.max(serverNum, overlayMax + 1);
        nextCallerId = `CALL-${String(n).padStart(4, "0")}`;
        callerIdRef.current = nextCallerId;
        setCallerId(nextCallerId);
      }

      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, metadata: nextCallerId ? { callerId: nextCallerId } : {} }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Failed to create call");
      }
      const callData = await res.json();
      callIdRef.current = callData.callId;
      supportStageRef.current =
        callData.supportStage && callData.supportStage.systemPrompt ? (callData.supportStage as SupportStage) : null;

      const { UltravoxSession } = await import("ultravox-client");
      if (!mountedRef.current) return;

      const session = new UltravoxSession() as any as UltravoxSessionI;
      ultravoxRef.current = session;

      // ── Tools the agent can call in the browser ──
      if (dbKey === "retail") {
        // The IVR's routing decision. In tab 1 every call goes to a human team; in tab 2 simple
        // queries switch the same call into the AI support stage (same voice, new instructions).
        session.registerToolImplementation("routeCall", (params) => {
          const p = cleanParams(params);
          const department = p.department || "Home Customer Support";
          const stage = supportStageRef.current;
          const toAi = mode === "support" && p.handled_by === "ai agent" && !!stage;
          const info: RouteInfo = {
            intent: p.intent || "",
            department,
            handledBy: toAi ? "AI agent" : "Human team",
            callerSummary: p.caller_summary || "",
            urgency: p.urgency || "normal",
          };
          routeRef.current = info;
          setRoute(info);
          if (toAi && stage) {
            setStageSwitched(true);
            const body = {
              systemPrompt: buildSupportPrompt(stage.systemPrompt, info),
              selectedTools: stage.selectedTools,
              toolResultText:
                `(New stage) You are now Mia, the AI support assistant, continuing the same call. ` +
                `The caller is calling about: ${info.intent}. ${info.callerSummary} ` +
                `Tell the caller this is something you can help with right now, then help them. ` +
                `Do not greet them or introduce yourself again.`,
            };
            return { result: JSON.stringify(body), responseType: "new-stage" };
          }
          return {
            result:
              `Route confirmed: ${department}, handled by a person. Say to the caller: "${humanRouteLine(info)}" ` +
              `Then end the call with the hangUp tool.`,
            responseType: "tool-response",
          };
        });
      }
      // The agent logs the case itself: receive the fields the moment it calls the tool.
      session.registerToolImplementation(CASE_TOOL[dbKey], (params) => {
        const clean = cleanParams(params);
        caseRef.current = clean;
        setLoggedCase(clean);
        return "Case recorded.";
      });

      session.addEventListener("status", async () => {
        const s = session.status;
        if (s === "idle" || s === "listening" || s === "thinking" || s === "speaking") {
          setPhase("in-call");
        } else if (s === "disconnected") {
          if (!callEndGuard.current && callIdRef.current) {
            callEndGuard.current = true;
            await runPostCallWorkflow(callIdRef.current);
          }
        } else if (s === "connecting") {
          setPhase("connecting");
        }
      });

      session.addEventListener("error", (e: any) => {
        console.error("Ultravox error:", e);
        setErrorMsg(e?.error?.message || "Call error occurred");
        setPhase("error");
      });

      session.addEventListener("transcripts", () => {
        if (Array.isArray(session.transcripts)) {
          setLiveTranscripts(
            session.transcripts.map((t: any) => ({
              text: t.text || "",
              isFinal: Boolean(t.isFinal),
              speaker: t.speaker || "user",
              timestamp: t.timestamp || Date.now(),
            }))
          );
        }
      });

      if (!mountedRef.current) {
        await session.leaveCall().catch(() => {});
        ultravoxRef.current = null;
        return;
      }
      await session.joinCall(callData.joinUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to start call");
      setPhase("error");
    }
  }, [demo, dbKey, mode, runPostCallWorkflow]);

  // Auto-start on mount (guarded against StrictMode double-invocation)
  useEffect(() => {
    mountedRef.current = true;
    if (!initStartedRef.current) {
      initStartedRef.current = true;
      initiateCall();
    }
    return () => {
      mountedRef.current = false;
      if (ultravoxRef.current) {
        ultravoxRef.current.leaveCall().catch(() => {});
        ultravoxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHangup = async () => {
    if (ultravoxRef.current) {
      await ultravoxRef.current.leaveCall().catch(() => {});
      ultravoxRef.current = null;
    }
    if (!callEndGuard.current && callIdRef.current) {
      callEndGuard.current = true;
      await runPostCallWorkflow(callIdRef.current);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const Icon = mode === "partner" ? Truck : mode === "ivr" ? PhoneForwarded : Headset;
  const lineLabel =
    mode === "partner" ? "Reseller partner line (inbound)" : mode === "ivr" ? "Customer line · AI-enabled IVR" : "Customer line · AI-enabled IVR + AI support";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/?tab=${mode}`)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl font-semibold text-navy">Inbound call · {demo.title}</h1>
      </div>

      <div className="flex w-full flex-col gap-6 lg:flex-row">
        {/* Left: agent + controls */}
        <div className="w-full lg:w-[34%]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-base">{demo.persona}</CardTitle>
                  <CardDescription>{demo.tagline}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                {phase === "connecting" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    <PhoneIncoming className="h-3 w-3 animate-pulse" /> Incoming call · connecting
                  </span>
                )}
                {phase === "in-call" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live call
                  </span>
                )}
                {phase === "post-call" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processing
                  </span>
                )}
                {phase === "error" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
                    <AlertCircle className="h-3 w-3" /> Error
                  </span>
                )}
              </div>

              <dl className="space-y-2 text-sm">
                {dbKey === "retail" && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Caller ID</dt>
                    <dd className="font-mono text-foreground">{callerId || (phase === "error" ? "—" : "assigning…")}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Line</dt>
                  <dd className="text-foreground/80">{lineLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Writes to</dt>
                  <dd className="text-foreground/80">{schema.title}</dd>
                </div>
              </dl>

              {route && (
                <div className="rounded-lg border border-cyan/60 bg-navy p-3 text-white">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan">
                    <PhoneForwarded className="h-3.5 w-3.5" /> Intent recognised
                  </p>
                  <p className="text-sm font-medium leading-snug">{route.intent || "—"}</p>
                  <div className="mt-3 flex items-start gap-2 text-xs">
                    {route.handledBy === "AI agent" ? (
                      <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
                    ) : (
                      <Headset className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
                    )}
                    <span>
                      <span className="text-white/60">Routed to </span>
                      {route.handledBy === "AI agent" ? (
                        <span className="font-semibold">AI support agent · {demo.persona} continues in the same call</span>
                      ) : (
                        <span className="font-semibold">
                          {route.department} · Human team{route.urgency === "urgent" ? " · urgent" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {loggedCase && (
                <div className="rounded-lg border border-cyan/60 bg-navy p-3 text-white">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Case logged by {demo.persona}
                  </p>
                  <dl className="space-y-1 text-xs">
                    {Object.entries(loggedCase)
                      .filter(([, v]) => v && v !== "none")
                      .map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[96px_1fr] gap-2">
                          <dt className="text-white/60">{CASE_FIELD_LABELS[k] || k}</dt>
                          <dd className="leading-snug">{v}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}

              {phase === "in-call" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">Call in progress</p>
                    <SoundWaveAnimation />
                  </div>
                  <Button variant="destructive" className="w-full" onClick={handleHangup}>
                    <PhoneOff className="mr-2 h-4 w-4" /> Hang up
                  </Button>
                </div>
              )}

              {phase === "connecting" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting {demo.persona}…
                </div>
              )}

              {phase === "error" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-600 break-words">{errorMsg}</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => router.push(`/?tab=${mode}`)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: transcript / processing */}
        <div className="w-full lg:w-[66%]">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Live transcript</CardTitle>
                  <CardDescription>Real-time transcription of the call</CardDescription>
                </div>
                {stageSwitched && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/20 px-2.5 py-1 text-xs font-semibold text-navy">
                    <Bot className="h-3 w-3" /> Stage 2 · AI support agent
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(phase === "connecting" || phase === "in-call") && (
                <div ref={transcriptContainerRef} className="h-[500px] space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-4">
                  {liveTranscripts.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <p className="text-center text-sm">
                        {phase === "connecting"
                          ? `Connecting to ${demo.persona}…`
                          : `${demo.persona} will greet you — then speak as the caller.`}
                      </p>
                    </div>
                  ) : (
                    liveTranscripts.map((t, i) => {
                      const isAgent = t.speaker === "agent";
                      return (
                        <div key={i} className={`rounded-lg p-3 ${isAgent ? "ml-8 bg-brand-soft" : "mr-8 bg-cyan/15"}`}>
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isAgent ? "text-deep-purple" : "text-navy"}`}>
                              {isAgent ? demo.persona : "Caller"}
                            </span>
                            <span className="text-xs text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString()}</span>
                            {!t.isFinal && <span className="text-xs italic text-muted-foreground">(speaking…)</span>}
                          </div>
                          <p className="text-sm text-foreground">{t.text}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {phase === "post-call" && (
                <div className="h-[500px]">
                  <PostCallProgress step={postCallStep} />
                </div>
              )}

              {phase === "error" && (
                <div className="flex h-[500px] items-center justify-center">
                  <div className="space-y-2 text-center">
                    <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
                    <p className="text-sm text-muted-foreground">The call could not be completed. Go back and try again.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
