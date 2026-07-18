import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!note) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const date = body.date ? new Date(body.date) : new Date();

  const [interaction] = await prisma.$transaction([
    prisma.interaction.create({ data: { contactId: id, note, date } }),
    prisma.contact.update({ where: { id }, data: { lastContactedAt: date } }),
  ]);

  return NextResponse.json(interaction, { status: 201 });
}
