import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';

export class OCRService {
  private worker: Worker | null = null;
  private isInitializing = false;

  public async init() {
    if (this.worker || this.isInitializing) return;
    this.isInitializing = true;
    try {
      this.worker = await createWorker('spa');
    } catch (e) {
      console.error("Failed to init Tesseract worker", e);
    } finally {
      this.isInitializing = false;
    }
  }

  public async recognize(imageData: string | HTMLCanvasElement | HTMLVideoElement): Promise<string> {
    if (!this.worker) {
      await this.init();
    }
    
    if (!this.worker) {
      throw new Error("Worker failed to initialize");
    }

    try {
      const { data: { text } } = await this.worker.recognize(imageData);
      return text;
    } catch (e) {
      console.error("OCR Error:", e);
      return "";
    }
  }

  public async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const ocrService = new OCRService();
