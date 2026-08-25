export interface ParseResult {
  cutCandidate: string | null;
  weightCandidate: number | null;
  needsReview: boolean;
  confidence: 'high' | 'low' | 'none';
}

const DEFAULT_CUTS = [
  'SOBRECOSTILLA', 'LOMO VETADO', 'ASIENTO', 'POSTA ROSADA',
  'POSTA NEGRA', 'POSTA PALLO', 'PUNTA DE GANSO', 'PUNTA PICANA', 'FILETE'
];

export class ParserService {
  private cuts: string[] = DEFAULT_CUTS;

  public setCuts(cuts: string[]) {
    this.cuts = cuts;
  }

  public parseText(text: string): ParseResult {
    const upperText = text.toUpperCase();
    
    const cutCandidate = this.detectCut(upperText);
    const { weight, needsReview } = this.detectNetWeight(upperText);

    let confidence: 'high' | 'low' | 'none' = 'none';
    
    if (cutCandidate && weight) {
      confidence = needsReview ? 'low' : 'high';
    } else if (cutCandidate || weight) {
      confidence = 'low';
    }

    return {
      cutCandidate,
      weightCandidate: weight,
      needsReview: needsReview || (cutCandidate !== null && weight !== null && confidence === 'low'),
      confidence
    };
  }

  private detectCut(text: string): string | null {
    // Simple fuzzy matching or direct inclusion
    // For a real app, Levenshtein distance might be better
    for (const cut of this.cuts) {
      // Allow minor variations like spaces missing or L instead of I
      const normalizedCut = cut.replace(/\s+/g, '').replace(/I/g, 'L');
      const normalizedText = text.replace(/\s+/g, '').replace(/I/g, 'L');
      
      if (normalizedText.includes(normalizedCut)) {
        return cut;
      }
    }
    return null;
  }

  private detectNetWeight(text: string): { weight: number | null; needsReview: boolean } {
    // Look for net weight keywords
    const keywords = ['PESO NETO', 'NETO', 'P. NETO', 'NET WEIGHT', 'NET'];
    
    // Split text into lines or tokens to find proximity
    const lines = text.split('\n');
    let bestCandidate: number | null = null;
    let candidatesFound = 0;

    for (const line of lines) {
      const hasKeyword = keywords.some(kw => line.includes(kw));
      if (hasKeyword) {
        // Find number in this line
        // Match numbers like 7,842 or 7.842
        const numberRegex = /(\d+[.,]\d+)/g;
        const matches = line.match(numberRegex);
        
        if (matches && matches.length > 0) {
          // Take the first number found near the keyword on the same line
          const numStr = matches[0].replace(',', '.');
          const weight = parseFloat(numStr);
          
          // Basic sanity check for meat box weight (e.g., between 1kg and 40kg)
          if (!isNaN(weight) && weight > 0 && weight < 50) {
            bestCandidate = weight;
            candidatesFound++;
          }
        }
      }
    }

    if (candidatesFound === 1 && bestCandidate !== null) {
      return { weight: bestCandidate, needsReview: false };
    } else if (candidatesFound > 1 && bestCandidate !== null) {
      return { weight: bestCandidate, needsReview: true }; // Multiple candidates, needs review
    }

    return { weight: null, needsReview: true };
  }
}

export const parserService = new ParserService();
