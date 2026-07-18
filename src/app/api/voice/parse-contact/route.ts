import { NextRequest, NextResponse } from "next/server";
import { parseContactFromText } from "@/lib/parseContact";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const parsed = parseContactFromText(text, new Date());
  return NextResponse.json(parsed);
}
