import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWeekStart, parseDateParam } from "@/lib/week";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("weekStart");
  const weekStart = getWeekStart(parseDateParam(raw));
  const tasks = await prisma.weeklyTask.findMany({
    where: { weekStart },
    orderBy: [{ createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const weekStart = getWeekStart(parseDateParam(body.weekStart ?? null));

  const task = await prisma.weeklyTask.create({
    data: { title, weekStart },
  });

  return NextResponse.json(task, { status: 201 });
}
