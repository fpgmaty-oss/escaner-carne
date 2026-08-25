import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface ScannedBox {
  id?: number;
  cutName: string;
  netWeight: number; // In kilograms
  timestamp: number;
  labelId?: string; // Optional identifier from the label if any
  manualCorrection: boolean;
  status: 'valid' | 'duplicate' | 'pending_review';
}

export class AppDatabase extends Dexie {
  boxes!: Table<ScannedBox, number>;

  constructor() {
    super('MeatScannerDB');
    this.version(1).stores({
      boxes: '++id, cutName, timestamp, status' // Primary key and indexed props
    });
  }
}

export const db = new AppDatabase();
