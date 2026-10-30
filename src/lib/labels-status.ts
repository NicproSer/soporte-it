import { prisma } from "@/lib/prisma";
import type { BatchStatus } from "@/lib/labels";

// Re-export del estado en memoria para la ruta de polling.
export { getBatchStatus } from "@/lib/labels";
export type { BatchStatus } from "@/lib/labels";

/** Cantidad de etiquetas de un lote ya creadas en la base de datos. */
export async function prismaLabelCount(batchId: string): Promise<number> {
  return prisma.label.count({ where: { batchId } });
}
