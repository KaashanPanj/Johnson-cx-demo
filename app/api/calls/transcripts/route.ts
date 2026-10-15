import { NextResponse } from "next/server";

// Ultravox message structure (GET /api/calls/{callId}/messages)
interface UltraVoxMessage {
  role: string;
  text: string;
  timespan?: {
    start: string;
    end: string;
  };
  callStageId?: string;
  medium?: string;
}

interface FormattedTranscript {
  role: string;
  text: string;
  timestamp: string | null;
  duration: number | null;
  callStageId: string | null;
  medium: string | null;
}

function formatTranscripts(messages: UltraVoxMessage[]): FormattedTranscript[] {
  return messages
    .filter((message) => message.text && message.text.trim())
    .map((message) => ({
      role: message.role,
      text: message.text,
      timestamp: message.timespan?.start || null,
      duration: message.timespan
        ? (new Date(message.timespan.end).getTime() -
            new Date(message.timespan.start).getTime()) /
          1000
        : null,
      callStageId: message.callStageId || null,
      medium: message.medium || null,
    }));
}

/**
 * GET /api/calls/transcripts?callId=...
 * Returns the call's messages from Ultravox, formatted for the post-call
 * pipeline. (The upstream Make.com push and hardcoded fallbacks were removed
 * in this fork — nothing leaves the app from here.)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("callId");

  if (!callId) {
    return NextResponse.json({ error: "Missing callId parameter" }, { status: 400 });
  }

  const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
  if (!ULTRAVOX_API_KEY) {
    return NextResponse.json(
      { error: "Missing ULTRAVOX_API_KEY environment variable" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.ultravox.ai/api/calls/${callId}/messages`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": ULTRAVOX_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: `Ultravox API error: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Note: the messages endpoint is paginated; demo calls fit in one page.
    const rawMessages: UltraVoxMessage[] = data.results || [];
    const formatted = formatTranscripts(rawMessages);

    return NextResponse.json({
      success: true,
      callId,
      transcripts: formatted,
      rawTranscripts: rawMessages,
      totalMessages: rawMessages.length,
      validTranscripts: formatted.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Error fetching call transcripts",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
