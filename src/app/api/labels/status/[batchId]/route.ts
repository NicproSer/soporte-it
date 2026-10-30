import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBatchStatus, prismaLabelCount } from "@/lib/labels-status";

/**
 * Estado de generación de un lote (patrón asíncrono para evitar el timeout
 * de 60 s de Vercel): el frontend hace polling aquí hasta que state==="ready"
 * y entonces descarga /api/labels/generate/[batchId]/pdf.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { batchId } = await params;
  const status = getBatchStatus(batchId);
  if (!status) {
    // La instancia puede haber reiniciado: verificamos contra la base de datos.
    const created = await prismaLabelCount(batchId);
    if (created > 0) return NextResponse.json({ state: "ready", total: created, created });
    return NextResponse.json({ error: `Lote ${batchId} desconocido.` }, { status: 404 });
  }
  return NextResponse.json(status);
}
