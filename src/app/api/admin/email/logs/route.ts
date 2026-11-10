import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit") ?? 50);
  const take = Number.isInteger(requested) ? Math.min(100, Math.max(1, requested)) : 50;

  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      recipients: true,
      subject: true,
      status: true,
      provider: true,
      messageId: true,
      response: true,
      errorCode: true,
      error: true,
      attempts: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ logs }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
