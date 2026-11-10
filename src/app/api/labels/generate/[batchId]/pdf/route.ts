import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBatchPdf } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Genera el PDF a partir de MongoDB y lo devuelve en la misma invocación. */
export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { batchId } = await params;
  if (!/^LOT-\d{8}-[A-F0-9]{6}$/i.test(batchId)) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  try {
    const batch = await prisma.labelBatch.findUnique({ where: { batchId } });
    if (!batch) return NextResponse.json({ error: "Lote desconocido." }, { status: 404 });
    if (batch.state !== "READY") {
      return NextResponse.json({
        error: batch.error ?? "El PDF todavía no está listo.",
        state: batch.state.toLowerCase(),
      }, { status: batch.state === "ERROR" ? 409 : 425 });
    }

    const { buffer, fileName } = await getBatchPdf(batchId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[labels] download failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "No se pudo reconstruir el PDF. Intenta nuevamente." }, { status: 500 });
  }
}
