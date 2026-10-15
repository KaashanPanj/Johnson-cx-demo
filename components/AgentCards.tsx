"use client";

import { useRouter } from "next/navigation";
import { PhoneIncoming, Headset, Truck, AlertTriangle } from "lucide-react";
import { AGENTS, type AgentConfig } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AgentCards() {
  const router = useRouter();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {AGENTS.map((agent) => (
        <AgentCard
          key={agent.key}
          agent={agent}
          onCall={() => router.push(`/call?agent=${agent.key}`)}
        />
      ))}
    </div>
  );
}

function AgentCard({ agent, onCall }: { agent: AgentConfig; onCall: () => void }) {
  const Icon = agent.key === "retail" ? Headset : Truck;
  const configured = agent.value.trim() !== "";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg leading-tight">{agent.label}</CardTitle>
              <CardDescription>{agent.tagline}</CardDescription>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan">
            Inbound
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        <p className="text-sm leading-relaxed text-foreground/80">{agent.description}</p>

        {!configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Agent ID not configured — set{" "}
              <code className="rounded bg-white/70 px-1">
                NEXT_PUBLIC_ULTRAVOX_AGENT_{agent.key.toUpperCase()}
              </code>
              .
            </span>
          </div>
        )}

        <div className="mt-auto">
          <Button size="lg" className="w-full gap-2" disabled={!configured} onClick={onCall}>
            <PhoneIncoming className="h-4 w-4" />
            Simulate inbound call
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
