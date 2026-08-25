export interface ParseResult {
  cutCandidate: string | null;
  weightCandidate: number | null;
  needsReview: boolean;
  confidence: 'high' | 'low' | 'none';
}

/**
 * CATÁLOGO DE CORTES
 * ------------------
 * Agregar aquí todos los cortes que se manejan en el local.
 * El sistema compara estos nombres contra el texto leído por el OCR
 * usando coincidencia difusa (fuzzy matching) para tolerar errores de lectura.
 */
const DEFAULT_CUTS = [
  'ASADO DEL CARNICERO',
  'ASADO DE TIRA',
  'SOBRECOSTILLA',
  'LOMO VETADO',
  'LOMO LISO',
  'ASIENTO',
  'POSTA ROSADA',
  'POSTA NEGRA',
  'POSTA PALETA',
  'PUNTA DE GANSO',
  'PUNTA PICANA',
  'FILETE',
  'HUACHALOMO',
  'ABASTERO',
  'PALANCA',
  'ENTRAÑA',
  'GANSO',
  'TAPAPECHO',
  'CHOCLO',
  'COGOTE',
  'TAPABARRIGA',
  'PLATEADA',
  'PUNTA DE PALETA',
  'COLUDA',
  'OSSOBUCO',
  'OSOBUCO',
  'PALETA',
  'CARNE MOLIDA',
  'CHOCLILLO'
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

  /**
   * Normaliza un string para comparación difusa, eliminando
   * espacios, acentos y caracteres que el OCR suele confundir.
   */
  private normalizeForMatching(str: string): string {
    return str
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/\s+/g, '')
      .replace(/[1IL|!]/g, 'I')
      .replace(/[0OQD]/g, 'O')
      .replace(/[5S]/g, 'S')
      .replace(/[8B]/g, 'B')
      .replace(/[UV]/g, 'U')
      .replace(/[CK]/g, 'C')
      .replace(/[GQ]/g, 'G')
      .replace(/[YJ]/g, 'Y')
      .replace(/[^A-Z]/g, '');
  }

  /**
   * Detecta el nombre del corte de carne en el texto del OCR.
   * 
   * Estrategias (en orden de prioridad):
   * 1. Buscar "Producto:" y extraer el nombre que le sigue.
   * 2. Coincidencia difusa contra el catálogo de cortes.
   */
  private detectCut(text: string): string | null {
    // Estrategia 1: Buscar "Producto:" (etiquetas brasileñas/chilenas)
    // Ejemplo: "Producto: [464544] ASADO DEL CARNICERO"
    const productoMatch = text.match(/PRODUC?TO\s*:?\s*(?:\[\d+\])?\s*(.+)/i);
    if (productoMatch) {
      const productLine = productoMatch[1].trim().toUpperCase();
      // Intentar matchear contra el catálogo
      for (const cut of this.cuts) {
        if (productLine.includes(cut)) {
          return cut;
        }
        // Fuzzy match también
        const normalizedProduct = this.normalizeForMatching(productLine);
        const normalizedCut = this.normalizeForMatching(cut);
        if (normalizedProduct.includes(normalizedCut)) {
          return cut;
        }
      }
      // Si no matchea el catálogo pero tiene al menos 4 caracteres,
      // extraer las primeras palabras significativas como nombre de corte
      const cleanProduct = productLine.replace(/\d+/g, '').replace(/[[\]()]/g, '').trim();
      if (cleanProduct.length >= 4) {
        // Tomar hasta las primeras 4 palabras significativas
        const words = cleanProduct.split(/\s+/).slice(0, 4).join(' ');
        return words;
      }
    }

    // Estrategia 2: Búsqueda difusa contra el catálogo completo
    const normalizedText = this.normalizeForMatching(text);
    
    // Priorizar cortes más largos (más específicos) primero
    const sortedCuts = [...this.cuts].sort((a, b) => b.length - a.length);
    
    for (const cut of sortedCuts) {
      const normalizedCut = this.normalizeForMatching(cut);
      if (normalizedText.includes(normalizedCut)) {
        return cut;
      }
    }

    // Estrategia 3: Buscar variaciones comunes en texto completo
    // "CARNE ENFRIADA DE VACUNO" -> buscar "VACUNO", "BOVINO", etc.
    const meatKeywords = [
      { keyword: 'ASADO', cut: 'ASADO' },
      { keyword: 'FILETE', cut: 'FILETE' },
      { keyword: 'LOMO', cut: 'LOMO' },
      { keyword: 'POSTA', cut: 'POSTA' },
      { keyword: 'ENTRA', cut: 'ENTRAÑA' },
    ];
    
    for (const { keyword, cut } of meatKeywords) {
      if (text.includes(keyword)) {
        // Intentar extraer más contexto
        const idx = text.indexOf(keyword);
        const context = text.substring(idx, Math.min(idx + 30, text.length)).split('\n')[0].trim();
        const words = context.split(/\s+/).slice(0, 4).join(' ');
        return words.length > 3 ? words : cut;
      }
    }

    return null;
  }

  /**
   * Detecta el peso neto de la caja en el texto del OCR.
   * 
   * Estrategias (en orden de prioridad):
   * 1. Validación matemática: Tara + Neto = Bruto
   * 2. Proximidad a palabras clave como "PESO NETO", "NETO", "LIQUIDO"
   * 3. Búsqueda en todo el texto por patrones numéricos razonables
   */
  private detectNetWeight(text: string): { weight: number | null; needsReview: boolean } {
    // Extraer todos los números con decimales del texto completo
    const numberRegex = /(\d+)[.,](\d{1,3})/g;
    const rawMatches: { full: string; value: number }[] = [];
    let match;
    
    while ((match = numberRegex.exec(text)) !== null) {
      const numStr = match[1] + '.' + match[2];
      const value = parseFloat(numStr);
      if (!isNaN(value) && value > 0) {
        rawMatches.push({ full: match[0], value });
      }
    }
    
    if (rawMatches.length === 0) {
      return { weight: null, needsReview: true };
    }

    const numbers = rawMatches.map(m => m.value);
    const uniqueNumbers = Array.from(new Set(numbers)).sort((a, b) => a - b);

    // ======= ESTRATEGIA 1: Validación matemática =======
    // Si encontramos 3 números donde Bruto - Neto ≈ Tara, es una coincidencia perfecta
    if (uniqueNumbers.length >= 3) {
      for (let i = uniqueNumbers.length - 1; i >= 2; i--) {
        const bruto = uniqueNumbers[i];
        for (let j = i - 1; j >= 1; j--) {
          const neto = uniqueNumbers[j];
          for (let k = j - 1; k >= 0; k--) {
            const tara = uniqueNumbers[k];
            
            if (Math.abs(bruto - neto - tara) < 0.1 && neto >= 3 && neto <= 50 && tara < 5) {
              return { weight: neto, needsReview: false };
            }
          }
        }
      }
    }

    // ======= ESTRATEGIA 2: Búsqueda por palabras clave en líneas =======
    const netKeywords = ['PESO NETO', 'NETO', 'NET WEIGHT', 'NET', 'PESO LIQUIDO', 'LIQUIDO', 'P.NETO', 'P. NETO', 'P.NET', 'LIQ'];
    const grossKeywords = ['PESO BRUTO', 'BRUTO', 'PESO GRUESO', 'GRUESO', 'GROSS', 'BRUT'];
    const taraKeywords = ['TARA', 'TARE'];
    
    // Buscar por proximidad: keyword cerca de un número
    const lines = text.split('\n');
    let netFromKeyword: number | null = null;
    let grossFromKeyword: number | null = null;
    
    for (const line of lines) {
      const upperLine = line.toUpperCase();
      const lineNumbers = [...upperLine.matchAll(/(\d+)[.,](\d{1,3})/g)].map(m => {
        return parseFloat(m[1] + '.' + m[2]);
      }).filter(n => !isNaN(n) && n > 0);
      
      if (lineNumbers.length === 0) continue;
      
      const isNetLine = netKeywords.some(kw => upperLine.includes(kw));
      const isGrossLine = grossKeywords.some(kw => upperLine.includes(kw));
      const isTaraLine = taraKeywords.some(kw => upperLine.includes(kw));
      
      if (isNetLine && !isGrossLine && !isTaraLine) {
        // Tomar el número más grande de la línea (probablemente el peso neto)
        const validNums = lineNumbers.filter(n => n >= 3 && n <= 50);
        if (validNums.length > 0) {
          netFromKeyword = Math.max(...validNums);
        }
      }
      
      if (isGrossLine && !isNetLine) {
        const validNums = lineNumbers.filter(n => n >= 3 && n <= 50);
        if (validNums.length > 0) {
          grossFromKeyword = Math.max(...validNums);
        }
      }
    }
    
    if (netFromKeyword !== null) {
      return { weight: netFromKeyword, needsReview: false };
    }

    // ======= ESTRATEGIA 3: Si encontramos Bruto pero no Neto, deducir =======
    if (grossFromKeyword !== null) {
      // Si tenemos bruto, buscar un número menor que sea el neto
      const possibleNet = uniqueNumbers.filter(n => n < grossFromKeyword && n >= 3 && n <= 50);
      if (possibleNet.length > 0) {
        // Tomar el más grande que sea menor al bruto (probable neto)
        return { weight: Math.max(...possibleNet), needsReview: true };
      }
    }

    // ======= ESTRATEGIA 4: Heurística con todos los números =======
    const validWeights = uniqueNumbers.filter(n => n >= 3 && n <= 50);
    
    if (validWeights.length === 1) {
      return { weight: validWeights[0], needsReview: true };
    }
    
    if (validWeights.length === 2) {
      // Si hay exactamente 2 pesos válidos, el menor probablemente es el neto
      return { weight: Math.min(...validWeights), needsReview: true };
    }

    return { weight: null, needsReview: true };
  }
}

export const parserService = new ParserService();
