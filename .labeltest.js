// Prueba local del flujo de labels.ts: interceptor + pdfkit real.
const fs = require("node:fs");
const path = require("node:path");

// Simular ruta rota como en el bundle de Next (vendor-chunks/data/... .afm)
const dataDir = path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
const real = fs.readFileSync;
let redirected = 0;
fs.readFileSync = function (file, options) {
  if (typeof file === "string" && file.toLowerCase().endsWith(".afm")) {
    // Forzar siempre la ruta rota para ejercitar el fallback (como Turbopack).
    const broken = path.join("/tmp/no-existe-chunk", "data", path.basename(file));
    try { return real.call(fs, broken, options); }
    catch (e) {
      if (e.code === "ENOENT") {
        const fb = path.join(dataDir, path.basename(file));
        if (fs.existsSync(fb)) { redirected++; return real.call(fs, fb, options); }
      }
      throw e;
    }
  }
  return real.call(fs, file, options);
};

const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const SVGtoPDF = require("svg-to-pdfkit");

(async () => {
  const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  doc.addPage({ size: "LETTER", margin: 0 });
  doc.roundedRect(20, 20, 300, 400, 20).fill("#062847");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(31).text("SOPORTE IT", 50, 50);
  doc.font("Helvetica").fontSize(11).text("ID permanente · PRUEBA", 50, 100);
  SVGtoPDF(doc, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#FFFFFF" stroke-width="1.8"><circle cx="12" cy="12" r="3"/></g></svg>', 60, 120, { width: 30, height: 30 });
  const qr = await QRCode.toBuffer("http://localhost:3000/q/TESTUID", { type: "png", errorCorrectionLevel: "H", margin: 3, width: 700 });
  doc.image(qr, 50, 160, { width: 214, height: 214 });
  doc.end();
  await new Promise((res) => doc.on("end", res));
  const buf = Buffer.concat(chunks);
  fs.writeFileSync("/tmp/test-label.pdf", buf);
  console.log("OK PDF bytes:", buf.length, "| header:", buf.slice(0,8).toString(), "| lecturas .afm redirigidas:", redirected);
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
