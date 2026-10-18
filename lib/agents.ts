// Johnson Health Tech demo — three demo modes (tabs) over three Ultravox agents.
//
//   NEXT_PUBLIC_ULTRAVOX_AGENT_IVR      → "Mia" as the AI-enabled IVR (routing only)
//   NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL   → "Mia" as the AI support agent (used as the
//                                         second stage of the same call in tab 2)
//   NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER  → "Alex", the B2B partner delivery desk
// (Agent IDs are not secrets — they're only usable with the server-side API key.)

/** Which customer-DB table a call is written to. */
export type AgentKey = "retail" | "partner";
/** The three demo tabs. */
export type DemoMode = "ivr" | "support" | "partner";

export interface DemoConfig {
  mode: DemoMode;
  /** Ultravox agent that answers the call */
  agentId: string;
  /** env var holding that id (shown when unset) */
  agentEnv: string;
  /** customer-DB table the call writes to */
  db: AgentKey;
  persona: string;
  /** tab label */
  label: string;
  /** card title */
  title: string;
  tagline: string;
  description: string;
  /** what to point out while the call runs */
  watch: string[];
}

export const IVR_AGENT_ID = process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_IVR ?? "";
export const SUPPORT_AGENT_ID = process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_RETAIL ?? "";
export const PARTNER_AGENT_ID = process.env.NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER ?? "";

export const DEMOS: DemoConfig[] = [
  {
    mode: "ivr",
    agentId: IVR_AGENT_ID,
    agentEnv: "NEXT_PUBLIC_ULTRAVOX_AGENT_IVR",
    db: "retail",
    persona: "Mia",
    label: "AI-enabled IVR",
    title: "AI-enabled IVR",
    tagline: "Route: no menu, no buttons",
    description:
      "Replaces the keypad menu. Mia asks what the call is about, understands the intent, says which team she is connecting the caller to, and transfers with the reason attached. She resolves nothing herself.",
    watch: [
      "No menu is read out. The caller just says why they are calling.",
      "Mia names the team she is routing to: Sales, Home Customer Support, Commercial Service or Spare Parts and Service.",
      "The Customer DB logs the intent, the team, and Handled by: Human team.",
    ],
  },
  {
    mode: "support",
    agentId: IVR_AGENT_ID,
    agentEnv: "NEXT_PUBLIC_ULTRAVOX_AGENT_IVR",
    db: "retail",
    persona: "Mia",
    label: "AI-enabled customer support",
    title: "AI-enabled IVR + AI support agent",
    tagline: "Resolve: simple queries never reach a queue",
    description:
      "The same front door, but a simple query is routed to the AI support agent instead of a person, in the same call and the same voice. Delivery status, warranty questions and basic troubleshooting are handled end to end. Anything complex still goes to a human team.",
    watch: [
      "Mia routes the call to herself as the support agent instead of a team.",
      "The answer comes from the order data or Johnson's own knowledge base.",
      "Handled by: AI agent, with the case logged by Mia before she hangs up.",
    ],
  },
  {
    mode: "partner",
    agentId: PARTNER_AGENT_ID,
    agentEnv: "NEXT_PUBLIC_ULTRAVOX_AGENT_PARTNER",
    db: "partner",
    persona: "Alex",
    label: "Virtual agent (B2B)",
    title: "Virtual agent for the partner line",
    tagline: "Assist: a whole ticket, end to end",
    description:
      "Alex answers the reseller line, verifies the partner, finds the order, gives the honest delivery status, spots the installation risk and raises a priority logistics request. The partner's record updates itself.",
    watch: [
      "Verification before any order detail is shared.",
      "Planned versus confirmed delivery, stated plainly.",
      "The partner row updates in place with the order and the priority reference.",
    ],
  },
];

export function getDemo(mode: DemoMode): DemoConfig {
  const d = DEMOS.find((x) => x.mode === mode);
  if (!d) throw new Error(`Unknown demo mode: ${mode}`);
  return d;
}

export function parseMode(v: string | null | undefined): DemoMode {
  return v === "support" || v === "partner" ? v : "ivr";
}

/** Back-compat helpers (DB tables are still keyed by AgentKey). */
export function personaFor(db: AgentKey): string {
  return db === "retail" ? "Mia" : "Alex";
}
