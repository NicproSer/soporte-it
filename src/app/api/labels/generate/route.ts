import { NextResponse } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { createLabelBatch, generateBatchPdf } from "@/lib/labels";

export const maxDuration = 300;

/**
 * Endpoint del botón "Generar etiquetas" del dashboard.
 *
 * Patrón asíncrono (evita el timeout de 60 s de Vercel):
 *  1. Crea los registros del lote en la BD y responde INMEDIATAMENTE con
 *     batchId + downloadUrl.
 *  2. El PDF se renderiza en segundo plano con `after()` (Next 15), después
 *     de enviar la respuesta HTTP.
 *  3. El frontend hace polling a /api/labels/status/[batchId] y descarga el
 *     PDF cuando el estado pasa a "ready".
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TECHNICIAN")) {
    return NextResponse.json({ error: "No autorizado. Inicia sesión como administrador." }, { status: 401 });
  }

  let count = 50;
  try {
    const body = await request.json();
    if (typeof body?.count === "number") count = body.count;
  } catch {
    // Sin cuerpo: usa el valor por defecto (50).
  }

  try {
    const { batchId, labels } = await createLabelBatch(count);
    const downloadUrl = `/api/labels/generate/${encodeURIComponent(batchId)}/pdf`;
    const statusUrl = `/api/labels/status/${encodeURIComponent(batchId)}`;

    // Render del PDF DESPUÉS de responder: la petición HTTP termina en ~2-3 s
    // y Vercel mantiene la función viva hasta que termine esta tarea.
    after(async () => {
      await generateBatchPdf(batchId);
    });

    return NextResponse.json({
      ok: true,
      batchId,
      created: labels.length,
      downloadUrl,
      statusUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron generar las etiquetas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
