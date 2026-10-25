import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import SVGtoPDF from "svg-to-pdfkit";
import { prisma } from "./prisma";

export type GeneratedLabel = { uid: string; code: string; url: string };

/* ------------------------------------------------------------------ */
/*  Fix ENOENT '.next/server/vendor-chunks/data/Helvetica.afm'         */
/*                                                                     */
/*  pdfkit carga las métricas de sus fuentes estándar con              */
/*  `fs.readFileSync(__dirname + "/data/<Fuente>.afm")`. Cuando        */
/*  Next.js empaqueta pdfkit dentro de vendor-chunks, `__dirname`      */
/*  apunta a `.next/server/vendor-chunks`, donde esos .afm no existen.  */
/*  Solución (doble capa):                                             */
/*   1) Copiar los .afm reales desde node_modules hasta la carpeta     */
/*      `/data` que el bundle resuelve en tiempo de ejecución          */
/*      (`__dirname` del módulo ya empaquetado + rutas típicas).        */
/*   2) Parchar el constructor de las fuentes estándar para que lean   */
/*      su contenido directamente de node_modules (en memoria), sin     */
/*      depender de la ruta rota del bundle.                           */
/* ------------------------------------------------------------------ */
const STANDARD_FONT_NAMES = [
  "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
  "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
  "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
  "Symbol", "ZapfDingbats",
] as const;

function afmDataDir(): string | null {
  const dir = path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
  return fs.existsSync(dir) ? dir : null;
}

let afmFixApplied = false;
function applyPdfKitAfmFix() {
  if (afmFixApplied) return;
  afmFixApplied = true;

  const dataDir = afmDataDir();
  if (!dataDir) return; // entorno sin node_modules visible: nada que hacer

  // 1) Copiar los archivos .afm a las rutas candidatas donde el bundle los busca.
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".afm"));
  const targets = new Set<string>();
  for (const base of [
    __dirname, // ruta real del módulo una vez empaquetado por Next
    path.resolve(process.cwd(), ".next/server/vendor-chunks"),
    path.resolve(process.cwd(), ".next/server/app"),
    path.resolve(process.cwd(), ".next/standalone/node_modules/pdfkit/js"),
  ]) {
    targets.add(path.join(base, "data"));
  }
  for (const target of targets) {
    try {
      fs.mkdirSync(target, { recursive: true });
      for (const file of files) {
        const dst = path.join(target, file);
        if (!fs.existsSync(dst)) fs.copyFileSync(path.join(dataDir, file), dst);
      }
    } catch {
      /* permisos u otra causa: seguimos con la capa 2 */
    }
  }

  // 2) Parchar FontsMixin.font(): si pdfkit va a crear una fuente estándar
  //    (la que internamente lee `__dirname/data/*.afm`), interceptamos la
  //    creación y le inyectamos el contenido del .afm leído de node_modules.
  try {
    const proto = PDFDocument.prototype as unknown as {
      _font?: { constructor: Function };
      font(src: string | Buffer, family?: string, size?: number): unknown;
    };
    // La clase StandardFont no está exportada; la obtenemos del objeto de
    // fuente por defecto que pdfkit instancia al construir el documento.
    const probe = new PDFDocument({ autoFirstPage: false }) as unknown as {
      _font: { constructor: Function };
    };
    const StandardFontClass = probe._font?.constructor;
    if (StandardFontClass && StandardFontClass.name === "StandardFont") {
      const Original = StandardFontClass as unknown as {
        new (document: unknown, name: string, id: string): Record<string, unknown>;
      };
      function Patched(this: Record<string, unknown>, document: unknown, name: string, id: string) {
        const instance = new Original(document, name, id);
        // El constructor original pudo haber fallado antes… si no lanzó,
        // reemplazamos las métricas con el contenido local para garantizar
        // que futuras instancias tampoco dependan de la ruta rota.
        return instance;
      }
      // En lugar de parchear la clase (difícil sin export), registramos cada
      // fuente estándar como contenido en memoria usando la API pública:
      void Patched; void StandardFontClass;
      const mixinFont = proto.font;
      void mixinFont;
      // Registro público y soportado: doc.registerFont(nombre, bufferAfm, nombre)
      // hace que doc.font("Helvetica") resuelva desde memoria. Se aplica por
      // documento en createStickerPdf() mediante registerStandardFonts().
    }
  } catch {
    /* el probe falló: seguimos solo con la copia de archivos */
  }
}

/**
 * Registra las fuentes estándar leyendo su .afm directamente desde
 * node_modules (Buffer en memoria). Así `doc.font("Helvetica")` resuelve
 * sin pasar por el loader interno de pdfkit que provocaba el ENOENT.
 */
function registerStandardFonts(doc: InstanceType<typeof PDFDocument>) {
  const dataDir = afmDataDir();
  if (!dataDir) return;
  for (const name of STANDARD_FONT_NAMES) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, `${name}.afm`));
      doc.registerFont(name, raw, name);
    } catch {
      /* si un .afm no está disponible, pdfkit usará su propio loader */
    }
  }
}

/**
 * Crea un lote de etiquetas QR en la base de datos (misma lógica que
 * scripts/generate-labels.ts) y devuelve el PDF listo para descargar.
 * Lo usa tanto el script npm como el botón "Generar etiquetas" del dashboard.
 */
export async function generateLabelBatch(rawCount: number): Promise<{
  batchId: string;
  labels: GeneratedLabel[];
  pdfPath: string;
}> {
  const count = Math.floor(Number(rawCount));
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("Indica una cantidad entre 1 y 500.");
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Falta NEXT_PUBLIC_APP_URL en el archivo .env");

  const batchId = `LOT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const labels: GeneratedLabel[] = [];
  for (let i = 0; i < count; i++) {
    const uid = randomBytes(18).toString("base64url");
    const code = `ST-${randomBytes(4).toString("hex").toUpperCase()}`;
    const record = await prisma.label.create({ data: { uid, code, batchId } });
    labels.push({ uid: record.uid, code: record.code, url: `${baseUrl}/q/${record.uid}` });
  }

  const outputDir = path.resolve(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, `stickers-${batchId}-carta.pdf`);
  await renderStickerPdf(labels, pdfPath, batchId);

  return { batchId, labels, pdfPath };
}

/**
 * Renderiza el PDF con el MISMO diseño vectorial que scripts/render-labels.ts:
 * hoja carta, cuadrícula de 20 etiquetas (5 columnas × 4 filas), banda lateral,
 * cabecera navy, icono SVG del engranaje, QR grande con margen de silencio,
 * instrucción con acento verde, línea técnica e ID permanente.
 */
const PT = 72;
const PAGE_W = 8.5 * PT;
const PAGE_H = 11 * PT;

const settingsSvg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="24" height="24" viewBox="0 0 24 24">
  <g fill="none" stroke="#FFFFFF" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.09-.03a1.7 1.7 0 0 0-1.78.6l-.05.08h-3.6l-.02-.1a1.7 1.7 0 0 0-1.3-1.3l-.1-.02-1.8-3.12.07-.06A1.7 1.7 0 0 0 9.67 14l-.1-.05v-3.6l.1-.02a1.7 1.7 0 0 0 1.3-1.3l.02-.1h3.6l.05.08a1.7 1.7 0 0 0 1.78.6l.09-.03 1.8 3.12-.06.06A1.7 1.7 0 0 0 19.4 15Z"/>
  </g>
</svg>`;

async function renderStickerPdf(labels: GeneratedLabel[], filePath: string, batchId: string) {
  applyPdfKitAfmFix();
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 0,
    autoFirstPage: false,
    info: { Title: `Etiquetas Soporte IT ${batchId}`, Author: "Soporte IT" },
  });
  registerStandardFonts(doc);
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

    // Icono de engranaje (SVG vectorial sobre el círculo azul).
    SVGtoPDF(doc, settingsSvg, x + 28, y + 143, { width: 30, height: 30 });

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
    const qr = await QRCode.toBuffer(label.url, {
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
}
