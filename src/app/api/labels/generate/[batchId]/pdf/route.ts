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
  const filePath = path.resolve(process.cwd(), "output", `stickers-${batchId}.pdf`);
  // Comprobación de trayectoria para evitar traversal.
  if (!filePath.startsWith(path.resolve(process.cwd(), "output")) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "El PDF no está disponible." }, { status: 404 });
  }
  const buffer = await fs.promises.readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="stickers-${batchId}.pdf"`,
    },
  });
}
