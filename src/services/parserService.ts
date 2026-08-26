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
   * 1. Buscar "Producto:" / "Produto:" y extraer el nombre que le sigue.
   *    - Maneja variaciones del OCR: [464544], (464544), o solo 464544
   *    - Si el nombre se parte en la siguiente línea, intenta continuarlo
   * 2. Coincidencia difusa contra el catálogo de cortes.
   */
  private detectCut(text: string): string | null {
    // Estrategia 1: Buscar "Producto:" / "Produto:" (etiquetas brasileñas/chilenas)
    // Maneja variaciones del OCR:
    //   Producto: [464544] ASADO DEL CARNICERO
    //   Produto: (464544) ASADO DEL CARNICERO
    //   Produto: 464544 ASADO DEL CARNICERO
    // El código de producto puede estar entre [], (), o sin delimitadores
    const productoRegex = /PRODUC?TO\s*[:=]?\s*(?:[\[(]?\s*\d+\s*[\])]?\s*)?(.+)/i;
    const productoMatch = text.match(productoRegex);
    if (productoMatch) {
      let productLine = productoMatch[1].trim().toUpperCase();

      // Si la línea termina de forma sospechosa corta (< 5 chars),
      // intentar concatenar la siguiente línea no vacía
      if (productLine.replace(/[^A-Z]/gi, '').length < 5) {
        const afterMatch = text.substring(text.indexOf(productoMatch[0]) + productoMatch[0].length);
        const nextLine = afterMatch.split('\n').find(l => l.trim().length > 3);
        if (nextLine) productLine = (productLine + ' ' + nextLine.trim()).toUpperCase();
      }

      // Limpiar: quitar números sueltos y corchetes/paréntesis residuales
      const cleanProduct = productLine
        .replace(/^[\[(]?\s*\d+\s*[\]):]?\s*/, '') // código al inicio
        .replace(/\b\d{3,}\b/g, '')               // números largos (códigos)
        .replace(/[\[\]()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanProduct.length >= 4) {
        // Intentar matchear contra el catálogo
        for (const cut of this.cuts) {
          if (cleanProduct.includes(cut)) return cut;
          const normalizedProduct = this.normalizeForMatching(cleanProduct);
          const normalizedCut = this.normalizeForMatching(cut);
          if (normalizedProduct.includes(normalizedCut)) return cut;
        }
        // Si no matchea el catálogo, usar las primeras 4 palabras significativas
        const words = cleanProduct.split(/\s+/).slice(0, 4).join(' ');
        if (words.length >= 4) return words;
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
   * 1. Búsqueda por palabras clave en la misma línea O en la línea siguiente
   *    (las etiquetas tipo tabla ponen el header en una fila y el valor en la siguiente)
   * 2. Validación matemática: Tara + Neto = Bruto
   * 3. Búsqueda heurística con todos los números
   */
  private detectNetWeight(text: string): { weight: number | null; needsReview: boolean } {
    const numberRegex = /(\d+)[.,](\d{1,3})/g;
    const rawMatches: { full: string; value: number; index: number }[] = [];
    let match;

    // Incluir ceros también (tara puede ser 0,000)
    while ((match = numberRegex.exec(text)) !== null) {
      const numStr = match[1] + '.' + match[2];
      const value = parseFloat(numStr);
      if (!isNaN(value) && value >= 0) {
        rawMatches.push({ full: match[0], value, index: match.index });
      }
    }

    if (rawMatches.length === 0) {
      return { weight: null, needsReview: true };
    }

    const positiveValues = rawMatches.map(m => m.value).filter(v => v > 0);
    const uniqueNumbers = Array.from(new Set(positiveValues)).sort((a, b) => a - b);
    const allValues = rawMatches.map(m => m.value); // incluye 0 para math check
    const uniqueAll = Array.from(new Set(allValues)).sort((a, b) => a - b);

    // ======= ESTRATEGIA 1: Búsqueda por palabras clave (misma línea O línea siguiente) =======
    // Las etiquetas de caja de carne tipo tabla tienen:
    //   Fila A: PESO NETO (kg)  PESO LIQUIDO (kg)
    //   Fila B: 16,65
    // → buscar en la línea de la keyword Y en las 2 líneas siguientes
    const netKeywords = [
      'PESO NETO', 'PESO LIQUIDO', 'PESO LIQ', 'P. NETO', 'P.NETO',
      'NET WEIGHT', 'NETO', 'LIQUIDO', 'NET', 'LIQ', 'P.NET',
    ];
    const grossKeywords = ['PESO BRUTO', 'PESO GRUESO', 'PESO BRUT', 'GROSS', 'BRUTO', 'GRUESO', 'BRUT'];
    const taraKeywords  = ['TARA', 'TARE'];

    const lines = text.split('\n');
    let netFromKeyword: number | null = null;
    let grossFromKeyword: number | null = null;

    const extractValidNums = (s: string) =>
      [...s.toUpperCase().matchAll(/(\d+)[.,](\d{1,3})/g)]
        .map(m => parseFloat(m[1] + '.' + m[2]))
        .filter(n => !isNaN(n) && n >= 3 && n <= 50);

    for (let i = 0; i < lines.length; i++) {
      const upper = lines[i].toUpperCase();
      const isNetLine   = netKeywords.some(kw  => upper.includes(kw));
      const isGrossLine = grossKeywords.some(kw => upper.includes(kw));
      const isTaraLine  = taraKeywords.some(kw  => upper.includes(kw));

      if (!isNetLine && !isGrossLine) continue;

      // Ventana de búsqueda: la línea actual + las 2 siguientes
      const window = lines.slice(i, i + 3).join(' ');
      const nums = extractValidNums(window);

      if (isNetLine && !isGrossLine && !isTaraLine) {
        // En una fila con PESO NETO y PESO BRUTO juntos (tabla), tomar el MENOR
        // (el neto siempre es menor que el bruto)
        const windowHasBoth = isGrossLine;
        if (!windowHasBoth && nums.length > 0) {
          netFromKeyword = Math.min(...nums); // el menor es el neto
        } else if (nums.length > 0) {
          netFromKeyword = Math.min(...nums);
        }
      }

      if (isGrossLine && !isNetLine) {
        if (nums.length > 0) grossFromKeyword = Math.max(...nums);
      }

      // Caso especial: línea con AMBAS keywords (header compacto)
      // Ej: "PESO GRUESO (kg) PESO NETO (kg)"
      // → los valores están en la línea siguiente
      if (isNetLine && isGrossLine && !isTaraLine) {
        const nextNums = extractValidNums(lines.slice(i + 1, i + 3).join(' '));
        if (nextNums.length >= 2) {
          // El neto es el último número (más a la derecha en la tabla)
          netFromKeyword = nextNums[nextNums.length - 1];
          grossFromKeyword = nextNums[0];
        } else if (nextNums.length === 1) {
          netFromKeyword = nextNums[0];
        }
      }
    }

    if (netFromKeyword !== null) {
      return { weight: netFromKeyword, needsReview: false };
    }

    // ======= ESTRATEGIA 2: Validación matemática Bruto - Tara = Neto =======
    // Incluye tara=0 (que el filtro >0 excluía antes)
    if (uniqueAll.length >= 3) {
      for (let i = uniqueAll.length - 1; i >= 2; i--) {
        const bruto = uniqueAll[i];
        for (let j = i - 1; j >= 1; j--) {
          const neto = uniqueAll[j];
          for (let k = j - 1; k >= 0; k--) {
            const tara = uniqueAll[k];
            if (Math.abs(bruto - neto - tara) < 0.15 && neto >= 3 && neto <= 50 && tara < 5) {
              return { weight: neto, needsReview: false };
            }
          }
        }
      }
    }
    // Math check con sólo dos números: Bruto - Tara (si tenemos bruto del keyword)
    if (grossFromKeyword !== null) {
      const possibleNet = uniqueNumbers.filter(n => n < grossFromKeyword && n >= 3 && n <= 50);
      if (possibleNet.length > 0) {
        return { weight: Math.max(...possibleNet), needsReview: true };
      }
    }

    // ======= ESTRATEGIA 3: Heurística con todos los números válidos =======
    const validWeights = uniqueNumbers.filter(n => n >= 3 && n <= 50);

    if (validWeights.length === 1) return { weight: validWeights[0], needsReview: true };
    if (validWeights.length === 2) return { weight: Math.min(...validWeights), needsReview: true };

    return { weight: null, needsReview: true };
  }
}

export const parserService = new ParserService();
