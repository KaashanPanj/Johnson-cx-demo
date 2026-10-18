"use client";

import { useSearchParams } from "next/navigation";
import InboundCallComponent from "./InboundCallComponent";
import { parseMode } from "@/lib/agents";

export default function CallPageClient() {
  const sp = useSearchParams();
  const mode = parseMode(sp.get("mode"));
  // key= forces a fresh component (and a fresh call) if the mode changes.
  return <InboundCallComponent key={mode} mode={mode} />;
}
