"use client";

import { useRouter } from "next/navigation";
import { PhoneIncoming, Headset, Truck, PhoneForwarded, AlertTriangle, Eye } from "lucide-react";
import { getDemo, type DemoMode } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ICONS = { ivr: PhoneForwarded, support: Headset, partner: Truck } as const;
const STEP = { ivr: "1 · Route", support: "2 · Resolve", partner: "3 · Assist" } as const;

/** One demo tab = one card: what it shows, what to watch, and the call button. */
export default function DemoCard({ mode }: { mode: DemoMode }) {
  const router = useRouter();
  const demo = getDemo(mode);
  const Icon = ICONS[mode];
  const configured = demo.agentId.trim() !== "";

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg leading-tight">{demo.title}</CardTitle>
              <CardDescription>{demo.tagline}</CardDescription>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan">
            {STEP[mode]}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-foreground/80">{demo.description}</p>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> What to watch
          </p>
          <ul className="space-y-1.5 text-sm text-foreground/80">
            {demo.watch.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        {!configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Agent ID not configured. Set <code className="rounded bg-white/70 px-1">{demo.agentEnv}</code>.
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button size="lg" className="gap-2" disabled={!configured} onClick={() => router.push(`/call?mode=${mode}`)}>
            <PhoneIncoming className="h-4 w-4" />
            Simulate inbound call
          </Button>
          <span className="text-xs text-muted-foreground">{demo.persona} answers</span>
        </div>
      </CardContent>
    </Card>
  );
}
