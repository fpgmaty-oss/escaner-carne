import { db } from './db';

export class DuplicateService {
  private lastScanTime: number = 0;
  private readonly BLOCK_TIME_MS = 3000; // 3 seconds block

  /**
   * Checks if scanning is temporarily blocked.
   */
  public isTemporarilyBlocked(): boolean {
    const now = Date.now();
    return (now - this.lastScanTime) < this.BLOCK_TIME_MS;
  }

  /**
   * Blocks scanning for a few seconds after a successful scan.
   */
  public blockTemporarily() {
    this.lastScanTime = Date.now();
  }

  /**
   * Checks if the scanned data might be a duplicate based on recent scans.
   */
  public async isPossibleDuplicate(cutName: string, netWeight: number): Promise<boolean> {
    const now = Date.now();
    // Look at boxes scanned in the last 2 minutes
    const RECENT_TIME_LIMIT = 2 * 60 * 1000; 

    // Retrieve recent boxes
    const recentBoxes = await db.boxes
      .where('timestamp')
      .above(now - RECENT_TIME_LIMIT)
      .toArray();

    // Check if there is any box with the same cut and exactly the same weight
    return recentBoxes.some(box => 
      box.cutName === cutName && box.netWeight === netWeight
    );
  }
}

export const duplicateService = new DuplicateService();
