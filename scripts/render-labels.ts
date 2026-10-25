import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "../src/lib/prisma";
import SVGtoPDF from "svg-to-pdfkit";

// Uso: npm run labels:pdf -- LOT-YYYYMMDD-XXXXXX
// Renderiza etiquetas existentes: NO crea ni cambia identificadores.
const batchId = process.argv[2];
if (!batchId || !/^LOT-\d{8}-[A-F0-9]{6}$/i.test(batchId)) {
  throw new Error("Indica el lote existente. Ejemplo: npm run labels:pdf -- LOT-20261022-18C010");
}
const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("Falta NEXT_PUBLIC_APP_URL en el archivo .env");

const PT = 72;
const PAGE_W = 8.5 * PT;
const PAGE_H = 11 * PT;

async function main() {
  const labels = await prisma.label.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
    select: { uid: true, code: true, batchId: true },
  });
  if (!labels.length) throw new Error(`No se encontraron etiquetas para el lote ${batchId}`);

  const outputDir = path.resolve(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `stickers-${batchId}-carta.pdf`);
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 0,
    autoFirstPage: false,
    info: { Title: `Etiquetas Soporte IT ${batchId}`, Author: "Soporte IT" },
  });
  const output = fs.createWriteStream(filePath);
  doc.pipe(output);

  const columns = 5;
  const rows = 4;
  const perPage = columns * rows;
  const labelScale = 0.29;
  const designW = 410;
  const designH = 525;
  const cellW = PAGE_W / columns;
  const cellH = PAGE_H / rows;

  const settingsSvg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="24" height="24" viewBox="0 0 24 24">
  <g fill="none" stroke="#FFFFFF" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.09-.03a1.7 1.7 0 0 0-1.78.6l-.05.08h-3.6l-.02-.1a1.7 1.7 0 0 0-1.3-1.3l-.1-.02-1.8-3.12.07-.06A1.7 1.7 0 0 0 9.67 14l-.1-.05v-3.6l.1-.02a1.7 1.7 0 0 0 1.3-1.3l.02-.1h3.6l.05.08a1.7 1.7 0 0 0 1.78.6l.09-.03 1.8 3.12-.06.06A1.7 1.7 0 0 0 19.4 15Z"/>
  </g>
</svg>`;

  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    if (index % perPage === 0) doc.addPage({ size: "LETTER", margin: 0 });

    // Diseño vectorial escalado y centrado en una cuadrícula de 20 etiquetas por hoja carta.
    const cellIndex = index % perPage;
    const col = cellIndex % columns;
    const row = Math.floor(cellIndex / columns);
    const x = 0;
    const y = 0;
    doc.save();
    doc.translate(
      col * cellW + (cellW - designW * labelScale) / 2,
      row * cellH + (cellH - designH * labelScale) / 2,
    );
    doc.scale(labelScale);
    const w = designW;
    const h = designH;
    const navy = "#062847";
    const blue = "#0756C8";
    const lime = "#A8E52E";
    const ink = "#092B4B";

    // Silueta y borde de corte discontinuo.
    doc.save();
    doc.lineWidth(1.1).dash(5, { space: 4 }).strokeColor("#252525")
      .roundedRect(x - 8, y - 8, w + 16, h + 16, 28).stroke();
    doc.undash();
    doc.lineWidth(1).strokeColor("#555555")
      .roundedRect(x, y, w, h, 23).stroke();
    // Banda tecnológica lateral y cabecera.
    doc.roundedRect(x, y, 88, h, 22).fill(navy);
    doc.rect(x + 65, y, 24, h).fill(navy);
    doc.roundedRect(x, y, w, 92, 22).fill(navy);
    doc.rect(x, y + 60, w, 32).fill(navy);

    // Título.
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(31)
      .text("SOPORTE IT", x + 96, y + 26, { width: w - 160, align: "center" });

    // Detalles de circuito en la banda izquierda.
    doc.lineWidth(2).strokeColor(blue);
    doc.moveTo(x + 18, y + 24).lineTo(x + 18, y + 70).lineTo(x + 35, y + 87).lineTo(x + 65, y + 87).stroke();
    doc.lineWidth(1.6).strokeColor("#FFFFFF");
    doc.circle(x + 43, y + 155, 24).stroke();
    doc.fillColor(blue).circle(x + 43, y + 155, 14).fill();
    

SVGtoPDF(doc, settingsSvg, x + 28, y + 143, {
  width: 30,
  height: 30,
});
    doc.lineWidth(1.5).strokeColor("#FFFFFF");
    doc.moveTo(x + 18, y + 230).lineTo(x + 18, y + 345).lineTo(x + 48, y + 375).stroke();
    doc.lineWidth(1.5).strokeColor(blue);
    doc.moveTo(x + 48, y + 255).lineTo(x + 70, y + 255).lineTo(x + 70, y + 285).stroke();
    doc.circle(x + 48, y + 255, 4).stroke();
    doc.circle(x + 70, y + 285, 4).stroke();
    doc.fillColor(blue).circle(x + 43, y + 415, 5).fill();
    doc.fillColor("#FFFFFF").circle(x + 43, y + 437, 5).fill();
    doc.fillColor(lime).circle(x + 43, y + 459, 5).fill();
    for (let i = 0; i < 3; i++) {
      doc.moveTo(x + 26, y + 485 + i * 10).lineTo(x + 55, y + 458 + i * 10)
        .lineWidth(4).strokeColor(blue).stroke();
    }

    // QR grande y con margen de silencio; usa el UID ya registrado.
    const qrSize = 214;
    const qrX = x + 133;
    const qrY = y + 112;
    doc.lineWidth(5).strokeColor(blue).roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 17).stroke();
    const qr = await QRCode.toBuffer(`${baseUrl}/q/${label.uid}`, {
      type: "png", errorCorrectionLevel: "H", margin: 3, width: 700,
      color: { dark: "#000000", light: "#ffffff" },
    });
    doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

    // Instrucción con acento verde.
    doc.fillColor(lime).circle(x + 136, y + 366, 20).fill();
    doc.lineWidth(2.5).strokeColor(navy);
    doc.moveTo(x + 128, y + 359).lineTo(x + 128, y + 354).lineTo(x + 134, y + 354).stroke();
    doc.moveTo(x + 138, y + 354).lineTo(x + 144, y + 354).lineTo(x + 144, y + 360).stroke();
    doc.moveTo(x + 128, y + 372).lineTo(x + 128, y + 378).lineTo(x + 134, y + 378).stroke();
    doc.moveTo(x + 138, y + 378).lineTo(x + 144, y + 378).lineTo(x + 144, y + 372).stroke();
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(13)
      .text("Escanea para consultar la", x + 164, y + 354, { width: 230 });
    doc.text("información y solicitar soporte", x + 164, y + 372, { width: 230 });

    // Línea técnica.
    doc.lineWidth(1.5).strokeColor(blue).moveTo(x + 112, y + 405).lineTo(x + w - 24, y + 405).stroke();
    doc.fillColor(lime).circle(x + w - 24, y + 405, 4).fill();

    // Identificador permanente: se conserva visible, sin campos de marca ni modelo.
    doc.fillColor(blue).font("Helvetica-Bold").fontSize(16)
      .text(label.code, x + 105, y + 435, { width: w - 128, align: "left" });
    doc.fillColor("#607080").font("Helvetica").fontSize(11)
      .text("ID permanente · " + label.uid.slice(0, 8).toUpperCase(), x + 105, y + 458, { width: w - 128 });

    // Acento inferior verde y cierre de página.
    doc.lineWidth(2).strokeColor(lime).moveTo(x + 20, y + h - 15).lineTo(x + 90, y + h - 15).lineTo(x + 103, y + h - 28).stroke();
    doc.restore();
    doc.restore();
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  console.log(`PDF generado para lote existente: ${batchId}\nEtiquetas: ${labels.length}\nDistribución: 20 etiquetas por hoja carta (5 columnas × 4 filas)\nPDF: ${filePath}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
