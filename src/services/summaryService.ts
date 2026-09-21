import type { ScannedBox } from './db';

export interface CutSummary {
  cut: string;
  count: number;
  totalWeight: number;
}

/**
 * Agrupa cajas por nombre de corte, sumando cantidad de cajas y peso neto.
 * Usado tanto por el Resumen general (Summary.tsx, escaneadas + manuales)
 * como por la carga manual (ManualEntry.tsx), para no duplicar la lógica
 * de agregación en dos lugares.
 */
export function groupBoxesByCut(boxes: ScannedBox[]): CutSummary[] {
  const map = new Map<string, CutSummary>();

  for (const box of boxes) {
    const current = map.get(box.cutName) ?? { cut: box.cutName, count: 0, totalWeight: 0 };
    map.set(box.cutName, {
      cut: box.cutName,
      count: current.count + 1,
      totalWeight: current.totalWeight + box.netWeight,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.cut.localeCompare(b.cut));
}
