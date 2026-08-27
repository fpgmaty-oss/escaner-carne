import { parserService } from '../src/services/parserService.ts';

function check(label: string, text: string) {
  const result = parserService.parseText(text);
  console.log(`\n=== ${label} ===`);
  console.log('texto:', JSON.stringify(text));
  console.log('cutCandidate:', result.cutCandidate);
  console.log('weightCandidate:', result.weightCandidate);
  console.log('confidence:', result.confidence, '| needsReview:', result.needsReview);
  console.log('cutSuggestions:', result.cutSuggestions);
}

// Caso del usuario: OCR leyo "asado" suelto, sin match exacto de catalogo
check('Asado suelto (ejemplo del usuario)', 'PRODUCTO: ASADO\nPESO NETO 12,450');

// Caso con error tipico de OCR (0 en vez de O)
check('Error de OCR tipico', 'PR0DUCTO: L0M0 LIS0\nPES0 NET0 8,200');

// Caso limpio que deberia seguir funcionando igual que antes (match exacto)
check('Match exacto de catalogo', 'Producto: [123456] ASADO DEL CARNICERO\nPeso Neto (kg) 16,65');

// Caso sin nada reconocible
check('Texto irrelevante', 'FACTURA N 4455\nGRACIAS POR SU COMPRA');

// BUG REAL reportado: la fila de TARA queda dentro de la ventana de
// busqueda del NETO. El codigo viejo tomaba el MENOR numero de esa
// ventana sin saber a que fila pertenecia -> terminaba guardando la Tara
// como si fuera el Neto, con needsReview=false (auto-registro silencioso).
check(
  'Tara pegada al Neto en la ventana de busqueda (bug real)',
  'Producto: ASADO DEL CARNICERO\nPESO NETO (kg)\nTARA (kg): 3,500\n16,65'
);

// Caso donde el numero agarrado por el keyword no coincide con ningun
// combo matematico Bruto-Tara=Neto valido -> el cross-check debe forzar
// needsReview=true en vez de confiar ciegamente.
check(
  'Cross-check matematico detecta inconsistencia',
  'PESO BRUTO (kg)\n20,15\nPESO NETO (kg)\nTARA (kg)\n3,500\n16,65'
);
