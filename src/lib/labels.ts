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
/*  Fix definitivo para las fuentes estándar de pdfkit                 */
/*                                                                     */
/*  pdfkit carga sus métricas .afm con                                 */
/*  `fs.readFileSync(__dirname + "/data/<Fuente>.afm", "utf8")`.       */
/*  Bajo Next.js esto fallaba de dos formas:                           */
/*   • ENOENT: cuando Turbopack/webpack empaquetaba pdfkit dentro de   */
/*     `.next/server/vendor-chunks` y la carpeta `data/` no existía.   */
/*   • "Unknown font format": los intentos anteriores de registrar     */
/*     los .afm vía `doc.registerFont(nombre, buffer)` hacían que      */
/*     pdfkit enviara el contenido a fontkit, que solo entiende        */
/*     TTF/OTF/WOFF — nunca AFM.                                       */
/*                                                                     */
/*  Solución (probada contra pdfkit 0.16):                             */
/*   1) Interceptor de `fs.readFileSync`: si pdfkit pide un `*.afm`    */
/*      por una ruta inexistente (bundle roto), se redirige la lectura */
/*      a node_modules/pdfkit/js/data/. Las fuentes estándar se        */
/*      construyen así por el camino NATIVO de pdfkit                  */
/*      (StandardFont → AFMFont), sin tocar fontkit.                   */
/*   2) Red de seguridad: copiar la carpeta `data/` junto a las rutas  */
/*      típicas de chunks de Next por si algún loader alternativo      */
/*      busca los .afm en disco directamente.                          */
/*  Importante: NO usar doc.registerFont() con contenido .afm; pdfkit  */
/*  lo trataría como fuente embebida y fontkit lanzaría                */
/*  "Unknown font format".                                             */
/* ------------------------------------------------------------------ */

/** Tipos mínimos de las opciones de `fs.readFileSync` (sin depender de globals de @types/node). */
type ReadFileOptions = { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null | undefined;

function afmDataDirs(): string[] {
  const candidates = [
    path.join(process.cwd(), "node_modules", "pdfkit", "js", "data"),
    // monorepos / instaladores con estructura anidada
    path.join(process.cwd(), "node_modules", ".pnpm", "pdfkit", "js", "data"),
  ];
  return candidates.filter((dir) => {
    try {
      return fs.existsSync(path.join(dir, "Helvetica.afm"));
    } catch {
      return false;
    }
  });
}

let afmFixApplied = false;
function applyPdfKitAfmFix() {
  if (afmFixApplied) return;
  afmFixApplied = true;

  const dataDirs = afmDataDirs();
  if (!dataDirs.length) return; // entorno sin node_modules visible: nada que hacer
  const primaryDataDir = dataDirs[0];

  // 1) Interceptor de lecturas .afm con ruta rota (vendor-chunks, etc.).
  const realReadFileSync = fs.readFileSync;
  (fs as unknown as { readFileSync: typeof fs.readFileSync }).readFileSync =
    function patchedReadFileSync(file: string | Buffer | URL | number, options?: ReadFileOptions) {
      if (typeof file === "string" && file.toLowerCase().endsWith(".afm")) {
        try {
          return (realReadFileSync as (f: string, o?: ReadFileOptions) => unknown)(file, options);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            const name = path.basename(file);
            for (const dir of dataDirs) {
              const fallback = path.join(dir, name);
              if (fs.existsSync(fallback)) {
                return (realReadFileSync as (f: string, o?: ReadFileOptions) => unknown)(fallback, options);
              }
            }
          }
          throw error;
        }
      }
      return (realReadFileSync as (f: string | Buffer | URL | number, o?: ReadFileOptions) => unknown)(file, options);
    } as typeof fs.readFileSync;

  // 2) Red de seguridad: copiar los .afm junto a las rutas donde un bundle
  //    de Next podría buscarlos (`__dirname/data`).
  try {
    const files = fs.readdirSync(primaryDataDir).filter((f) => f.toLowerCase().endsWith(".afm"));
    const targets = new Set<string>();
    const nextServer = path.resolve(process.cwd(), ".next", "server");
    targets.add(path.join(nextServer, "vendor-chunks", "data"));
    targets.add(path.join(nextServer, "app", "data"));
    targets.add(path.join(nextServer, "chunks", "data"));
    targets.add(path.resolve(process.cwd(), ".next", "standalone", "node_modules", "pdfkit", "js", "data"));
    // Cualquier subcarpeta de .next/server que ya contenga JS de pdfkit.
    try {
      const walk = (dir: string, depth: number) => {
        if (depth > 4) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full, depth + 1);
          else if (/pdfkit/i.test(entry.name)) targets.add(path.join(path.dirname(full), "data"));
        }
      };
      if (fs.existsSync(nextServer)) walk(nextServer, 0);
    } catch {
      /* opcional */
    }
    for (const target of targets) {
      try {
        fs.mkdirSync(target, { recursive: true });
        for (const file of files) {
          const dst = path.join(target, file);
          if (!fs.existsSync(dst)) fs.copyFileSync(path.join(primaryDataDir, file), dst);
        }
      } catch {
        /* permisos u otra causa: el interceptor (capa 1) sigue funcionando */
      }
    }
  } catch {
    /* readdir falló: el interceptor basta */
  }
}

/**
 * Crea un lote de etiquetas QR en la base de datos (misma lógica que
 * scripts/generate-labels.ts) y devuelve el PDF listo para descargar.
 * Lo usa tanto el script npm como el botón "Generar etiquetas" del dashboard.
 */
/** Estado en memoria del progreso de generación de un lote (patrón
 *  asíncrono: el endpoint responde de inmediato y el frontend consulta
 *  /api/labels/status/[batchId] hasta que el PDF esté listo. Esto evita
 *  el timeout de 60 s de Vercel con lotes grandes). */
export type BatchStatus = {
  state: "generating" | "ready" | "error";
  total: number;
  created: number;
  message?: string;
};
const batchProgress = new Map<string, BatchStatus>();

export function getBatchStatus(batchId: string): BatchStatus | undefined {
  return batchProgress.get(batchId);
}

export function setBatchStatus(batchId: string, status: BatchStatus): void {
  batchProgress.set(batchId, status);
  // Limpieza suave: conservar solo los últimos 50 lotes en memoria.
  if (batchProgress.size > 50) {
    const oldest = batchProgress.keys().next().value;
    if (oldest && oldest !== batchId) batchProgress.delete(oldest);
  }
}

/** Crea ÚNICAMENTE los registros de etiqueta del lote (rápido, ~1-3 s).
 *  El PDF se genera aparte con generateBatchPdf() para no bloquear la
 *  petición HTTP. */
export async function createLabelBatch(rawCount: number): Promise<{
  batchId: string;
  labels: GeneratedLabel[];
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
  setBatchStatus(batchId, { state: "generating", total: count, created: count });
  return { batchId, labels };
}

/** Genera el PDF del lote a partir de las etiquetas ya creadas en la BD.
 *  Se ejecuta en segundo plano tras la respuesta HTTP. */
export async function generateBatchPdf(batchId: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    setBatchStatus(batchId, { state: "error", total: 0, created: 0, message: "Falta NEXT_PUBLIC_APP_URL en el archivo .env" });
    return;
  }
  try {
    const records = await prisma.label.findMany({
      where: { batchId },
      orderBy: { createdAt: "asc" },
      select: { uid: true, code: true },
    });
    if (!records.length) {
      setBatchStatus(batchId, { state: "error", total: 0, created: 0, message: `No se encontraron etiquetas para el lote ${batchId}.` });
      return;
    }
    const labels: GeneratedLabel[] = records.map((r) => ({ uid: r.uid, code: r.code, url: `${baseUrl}/q/${r.uid}` }));
    const outputDir = path.resolve(process.cwd(), "output");
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch {
      /* en Vercel el disco es de solo lectura: igual servimos el PDF desde memoria */
    }
    const pdfPath = path.join(outputDir, `stickers-${batchId}-carta.pdf`);
    await renderStickerPdf(labels, pdfPath, batchId);
    setBatchStatus(batchId, { state: "ready", total: labels.length, created: labels.length });
  } catch (error) {
    console.error(`[labels] fallo generando el PDF del lote ${batchId}:`, error);
    setBatchStatus(batchId, {
      state: "error",
      total: 0,
      created: 0,
      message: error instanceof Error ? error.message : "Error al generar el PDF.",
    });
  }
}

/** Compatibilidad con scripts/seed y npm run labels:generate (flujo síncrono). */
export async function generateLabelBatch(rawCount: number): Promise<{
  batchId: string;
  labels: GeneratedLabel[];
  pdfPath: string;
}> {
  const { batchId, labels } = await createLabelBatch(rawCount);
  const outputDir = path.resolve(process.cwd(), "output");
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch {
    /* si no se puede crear la carpeta de salida, igual servimos el PDF en memoria */
  }
  const pdfPath = path.join(outputDir, `stickers-${batchId}-carta.pdf`);
  await renderStickerPdf(labels, pdfPath, batchId);
  setBatchStatus(batchId, { state: "ready", total: labels.length, created: labels.length });
  return { batchId, labels, pdfPath };
}

/** Devuelve los bytes del PDF de un lote. Primero intenta leer el archivo en
 *  disco; si no existe o no se pudo escribir, lo regenera en memoria con el
 *  mismo diseño de scripts/render-labels.ts. */
export async function getBatchPdf(batchId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const fileName = `stickers-${batchId}-carta.pdf`;
  const filePath = path.join(path.resolve(process.cwd(), "output"), fileName);
  try {
    const buffer = await fs.promises.readFile(filePath);
    if (buffer.length > 1024 && buffer.subarray(0, 5).toString() === "%PDF-") return { buffer, fileName };
  } catch {
    /* seguimos a la regeneración en memoria */
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Falta NEXT_PUBLIC_APP_URL en el archivo .env");
  const records = await prisma.label.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
    select: { uid: true, code: true },
  });
  if (!records.length) throw new Error(`No se encontraron etiquetas para el lote ${batchId}.`);
  const labels: GeneratedLabel[] = records.map((r) => ({ uid: r.uid, code: r.code, url: `${baseUrl}/q/${r.uid}` }));
  await renderStickerPdf(labels, filePath, batchId); // también deja el archivo en disco si es posible
  const buffer = await fs.promises.readFile(filePath).catch(() => null);
  if (buffer) return { buffer, fileName };

  // Último recurso: renderStickerPdf ya construye el PDF EN MEMORIA; si la
  // escritura a disco falló, lo recuperamos desde su caché interna.
  const mem = lastPdfChunks();
  if (!mem.length) throw new Error("No se pudo generar el PDF del lote.");
  return { buffer: Buffer.concat(mem), fileName };
}

/**
 * Renderiza el PDF con el MISMO diseño vectorial que scripts/render-labels.ts,
 * PERO en el formato original: UNA etiqueta por página (50 etiquetas = 50
 * páginas independientes), lista para recortar. Cada página usa un tamaño de
 * papel igual al área de la etiqueta (+ margen de corte punteado), con banda
 * lateral, cabecera navy, icono SVG del engranaje, QR grande con margen de
 * silencio, instrucción con acento verde, línea técnica e ID permanente.
 */
const PT = 72;
// Tamaño de la etiqueta en puntos (diseño 410×525 escalado) + margen de corte.
const LABEL_SCALE = 0.62; // más grande que antes: llena la página individual
const DESIGN_W = 410;
const DESIGN_H = 525;
const BLEED = 14; // espacio alrededor para la línea discontinua de corte
const PAGE_W = DESIGN_W * LABEL_SCALE + BLEED * 2;
const PAGE_H = DESIGN_H * LABEL_SCALE + BLEED * 2;
const PAGE_SIZE: [number, number] = [PAGE_W, PAGE_H];

/** Caché del último PDF construido en memoria por renderStickerPdf(). */
let lastPdfBuffer: Buffer[] = [];
function lastPdfChunks(): Buffer[] {
  return lastPdfBuffer;
}

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
    size: PAGE_SIZE,
    margin: 0,
    autoFirstPage: false,
    info: { Title: `Etiquetas Soporte IT ${batchId}`, Author: "Soporte IT" },
  });
  // El PDF se construye EN MEMORIA: así el endpoint puede responderlo aunque
  // el servidor no pueda escribir en disco (permisos, antivirus, Windows).
  const pdfChunks: Buffer[] = [];
  lastPdfBuffer = pdfChunks; // expone la caché para getBatchPdf() si falla el disco
  doc.on("data", (chunk: Buffer) => pdfChunks.push(chunk));
  const fileWriteFailed = { value: false };
  try {
    const output = fs.createWriteStream(filePath);
    output.on("error", () => { fileWriteFailed.value = true; });
    doc.pipe(output);
  } catch {
    fileWriteFailed.value = true;
  }

  // UNA etiqueta por página (formato original del script): sin cuadrícula.
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    doc.addPage({ size: PAGE_SIZE, margin: 0 });

    // Diseño vectorial escalado y centrado en la página individual.
    const scale = LABEL_SCALE;
    const x = (PAGE_W - DESIGN_W * scale) / 2;
    const y = (PAGE_H - DESIGN_H * scale) / 2;
    doc.save();
    doc.translate(x, y);
    doc.scale(scale);
    const w = DESIGN_W;
    const h = DESIGN_H;
    const navy = "#062847";
    const blue = "#0756C8";
    const lime = "#A8E52E";
    const ink = "#092B4B";

    // Silueta y borde de corte discontinuo.
    doc.save();
    doc.lineWidth(1.1).dash(5, { space: 4 }).strokeColor("#252525")
      .roundedRect(-8, -8, w + 16, h + 16, 28).stroke();
    doc.undash();
    doc.lineWidth(1).strokeColor("#555555")
      .roundedRect(0, 0, w, h, 23).stroke();
    // Banda tecnológica lateral y cabecera.
    doc.roundedRect(0, 0, 88, h, 22).fill(navy);
    doc.rect(65, 0, 24, h).fill(navy);
    doc.roundedRect(0, 0, w, 92, 22).fill(navy);
    doc.rect(0, 60, w, 32).fill(navy);

    // Título.
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(31)
      .text("SOPORTE IT", 96, 26, { width: w - 160, align: "center" });

    // Detalles de circuito en la banda izquierda.
    doc.lineWidth(2).strokeColor(blue);
    doc.moveTo(18, 24).lineTo(18, 70).lineTo(35, 87).lineTo(65, 87).stroke();
    doc.lineWidth(1.6).strokeColor("#FFFFFF");
    doc.circle(43, 155, 24).stroke();
    doc.fillColor(blue).circle(43, 155, 14).fill();

    // Icono de engranaje (SVG vectorial sobre el círculo azul).
    SVGtoPDF(doc, settingsSvg, 28, 143, { width: 30, height: 30 });

    doc.lineWidth(1.5).strokeColor("#FFFFFF");
    doc.moveTo(18, 230).lineTo(18, 345).lineTo(48, 375).stroke();
    doc.lineWidth(1.5).strokeColor(blue);
    doc.moveTo(48, 255).lineTo(70, 255).lineTo(70, 285).stroke();
    doc.circle(48, 255, 4).stroke();
    doc.circle(70, 285, 4).stroke();
    doc.fillColor(blue).circle(43, 415, 5).fill();
    doc.fillColor("#FFFFFF").circle(43, 437, 5).fill();
    doc.fillColor(lime).circle(43, 459, 5).fill();
    for (let i = 0; i < 3; i++) {
      doc.moveTo(26, 485 + i * 10).lineTo(55, 458 + i * 10)
        .lineWidth(4).strokeColor(blue).stroke();
    }

    // QR grande y con margen de silencio; usa el UID ya registrado.
    const qrSize = 214;
    const qrX = 133;
    const qrY = 112;
    doc.lineWidth(5).strokeColor(blue).roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 17).stroke();
    const qr = await QRCode.toBuffer(label.url, {
      type: "png", errorCorrectionLevel: "H", margin: 3, width: 700,
      color: { dark: "#000000", light: "#ffffff" },
    });
    doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

    // Instrucción con acento verde.
    doc.fillColor(lime).circle(136, 366, 20).fill();
    doc.lineWidth(2.5).strokeColor(navy);
    doc.moveTo(128, 359).lineTo(128, 354).lineTo(134, 354).stroke();
    doc.moveTo(138, 354).lineTo(144, 354).lineTo(144, 360).stroke();
    doc.moveTo(128, 372).lineTo(128, 378).lineTo(134, 378).stroke();
    doc.moveTo(138, 378).lineTo(144, 378).lineTo(144, 372).stroke();
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(13)
      .text("Escanea para consultar la", 164, 354, { width: 230 });
    doc.text("información y solicitar soporte", 164, 372, { width: 230 });

    // Línea técnica.
    doc.lineWidth(1.5).strokeColor(blue).moveTo(112, 405).lineTo(w - 24, 405).stroke();
    doc.fillColor(lime).circle(w - 24, 405, 4).fill();

    // Identificador permanente: se conserva visible, sin campos de marca ni modelo.
    doc.fillColor(blue).font("Helvetica-Bold").fontSize(16)
      .text(label.code, 105, 435, { width: w - 128, align: "left" });
    doc.fillColor("#607080").font("Helvetica").fontSize(11)
      .text("ID permanente · " + label.uid.slice(0, 8).toUpperCase(), 105, 458, { width: w - 128 });

    // Acento inferior verde y cierre de página.
    doc.lineWidth(2).strokeColor(lime).moveTo(20, h - 15).lineTo(90, h - 15).lineTo(103, h - 28).stroke();
    doc.restore();
    doc.restore();
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));
  if (!fileWriteFailed.value) {
    await fs.promises.writeFile(filePath, Buffer.concat(pdfChunks)).catch(() => undefined);
  }
}
