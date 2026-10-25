import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "../src/lib/prisma";

const count = Number(process.argv[2] ?? 50);
if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("Indica una cantidad entre 1 y 500. Ejemplo: npm run labels:generate -- 50");
const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("Falta NEXT_PUBLIC_APP_URL en el archivo .env");

async function main() {
  const batchId = `LOT-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const labels: { uid: string; code: string; url: string }[] = [];
  for (let i = 0; i < count; i++) {
    const uid = randomBytes(18).toString("base64url");
    const code = `ST-${randomBytes(4).toString("hex").toUpperCase()}`;
    const record = await prisma.label.create({ data: { uid, code, batchId } });
    labels.push({ uid: record.uid, code: record.code, url: `${baseUrl}/q/${record.uid}` });
  }
  const outputDir = path.resolve(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `stickers-${batchId}.pdf`);
  const doc = new PDFDocument({ size: [198.43, 283.46], margin: 0, autoFirstPage: false, info: { Title: `Stickers Soporte IT ${batchId}`, Author: "Soporte IT" } });
  const output = fs.createWriteStream(filePath);
  doc.pipe(output);
  for (const label of labels) {
    doc.addPage({ size: [198.43, 283.46], margin: 0 });
    doc.rect(0, 0, 198.43, 283.46).fill("#ffffff");
    doc.roundedRect(5, 5, 188.43, 273.46, 13).lineWidth(1).stroke("#0b2948");
    doc.roundedRect(5, 5, 188.43, 45, 12).fill("#092746");
    doc.rect(5, 37, 188.43, 13).fill("#092746");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(19).text("SOPORTE IT", 17, 17, { width: 165, align: "center" });
    doc.fillColor("#1456c0").roundedRect(22, 59, 154, 154, 10).lineWidth(2).stroke();
    const qr = await QRCode.toBuffer(label.url, { type: "png", errorCorrectionLevel: "H", margin: 2, width: 420, color: { dark: "#000000", light: "#ffffff" } });
    doc.image(qr, 30, 67, { fit: [138, 138], align: "center", valign: "center" });
    doc.fillColor("#092746").font("Helvetica-Bold").fontSize(9).text("ESCANEA PARA CONSULTAR", 13, 222, { width: 172, align: "center" });
    doc.fillColor("#1456c0").font("Helvetica-Bold").fontSize(12).text(label.code, 13, 239, { width: 172, align: "center" });
    doc.fillColor("#536579").font("Helvetica").fontSize(7).text("Identificador permanente", 13, 257, { width: 172, align: "center" });
  }
  doc.end();
  await new Promise<void>((resolve, reject) => { output.on("finish", resolve); output.on("error", reject); });
  console.log(`Lote creado: ${batchId}\nEtiquetas: ${labels.length}\nPDF: ${filePath}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
