# Escáner de Carne

App web (PWA) para escanear etiquetas de cajas de carne con la cámara del
celular, detectar automáticamente el **corte** y el **peso neto** por OCR,
y llevar un registro acumulado por corte (cantidad de cajas + kilos totales).

Pensada para usarse desde el celular en el momento de recepción/despacho de
mercadería, sin depender de conexión a internet para el reconocimiento de
texto (Tesseract corre 100% en el navegador).

## Como correr el proyecto

```bash
npm install
npm run dev       # servidor de desarrollo (abre en el navegador)
npm run build     # build de produccion (tsc -b && vite build)
npm run lint      # oxlint
npm run preview   # sirve el build de produccion localmente
```

El repo tiene un workflow de GitHub Actions que hace deploy automatico a
GitHub Pages en cada push a `main`.

## Como funciona (arquitectura)

```
src/
  components/
    Scanner.tsx        -> pantalla principal: camara en vivo + subir foto
    MultiBoxReview.tsx  -> modal para confirmar varias cajas detectadas en 1 foto
    BoxList.tsx         -> listado de cajas registradas (con borrar)
    Summary.tsx         -> resumen agrupado por corte + total general
  services/
    ocrService.ts        -> wrapper de Tesseract.js (worker, PSM, recognize)
    parserService.ts     -> extrae corte y peso neto del texto OCR
    imageUtils.ts         -> geometria del recorte del marco guia (camara en vivo)
    duplicateService.ts  -> bloqueo temporal + deteccion de posibles duplicados
    db.ts                 -> IndexedDB (Dexie) - tabla `boxes`
    exportService.ts     -> exportar todo a Excel
```

Dos formas de escanear una etiqueta, ambas terminan en el mismo pipeline
(`parserService.parseText` -> modal de validacion -> `db.boxes.add`):

1. **Camara en vivo** (botones CAPTURAR / AUTO / linterna): recorta solo la
   zona del marco guia antes de mandarla a OCR (mas rapido y preciso porque
   hay menos ruido de fondo).
2. **Subir foto** (boton "SUBIR FOTO"): abre la camara nativa del celular o
   la galeria. No hay marco guia, asi que se analiza la imagen completa.
   Si Tesseract detecta 2 o mas bloques de texto separados en la foto (por
   ejemplo, varias etiquetas fotografiadas juntas), se muestra el modal
   `MultiBoxReview` para confirmar/editar y registrar todas de una.

### Catalogo de cortes

Vive hardcodeado en `parserService.ts` (constante `DEFAULT_CUTS`). Si se
suma o cambia un corte del local, hay que editar esa lista a mano. El
matching contra el catalogo es difuso (coeficiente de Dice sobre bigramas),
asi que tolera bastante error de OCR.

### Deteccion de peso neto

`parserService.detectNetWeight` busca palabras clave (`PESO NETO`,
`LIQUIDO`, etc.) linea por linea, y como red de seguridad valida
matematicamente `Bruto - Tara = Neto` cuando esos valores tambien aparecen
en la etiqueta. Si el numero encontrado por keyword no coincide con la
cuenta matematica, se prefiere el valor matematico y se fuerza revision
manual (ver changelog de hoy para el detalle del bug que esto arregla).

## Testing manual del parser

`scripts/test-parser-manual.ts` corre casos de texto OCR simulado contra
`parserService` sin necesidad de sacar fotos reales. Se ejecuta directo con
Node (v22.6+ soporta TypeScript nativo, no hace falta `ts-node`/`tsx`):

```bash
node scripts/test-parser-manual.ts
```

Cuando se encuentre un caso real que falle (pegar el texto de la cajita
"OCR:" que se ve en pantalla durante el escaneo), lo ideal es agregarlo acá
como caso de test antes de tocar la logica de parseo.

## Changelog

### 2026-08-27 - Subir foto + fix de peso neto + varias cajas en una foto

**1. Nueva opcion "SUBIR FOTO"** (`Scanner.tsx`, `ocrService.ts`)
Ademas de la camara en vivo, ahora se puede analizar una foto ya sacada
(camara nativa del celular o galeria). Como no hay marco guia para recortar
la etiqueta, el OCR usa `PSM.AUTO` (analisis de layout completo) en vez de
`PSM.SINGLE_BLOCK`.

**2. Fix de bug real: Tara confundida con Neto** (`parserService.ts`)
La busqueda de "PESO NETO" miraba una ventana de 3 lineas (titulo + 2
siguientes) y tomaba el numero mas chico de esa ventana. Si la fila de
TARA caia dentro de esa ventana, se guardaba la Tara como si fuera el Neto,
**sin pedir revision** (confianza alta = auto-registro silencioso). Fix:
- Preferir el numero en la MISMA linea que dice "NETO".
- Si esta en una fila separada (formato tabla), descartar filas de
  Bruto/Tara de la ventana de busqueda.
- Cross-check matematico (`findMathNeto`): si hay Bruto y Tara en la
  etiqueta, validar `Bruto - Tara = Neto`. Si el valor por keyword no
  coincide, usar el valor matematico y forzar revision manual igual, por
  las dudas.
- Casos de test agregados en `scripts/test-parser-manual.ts` reproduciendo
  el bug exacto.

**3. Modo "una foto, varias cajas"** (`MultiBoxReview.tsx`, `ocrService.ts`)
`ocrService.recognizeWithBlocks()` pide a Tesseract que separe el resultado
en bloques de texto (regiones espacialmente distintas). Si una foto subida
tiene 2+ bloques con datos validos, se muestra un modal de revision con
todas las cajas detectadas (editable, con boton para sacar alguna de la
lista) antes de registrarlas todas juntas de una.

**4. Fix: conflicto de camara al subir foto** (`Scanner.tsx`)
La camara en vivo (`getUserMedia`) se quedaba prendida en segundo plano
todo el tiempo, incluso al abrir el selector de foto. Como la mayoria de
los celulares solo dejan que una app/pestaña use la camara a la vez, esto
chocaba con la camara nativa que intenta abrir el input de archivo
(sintoma reportado: "solo prende el flash y no deja sacar la foto"). Fix:
se agregaron `startCamera()` / `stopCamera()` reutilizables; la camara se
apaga justo antes de abrir el selector de foto y se vuelve a prender sola
(al elegir una foto, al cancelar el selector, o al volver a la pestaña).

**Pendiente / cosas a revisar a futuro:**
- El input de "SUBIR FOTO" usa `capture="environment"`, que en algunos
  navegadores fuerza a abrir la camara nativa directo y puede ocultar la
  opcion de elegir una foto ya existente de la galeria. Si hace falta
  poder elegir de galeria siempre, sacar ese atributo (cambio de 1 linea
  en `Scanner.tsx`).
- El bug de peso neto se detecto leyendo el codigo y se verifico con casos
  simulados, no con una foto real que haya fallado. Si vuelve a pasar,
  guardar el texto que muestra la cajita "OCR:" en pantalla para poder
  reproducirlo como test.
- El bundle de produccion pesa ~600kb (warning de Vite en el build,
  principalmente por Tesseract.js). No es un problema funcional, pero si
  se quiere optimizar carga inicial, se puede explorar `dynamic import()`.
