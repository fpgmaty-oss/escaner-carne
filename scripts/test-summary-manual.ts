import { groupBoxesByCut, filterBoxesByRange, getDateRangeBounds } from '../src/services/summaryService.ts';
import type { ScannedBox } from '../src/services/db.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALLO: ${message}`);
  }
  console.log(`OK: ${message}`);
}

function makeBox(overrides: Partial<ScannedBox>): ScannedBox {
  return {
    cutName: 'ABASTERO',
    netWeight: 10,
    timestamp: Date.now(),
    manualCorrection: false,
    status: 'valid',
    ...overrides,
  };
}

// ===== groupBoxesByCut =====
console.log('\n=== groupBoxesByCut: cuenta y suma peso por corte ===');

const boxes: ScannedBox[] = [
  makeBox({ cutName: 'ABASTERO', netWeight: 10, source: 'ocr' }),
  makeBox({ cutName: 'ABASTERO', netWeight: 12.5, source: 'manual' }),
  makeBox({ cutName: 'FILETE', netWeight: 5, source: 'ocr' }),
  makeBox({ cutName: 'FILETE', netWeight: 5, source: undefined }), // registro viejo sin `source`
];
const grouped = groupBoxesByCut(boxes);

const abastero = grouped.find(g => g.cut === 'ABASTERO')!;
assert(abastero.count === 2, 'ABASTERO tiene 2 cajas');
assert(Math.abs(abastero.totalWeight - 22.5) < 1e-9, 'ABASTERO suma 22.5 kg');
assert(abastero.manualCount === 1, 'ABASTERO tiene 1 caja manual');
assert(abastero.ocrCount === 1, 'ABASTERO tiene 1 caja OCR');

const filete = grouped.find(g => g.cut === 'FILETE')!;
assert(filete.count === 2, 'FILETE tiene 2 cajas');
assert(filete.ocrCount === 2, 'FILETE: un registro sin `source` cuenta como OCR (compatibilidad hacia atras)');
assert(filete.manualCount === 0, 'FILETE no tiene manuales');

assert(grouped[0].cut <= grouped[1].cut, 'el resultado viene ordenado alfabeticamente');

// ===== filterBoxesByRange =====
console.log('\n=== filterBoxesByRange: filtros de fecha rapidos ===');
// Nota: este check puede ser flaky si se corre exactamente a medianoche
// (mismo tipo de limitacion que ya tienen los tests manuales del parser).

const now = Date.now();
const oneDayMs = 24 * 60 * 60 * 1000;
const rangeBoxes: ScannedBox[] = [
  makeBox({ cutName: 'HOY', timestamp: now }),
  makeBox({ cutName: 'AYER', timestamp: now - oneDayMs }),
  makeBox({ cutName: 'HACE_3_DIAS', timestamp: now - 3 * oneDayMs }),
  makeBox({ cutName: 'HACE_10_DIAS', timestamp: now - 10 * oneDayMs }),
];

const today = filterBoxesByRange(rangeBoxes, 'today');
assert(today.some(b => b.cutName === 'HOY'), "'today' incluye una caja de ahora mismo");
assert(!today.some(b => b.cutName === 'AYER'), "'today' NO incluye una caja de ayer");

const week = filterBoxesByRange(rangeBoxes, 'week');
assert(
  week.some(b => b.cutName === 'HOY') && week.some(b => b.cutName === 'HACE_3_DIAS'),
  "'week' incluye hoy y hace 3 dias"
);
assert(!week.some(b => b.cutName === 'HACE_10_DIAS'), "'week' NO incluye algo de hace 10 dias");

const all = filterBoxesByRange(rangeBoxes, 'all');
assert(all.length === rangeBoxes.length, "'all' no filtra nada");

assert(getDateRangeBounds('all') === null, "'all' no tiene limites (sin filtro)");

console.log('\nTodos los checks de summaryService pasaron.');
