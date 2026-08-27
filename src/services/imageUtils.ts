/**
 * Utilidades de geometría para el recorte de la imagen de la cámara.
 *
 * El video se muestra con `object-fit: cover` dentro de un contenedor con
 * aspect-ratio fijo (ver `.scanner-container` / `.scanner-frame` en index.css).
 * Eso significa que lo que el usuario VE recortado en pantalla no coincide
 * 1:1 con los píxeles crudos del video. Estas funciones traducen el
 * rectángulo visual (el marco blanco de la guía) a coordenadas reales
 * dentro del frame de video, para poder mandarle a Tesseract solo esa
 * región en vez de la imagen completa.
 *
 * Beneficio directo: menos píxeles a analizar = OCR bastante más rápido,
 * y menos ruido de fondo = mejor precisión.
 */

// Deben coincidir con los valores definidos en index.css
export const SCANNER_CONTAINER_ASPECT = 3 / 4; // .scanner-container { aspect-ratio: 3/4 }
export const SCANNER_FRAME_WIDTH_FRACTION = 0.8; // .scanner-frame { width: 80% }
export const SCANNER_FRAME_HEIGHT_FRACTION = 0.4; // .scanner-frame { height: 40% }

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calcula el rectángulo (en píxeles del video fuente) que corresponde
 * al marco guía que ve el usuario en pantalla, considerando que el video
 * se recorta con `object-fit: cover` para llenar un contenedor de
 * aspect-ratio distinto al del video nativo.
 */
export function computeCropRect(videoWidth: number, videoHeight: number): CropRect {
  const videoAspect = videoWidth / videoHeight;
  const containerAspect = SCANNER_CONTAINER_ASPECT;

  // Qué fracción del video fuente queda realmente visible dentro del
  // contenedor (con object-fit: cover, siempre se pierde algo de un eje).
  let visibleWidthFraction = 1;
  let visibleHeightFraction = 1;

  if (videoAspect > containerAspect) {
    // El video es "más ancho" que el contenedor -> se recortan los costados,
    // se ve el alto completo.
    visibleWidthFraction = containerAspect / videoAspect;
  } else {
    // El video es "más angosto" que el contenedor -> se recorta arriba/abajo,
    // se ve el ancho completo.
    visibleHeightFraction = videoAspect / containerAspect;
  }

  // El marco guía ocupa el 80%/40% central del contenedor visible.
  const cropWidthFraction = visibleWidthFraction * SCANNER_FRAME_WIDTH_FRACTION;
  const cropHeightFraction = visibleHeightFraction * SCANNER_FRAME_HEIGHT_FRACTION;

  const width = Math.round(videoWidth * cropWidthFraction);
  const height = Math.round(videoHeight * cropHeightFraction);
  const x = Math.round((videoWidth - width) / 2);
  const y = Math.round((videoHeight - height) / 2);

  return { x, y, width, height };
}
