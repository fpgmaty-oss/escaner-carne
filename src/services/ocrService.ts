import { createWorker, PSM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

export class OCRService {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Inicializa el worker de Tesseract. Es seguro llamarla varias veces
   * o "en paralelo" (ej. apenas arranca la cámara, sin esperar el resultado):
   * si ya hay una inicialización en curso, todos los llamadores esperan
   * la misma promesa en vez de crear workers duplicados.
   */
  public async init(): Promise<void> {
    if (this.worker) return;
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      const worker = await createWorker('spa');
      // La imagen que recibimos ya viene recortada a la zona de la
      // etiqueta (ver imageUtils.computeCropRect), así que le decimos a
      // Tesseract que asuma "un solo bloque de texto uniforme" en vez de
      // hacer análisis de layout de página completa. Esto es bastante
      // más rápido y, al ser una región chica, también más preciso.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      this.worker = worker;
    } catch (e) {
      console.error('Failed to init Tesseract worker', e);
      this.initPromise = null; // permitir reintentar en el próximo capture
    }
  }

  public isReady(): boolean {
    return this.worker !== null;
  }

  public async recognize(
    imageData: string | HTMLCanvasElement | HTMLVideoElement,
    pageSegMode: PSM = PSM.SINGLE_BLOCK
  ): Promise<string> {
    if (!this.worker) {
      await this.init();
    }

    if (!this.worker) {
      throw new Error('Worker failed to initialize');
    }

    try {
      await this.worker.setParameters({ tessedit_pageseg_mode: pageSegMode });
      const { data: { text } } = await this.worker.recognize(imageData);
      return text;
    } catch (e) {
      console.error('OCR Error:', e);
      return '';
    }
  }

  public async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initPromise = null;
    }
  }
}

export const ocrService = new OCRService();
