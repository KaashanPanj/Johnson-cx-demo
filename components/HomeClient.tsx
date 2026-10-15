"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Database } from "lucide-react";
import AgentCards from "./AgentCards";
import CustomerDbTable from "./CustomerDbTable";
import { AGENTS, type AgentKey } from "@/lib/agents";

export default function HomeClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const tab: "agents" | "db" = sp.get("tab") === "db" ? "db" : "agents";
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
          Two inbound virtual agents for Johnson Health Tech Australia — simulate a call, watch the
          live transcript, and see the result written to the customer DB.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Demo sections" className="flex gap-1 border-b border-border">
        <TabButton active={tab === "agents"} onClick={() => go({ tab: "agents" })} icon={Bot}>
          Virtual Agents
        </TabButton>
        <TabButton active={tab === "db"} onClick={() => go({ tab: "db" })} icon={Database}>
          Customer DB
        </TabButton>
      </div>

      {tab === "agents" ? (
        <AgentCards />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {AGENTS.map((a) => {
              const active = a.key === agent;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => go({ agent: a.key, highlight: null })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-foreground/80 hover:bg-brand-soft"
                  }`}
                >
                  {a.persona} · {a.key === "retail" ? "Retail support" : "Partner desk"}
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
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
