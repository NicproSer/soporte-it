import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateLabelBatch } from "@/lib/labels";

export const maxDuration = 60;

/**
 * Endpoint del botón "Generar etiquetas" del dashboard.
 * Crea el lote en la base de datos y devuelve el PDF para descargar,
 * sin necesidad de ejecutar npm run labels:generate.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
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
    const result = await generateLabelBatch(count);
    return NextResponse.json({
      ok: true,
      batchId: result.batchId,
      created: result.labels.length,
      downloadUrl: `/api/labels/generate/${encodeURIComponent(result.batchId)}/pdf`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron generar las etiquetas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
