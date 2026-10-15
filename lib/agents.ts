// Johnson Health Tech demo — the two inbound virtual agents.
//
// Ultravox agent IDs come from env so they can be swapped without a code change:
//   NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL   → "Mia", the AI-powered retail IVR
//   NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER  → "Alex", the B2B reseller delivery desk
// (Agent IDs are not secrets — they're only usable with the server-side API key.)

export type AgentKey = "retail" | "partner";

export interface AgentConfig {
  key: AgentKey;
  /** Ultravox agent ID */
  value: string;
  label: string;
  persona: string;
  tagline: string;
  description: string;
}

export const AGENTS: AgentConfig[] = [
  {
    key: "retail",
    value: process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL ?? "",
    label: "Mia — Retail Support",
    persona: "Mia",
    tagline: "AI-powered IVR for the consumer line",
    description:
      "Takes every call on the consumer support line, so callers never sit in a queue or press through a menu. Delivery, warranty and troubleshooting questions are resolved on the spot, and anything that needs a person is handed over with the details already captured.",
  },
  {
    key: "partner",
    value: process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER ?? "",
    label: "Alex — Partner Delivery Desk",
    persona: "Alex",
    tagline: "B2B reseller line",
    description:
      "Gives reseller partners an instant answer on where their order is, without waiting for someone in the office to check. Delivery dates are confirmed on the call, and any order at risk is raised with logistics as a priority follow-up.",
  },
];

export function getAgent(key: AgentKey): AgentConfig {
  const agent = AGENTS.find((a) => a.key === key);
  if (!agent) throw new Error(`Unknown agent key: ${key}`);
  return agent;
}

export function getAgentById(id: string): AgentConfig | undefined {
  return AGENTS.find((a) => a.value === id);
}
