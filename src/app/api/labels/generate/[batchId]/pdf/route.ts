import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/** Descarga del PDF generado por el botón "Generar etiquetas". */
export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { batchId } = await params;
  if (!/^LOT-\d{8}-[A-F0-9]{6}$/i.test(batchId)) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }
  // El botón del dashboard ahora genera el PDF tipo carta (mismo diseño que
  // render-labels.ts); se aceptan también los nombres antiguos por compatibilidad.
  const outputDir = path.resolve(process.cwd(), "output");
  const candidates = [
    `stickers-${batchId}-carta.pdf`,
    `stickers-${batchId}.pdf`,
  ];
  let filePath: string | null = null;
  for (const name of candidates) {
    const p = path.join(outputDir, name);
    if (p.startsWith(outputDir) && fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }
  if (!filePath) {
    return NextResponse.json(
      { error: "El PDF no está disponible. Vuelve a generar el lote desde el dashboard." },
      { status: 404 },
    );
  }
  const buffer = await fs.promises.readFile(filePath);
  const fileName = path.basename(filePath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
