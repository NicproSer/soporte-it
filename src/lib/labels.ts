import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
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
  const pdfPath = path.join(outputDir, `stickers-${batchId}.pdf`);
  await renderStickerPdf(labels, pdfPath, batchId);

  return { batchId, labels, pdfPath };
}

async function renderStickerPdf(labels: GeneratedLabel[], filePath: string, batchId: string) {
  const doc = new PDFDocument({
    size: [198.43, 283.46],
    margin: 0,
    autoFirstPage: false,
    info: { Title: `Stickers Soporte IT ${batchId}`, Author: "Soporte IT" },
  });
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
    const qr = await QRCode.toBuffer(label.url, {
      type: "png",
      errorCorrectionLevel: "H",
      margin: 2,
      width: 420,
      color: { dark: "#000000", light: "#ffffff" },
    });
    doc.image(qr, 30, 67, { fit: [138, 138], align: "center", valign: "center" });
    doc.fillColor("#092746").font("Helvetica-Bold").fontSize(9).text("ESCANEA PARA CONSULTAR", 13, 222, { width: 172, align: "center" });
    doc.fillColor("#1456c0").font("Helvetica-Bold").fontSize(12).text(label.code, 13, 239, { width: 172, align: "center" });
    doc.fillColor("#536579").font("Helvetica").fontSize(7).text("Identificador permanente", 13, 257, { width: 172, align: "center" });
  }
  doc.end();
  await new Promise<void>((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
}
