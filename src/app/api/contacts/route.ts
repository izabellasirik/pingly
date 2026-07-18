import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim();
  const upcomingFollowUps = searchParams.get("upcomingFollowUps") === "true";

  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q } },
                { company: { contains: q } },
                { email: { contains: q } },
                { phone: { contains: q } },
                { tags: { contains: q } },
              ],
            }
          : {},
        upcomingFollowUps ? { followUpDate: { not: null } } : {},
      ],
    },
    orderBy: upcomingFollowUps ? { followUpDate: "asc" } : { updatedAt: "desc" },
  });

  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      name,
      phone: body.phone || null,
      email: body.email || null,
      company: body.company || null,
      role: body.role || null,
      notes: body.notes || null,
      tags: body.tags || null,
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
