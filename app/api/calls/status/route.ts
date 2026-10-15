import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("callId");

  if (!callId) {
    return NextResponse.json({ error: "Missing callId parameter" }, { status: 400 });
  }

  const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
  if (!ULTRAVOX_API_KEY) {
    return NextResponse.json({ error: "Missing ULTRAVOX_API_KEY" }, { status: 500 });
  }

  try {
    const response = await fetch(`https://api.ultravox.ai/api/calls/${callId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ULTRAVOX_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Ultravox API error", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch call status", details: String(error) },
      { status: 500 }
    );
  }
}
