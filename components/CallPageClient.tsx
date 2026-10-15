"use client";

import { useSearchParams } from "next/navigation";
import InboundCallComponent from "./InboundCallComponent";
import type { AgentKey } from "@/lib/agents";

export default function CallPageClient() {
  const sp = useSearchParams();
  const agentKey: AgentKey = sp.get("agent") === "partner" ? "partner" : "retail";
  // key= forces a fresh component (and a fresh call) if the agent changes.
  return <InboundCallComponent key={agentKey} agentKey={agentKey} />;
}
