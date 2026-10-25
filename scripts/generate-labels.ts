// Alternativa por terminal al botón "Generar etiquetas" del dashboard.
// Recomendado: inicia sesión como administrador y usa el botón en /dashboard.
import { prisma } from "../src/lib/prisma";
import { generateLabelBatch } from "../src/lib/labels";

const count = Number(process.argv[2] ?? 50);

async function main() {
  const { batchId, labels, pdfPath } = await generateLabelBatch(count);
  console.log(`Lote creado: ${batchId}\nEtiquetas: ${labels.length}\nPDF: ${pdfPath}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
