import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { batchId } = await params;
  if (!/^LOT-\d{8}-[A-F0-9]{6}$/i.test(batchId)) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  const batch = await prisma.labelBatch.findUnique({ where: { batchId } });
  if (!batch) return NextResponse.json({ error: "Lote desconocido." }, { status: 404 });

  // El estado se lee siempre desde MongoDB; no se deduce que el PDF esté
  // listo por el simple hecho de que existan registros de etiquetas.
  return NextResponse.json({
    state: batch.state.toLowerCase(),
    total: batch.total,
    created: batch.created,
    message: batch.error ?? undefined,
  }, { headers: { "Cache-Control": "no-store" } });
}
