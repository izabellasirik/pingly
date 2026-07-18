import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { interactions: { orderBy: { date: "desc" } } },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(contact);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  for (const field of ["name", "phone", "email", "company", "role", "notes", "tags"] as const) {
    if (field in body) data[field] = body[field] || null;
  }
  if ("followUpDate" in body) {
    data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
  }
  if ("lastContactedAt" in body) {
    data.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;
  }

  if (typeof data.name === "string" && data.name.trim() === "") {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.update({ where: { id }, data });
    return NextResponse.json(contact);
  } catch {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
}
