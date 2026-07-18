import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { parseDateParam } from "@/lib/week";

export async function GET(request: NextRequest) {
  const date = parseDateParam(request.nextUrl.searchParams.get("date"));
  const tasks = await prisma.dailyTask.findMany({
    where: { date: { gte: date, lt: addDays(date, 1) } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (body.priority !== "HIGH" && body.priority !== "LOW") {
    return NextResponse.json({ error: "Priority must be HIGH or LOW" }, { status: 400 });
  }

  const date = parseDateParam(body.date ?? null);

  const task = await prisma.dailyTask.create({
    data: { title, priority: body.priority, date },
  });

  return NextResponse.json(task, { status: 201 });
}
