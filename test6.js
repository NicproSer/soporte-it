const PDFDocument = require('pdfkit');
const fs = require('fs');
const NAMES = ["Helvetica","Helvetica-Bold","Helvetica-Oblique","Helvetica-BoldOblique","Courier","Courier-Bold","Courier-Oblique","Courier-BoldOblique","Times-Roman","Times-Bold","Times-Italic","Times-BoldItalic","Symbol","ZapfDingbats"];

// Flujo exacto propuesto: font:null + registerFont(string) + addPage() SIN opciones
const doc = new PDFDocument({ size: "LETTER", margin: 0, autoFirstPage: false, font: null });
for (const n of NAMES) doc.registerFont(n, fs.readFileSync(`node_modules/pdfkit/js/data/${n}.afm`, 'utf8'));
doc.addPage(); // sin options -> usa this.options (font:null)
try {
  doc.font("Helvetica-Bold").fontSize(31).text("SOPORTE IT");
  doc.font("Helvetica").fontSize(11).text("normal");
  console.log("addPage() sin opciones: OK");
} catch(e){ console.log("FAILED:", e.message.slice(0,60)); }
doc.pipe(fs.createWriteStream('/tmp/t6.pdf'));
doc.end();
setTimeout(()=>console.log("pdf bytes:", fs.statSync('/tmp/t6.pdf').size), 200);
