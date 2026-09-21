/**
 * CATÁLOGO OFICIAL DE CORTES — Cluster B (Brasil - Paraguay - Colombia)
 * ----------------------------------------------------------------------
 * Fuente: tabla "Códigos de Balanza" provista por el usuario (imagen
 * b20c9148-a721-49c6-a2b3-e23115cd2a94.png).
 *
 * Es la fuente única de verdad de los nombres de corte para:
 *  - el catálogo de matching difuso del OCR (ver parserService.ts)
 *  - las opciones del formulario de carga manual (ver ManualEntry.tsx)
 *
 * Nota: en la tabla original cada corte lleva el prefijo "V " (Vacuno).
 * Se guarda sin ese prefijo para que combine bien con lo que el OCR suele
 * leer en las etiquetas (que no incluyen la "V").
 *
 * *V MALAYA no registra item ni codigo de balanza en Cluster B, pero se
 * deja igual en el catálogo porque el corte existe.
 */
export const MEAT_CUTS = [
  'ABASTERO',
  'ASADO CARNICERO',
  'ASIENTO',
  'CHOCLILLO',
  'ENTRAÑA',
  'FILETE',
  'GANSO',
  'HUACHALOMO',
  'LOMO LISO',
  'LOMO VETADO',
  'MALAYA',
  'PALANCA',
  'PLATEADA',
  'POLLO GANSO',
  'POSTA NEGRA',
  'POSTA PALETA',
  'POSTA ROSADA',
  'PUNTA GANSO',
  'PUNTA PALETA',
  'PUNTA PICAÑA',
  'SOBRECOSTILLA',
  'TAPABARRIGA',
  'TAPAPECHO',
] as const;

export type MeatCut = (typeof MEAT_CUTS)[number];
