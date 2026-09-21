import type { ScannedBox } from './db';

export interface CutSummary {
  cut: string;
  count: number;
  totalWeight: number;
  /** Cuantas de esas cajas vinieron del escaner OCR (o no tienen `source`,
   *  que es el caso de los registros viejos de antes de que existiera este
   *  campo -> se tratan como escaneadas por default). */
  ocrCount: number;
  /** Cuantas de esas cajas se cargaron a mano. */
  manualCount: number;
}

/**
 * Agrupa cajas por nombre de corte, sumando cantidad de cajas, peso neto,
 * y el desglose por origen (escaneado vs manual). Usado tanto por el
 * Resumen general (Summary.tsx) como por la carga manual (ManualEntry.tsx),
 * para no duplicar la logica de agregacion en dos lugares.
 */
export function groupBoxesByCut(boxes: ScannedBox[]): CutSummary[] {
  const map = new Map<string, CutSummary>();

  for (const box of boxes) {
    const current = map.get(box.cutName) ?? {
      cut: box.cutName,
      count: 0,
      totalWeight: 0,
      ocrCount: 0,
      manualCount: 0,
    };
    const isManual = box.source === 'manual';
    map.set(box.cutName, {
      cut: box.cutName,
      count: current.count + 1,
      totalWeight: current.totalWeight + box.netWeight,
      ocrCount: current.ocrCount + (isManual ? 0 : 1),
      manualCount: current.manualCount + (isManual ? 1 : 0),
    });
  }

  return Array.from(map.values()).sort((a, b) => a.cut.localeCompare(b.cut));
}

export type DateRangeOption = 'today' | 'yesterday' | 'week' | 'all';

export const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
  all: 'Todo',
};

/**
 * Calcula el rango [start, end] en milisegundos (epoch) para un filtro de
 * fecha rapido. Devuelve null para 'all' (sin filtro).
 */
export function getDateRangeBounds(range: DateRangeOption): { start: number; end: number } | null {
  if (range === 'all') return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const endOfToday = startOfToday + oneDayMs - 1;

  switch (range) {
    case 'today':
      return { start: startOfToday, end: endOfToday };
    case 'yesterday':
      return { start: startOfToday - oneDayMs, end: startOfToday - 1 };
    case 'week':
      return { start: startOfToday - 6 * oneDayMs, end: endOfToday };
  }
}

/** Filtra cajas por un rango de fechas rapido (ver getDateRangeBounds). */
export function filterBoxesByRange(boxes: ScannedBox[], range: DateRangeOption): ScannedBox[] {
  const bounds = getDateRangeBounds(range);
  if (!bounds) return boxes;
  return boxes.filter(b => b.timestamp >= bounds.start && b.timestamp <= bounds.end);
}
