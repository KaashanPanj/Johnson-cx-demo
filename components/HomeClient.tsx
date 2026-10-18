"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Database, PhoneForwarded, Headset, Truck } from "lucide-react";
import DemoCard from "./AgentCards";
import CustomerDbTable from "./CustomerDbTable";
import { DEMOS, type AgentKey, type DemoMode } from "@/lib/agents";

type Tab = DemoMode | "db";
const TAB_ICONS = { ivr: PhoneForwarded, support: Headset, partner: Truck, db: Database } as const;

export default function HomeClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const rawTab = sp.get("tab");
  const tab: Tab = rawTab === "db" || rawTab === "support" || rawTab === "partner" ? rawTab : "ivr";
  const agent: AgentKey = sp.get("agent") === "partner" ? "partner" : "retail";
  const highlight = sp.get("highlight");

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/?${next.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Voice AI demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Route, resolve, assist: three inbound calls for Johnson Health Tech Australia, and the customer
          record each one writes.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Demo sections" className="flex flex-wrap gap-1 border-b border-border">
        {DEMOS.map((d) => (
          <TabButton key={d.mode} active={tab === d.mode} onClick={() => go({ tab: d.mode })} icon={TAB_ICONS[d.mode]}>
            {d.label}
          </TabButton>
        ))}
        <TabButton active={tab === "db"} onClick={() => go({ tab: "db" })} icon={TAB_ICONS.db}>
          Customer DB
        </TabButton>
      </div>

      {tab !== "db" ? (
        <DemoCard mode={tab} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["retail", "partner"] as AgentKey[]).map((a) => {
              const active = a === agent;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => go({ agent: a, highlight: null })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-foreground/80 hover:bg-brand-soft"
                  }`}
                >
                  {a === "retail" ? "Inbound calls · Mia" : "Partner desk · Alex"}
                </button>
              );
            })}
          </div>
          <CustomerDbTable agent={agent} highlightKey={highlight} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
