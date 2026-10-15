/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PhoneOff,
  PhoneIncoming,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Headset,
  Truck,
} from "lucide-react";
import SoundWaveAnimation from "./SoundWaveAnimation";
import { getAgent, type AgentKey } from "@/lib/agents";
import { getSchema, type DbRow } from "@/lib/schema";
import { formatDuration } from "@/lib/datetime";
import { getOverlay, overlayAppend, overlayPatch } from "@/lib/local-overlay";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "connecting" | "in-call" | "post-call" | "error";

interface UltravoxSessionI {
  addEventListener: (event: string, cb: (data: any) => void) => void;
  joinCall: (url: string) => Promise<void>;
  leaveCall: () => Promise<void>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function computeOutcome(
  agentKey: AgentKey,
  endReason: string,
  customerTurns: number,
  aiOutcome: string | null | undefined
): string {
  switch (endReason) {
    case "unjoined":
      return "Not connected";
    case "hangup":
      if (customerTurns === 0) return "Caller hung up before speaking";
      return aiOutcome ?? "Caller hung up early";
    case "agent_hangup":
      if (customerTurns === 0) return "No engagement";
      return aiOutcome ?? (agentKey === "retail" ? "Resolved by assistant" : "Status given");
    case "timeout":
      return customerTurns === 0 ? "No answer / silence" : "Conversation stalled";
    case "connection_error":
    case "system_error":
      return "Call failed (technical)";
    default:
      return aiOutcome ?? "Unknown";
  }
}

const POST_CALL_STEPS = [
  "Fetching call summary from Ultravox…",
  "Fetching transcript…",
  "Analysing the call with AI…",
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
                i < step
                  ? "text-green-600"
                  : i === step
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
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

export default function InboundCallComponent({ agentKey }: { agentKey: AgentKey }) {
  const router = useRouter();
  const agent = getAgent(agentKey);
  const schema = getSchema(agentKey);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscript[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [postCallStep, setPostCallStep] = useState(0);
  const [callerId, setCallerId] = useState<string>("");

  const ultravoxRef = useRef<UltravoxSessionI | null>(null);
  const callIdRef = useRef("");
  const callerIdRef = useRef("");
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

      // Step 2: AI extraction (non-fatal)
      setPostCallStep(2);
      let ai: any = null;
      try {
        const r = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: agentKey, transcriptArray, summary, endReason, customerTurns }),
        });
        const d = await r.json();
        if (d.success && d.data) ai = d.data;
      } catch {
        /* AI failed — continue with blanks */
      }

      const outcome = computeOutcome(agentKey, endReason, customerTurns, ai?.callOutcome ?? null);

      // Step 3: write to the customer DB
      setPostCallStep(3);
      let highlightKey = "";

      if (agentKey === "retail") {
        const row: DbRow = {
          "Caller ID": callerIdRef.current,
          Number: ai?.callerPhone ?? "",
          "Product Serial Number": ai?.productSerial ?? "",
          Issue:
            ai?.issue ?? (customerTurns === 0 ? "No issue stated — caller didn't speak" : ""),
          Resolution: ai?.resolution ?? "",
          "Call Summary": summary,
          "Transferred To": ai?.transferredTo ?? "none",
          "Hand-off Brief": ai?.handoffBrief ?? "",
          "Call Outcome": outcome,
          "Call Time": callTimestamp,
          Duration: formatDuration(durationSec),
          "Call ID": callId,
        };
        highlightKey = row["Caller ID"];
        try {
          const r = await fetch("/api/db/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: "retail", row }),
          });
          const d = await r.json();
          if (!d.success) overlayAppend("retail", row);
        } catch {
          overlayAppend("retail", row);
        }
      } else {
        const patch: DbRow = {
          "Call Summary": summary,
          "Last Call": callTimestamp,
          "Call Outcome": outcome,
          "Call ID": callId,
        };
        const match = { partnerName: ai?.partnerName ?? null, partnerEmail: ai?.partnerEmail ?? null };
        let written: DbRow | null = null;
        try {
          const r = await fetch("/api/db/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: "partner", patch, match }),
          });
          const d = await r.json();
          if (d.success && d.row) written = d.row as DbRow;
        } catch {
          /* fall through to local overlay */
        }
        if (written) {
          highlightKey = written.Partner || "";
        } else {
          // Sheet unavailable: patch the matching seed row in the session overlay.
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const name = norm(match.partnerName || "");
          const email = (match.partnerEmail || "").trim().toLowerCase();
          const seed = schema.seedRows.find((r) => {
            const rn = norm(r.Partner || "");
            const re = (r.Email || "").trim().toLowerCase();
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
      router.push(`/?tab=db&agent=${agentKey}&highlight=${encodeURIComponent(highlightKey)}`);
    },
    [agentKey, router, schema]
  );

  // ── Call initiation ───────────────────────────────────────────────────────
  const initiateCall = useCallback(async () => {
    callEndGuard.current = false;
    setPhase("connecting");

    if (!agent.value) {
      setErrorMsg(
        `No Ultravox agent ID configured for ${agent.persona}. Set NEXT_PUBLIC_ULTRAVOX_AGENT_${agentKey.toUpperCase()}.`
      );
      setPhase("error");
      return;
    }

    try {
      // Retail: assign the next Caller ID (sheet count, bumped past any session-only rows).
      let nextCallerId = "";
      if (agentKey === "retail") {
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
        body: JSON.stringify({
          agent: agent.value,
          metadata: { agentKey, ...(nextCallerId ? { callerId: nextCallerId } : {}) },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Failed to create call");
      }
      const callData = await res.json();
      callIdRef.current = callData.callId;

      const { UltravoxSession } = await import("ultravox-client");
      if (!mountedRef.current) return;

      const session = new UltravoxSession() as any as UltravoxSessionI;
      ultravoxRef.current = session;

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
  }, [agent, agentKey, runPostCallWorkflow]);

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
  const Icon = agentKey === "retail" ? Headset : Truck;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push("/")}>
          <ArrowLeft className="h-4 w-4" /> Agents
        </Button>
        <h1 className="text-xl font-semibold text-navy">
          Inbound call · {agent.label}
        </h1>
      </div>

      <div className="flex w-full flex-col gap-6 lg:flex-row">
        {/* Left: agent + controls */}
        <div className="w-full lg:w-[32%]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-base">{agent.persona}</CardTitle>
                  <CardDescription>{agent.tagline}</CardDescription>
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
                {agentKey === "retail" && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Caller ID
                    </dt>
                    <dd className="font-mono text-foreground">{callerId || (phase === "error" ? "—" : "assigning…")}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Line
                  </dt>
                  <dd className="text-foreground/80">
                    {agentKey === "retail" ? "Consumer support (inbound)" : "Reseller partner desk (inbound)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Writes to
                  </dt>
                  <dd className="text-foreground/80">{schema.title}</dd>
                </div>
              </dl>

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
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting {agent.persona}…
                </div>
              )}

              {phase === "error" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-600 break-words">{errorMsg}</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to agents
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: transcript / processing */}
        <div className="w-full lg:w-[68%]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Live transcript</CardTitle>
              <CardDescription>Real-time transcription of the call</CardDescription>
            </CardHeader>
            <CardContent>
              {(phase === "connecting" || phase === "in-call") && (
                <div
                  ref={transcriptContainerRef}
                  className="h-[500px] space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-4"
                >
                  {liveTranscripts.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <p className="text-center text-sm">
                        {phase === "connecting"
                          ? `Connecting to ${agent.persona}…`
                          : `${agent.persona} will greet you — then speak as the caller.`}
                      </p>
                    </div>
                  ) : (
                    liveTranscripts.map((t, i) => {
                      const isAgent = t.speaker === "agent";
                      return (
                        <div
                          key={i}
                          className={`rounded-lg p-3 ${
                            isAgent ? "ml-8 bg-brand-soft" : "mr-8 bg-cyan/15"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold ${
                                isAgent ? "text-deep-purple" : "text-navy"
                              }`}
                            >
                              {isAgent ? agent.persona : "Caller"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.timestamp).toLocaleTimeString()}
                            </span>
                            {!t.isFinal && (
                              <span className="text-xs italic text-muted-foreground">(speaking…)</span>
                            )}
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
                    <p className="text-sm text-muted-foreground">
                      The call could not be completed. Go back and try again.
                    </p>
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
