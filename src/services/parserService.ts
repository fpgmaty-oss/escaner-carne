export interface ParseResult {
  cutCandidate: string | null;
  weightCandidate: number | null;
  needsReview: boolean;
  confidence: 'high' | 'low' | 'none';
  /**
   * Cortes del catalogo mas parecidos al texto leido, ordenados de mas a
   * menos parecido. Se llenan solo cuando no hubo un match solido contra
   * el catalogo (cutCandidate es null, o vino de una heuristica sin
   * validar), para que el usuario pueda elegir con un toque en vez de
   * escribir todo a mano.
   */
  cutSuggestions: string[];
}

/** Palabras sin valor discriminante para el matching de cortes. */
const STOPWORDS = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y']);

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
    
    const detected = this.detectCut(upperText);
    const cutCandidate = detected ? detected.cut : null;
    const { weight, needsReview: weightNeedsReview } = this.detectNetWeight(upperText);

    // Si el corte no vino de un match contra el catalogo (fue una
    // heuristica de "primeras palabras" o una keyword suelta como
    // "ASADO"), no confiamos ciegamente: forzamos revision manual en vez
    // de auto-registrar algo que puede estar incompleto o mal.
    const cutNeedsReview = cutCandidate !== null && !detected!.matchedCatalog;
    const needsReview = weightNeedsReview || cutNeedsReview;

    let confidence: 'high' | 'low' | 'none' = 'none';
    
    if (cutCandidate && weight) {
      confidence = needsReview ? 'low' : 'high';
    } else if (cutCandidate || weight) {
      confidence = 'low';
    }

    // Ofrecemos sugerencias del catalogo cuando no tenemos un corte, o
    // cuando el que tenemos es solo una adivinanza sin validar.
    const cutSuggestions = (!cutCandidate || cutNeedsReview)
      ? this.getCutSuggestions(upperText)
      : [];

    return {
      cutCandidate,
      weightCandidate: weight,
      needsReview: needsReview || (cutCandidate !== null && weight !== null && confidence === 'low'),
      confidence,
      cutSuggestions
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

  private diceCoefficient(strA: string, strB: string): number {    if (strA === strB) return 1;
    if (strA.length < 2 || strB.length < 2) return 0;
    const toBigrams = (s: string): Map<string, number> => {
      const map = new Map<string, number>();
      for (let i = 0; i < s.length - 1; i++) {
        const bg = s.substring(i, i + 2);
        map.set(bg, (map.get(bg) || 0) + 1);
      }
      return map;
    };
    const bigramsA = toBigrams(strA);
    const bigramsB = toBigrams(strB);
    let intersection = 0;
    bigramsA.forEach((countA, bg) => {
      const countB = bigramsB.get(bg) || 0;
      intersection += Math.min(countA, countB);
    });
    const totalBigrams = (strA.length - 1) + (strB.length - 1);
    return totalBigrams === 0 ? 0 : (2 * intersection) / totalBigrams;
  }

  /**
   * Extrae palabras relevantes de un string: mayusculas, sin acentos,
   * sin puntuacion, descartando palabras muy cortas o sin valor (stopwords).
   */
  private extractWords(str: string): string[] {
    return str
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  }

  /**
   * Busca en el catalogo los cortes mas parecidos al texto leido por el
   * OCR, para ofrecerlos como sugerencias clickeables cuando no hay un
   * match solido. Compara palabra por palabra con el coeficiente de Dice,
   * asi que "ASADO" sugiere tanto "ASADO DEL CARNICERO" como "ASADO DE
   * TIRA", y tolera errores tipicos de OCR (ej. "ASAD0").
   */
  public getCutSuggestions(text: string, maxResults = 3): string[] {
    const textWords = this.extractWords(text);
    if (textWords.length === 0) return [];

    const scored = this.cuts.map(cut => {
      const cutWords = this.extractWords(cut);
      if (cutWords.length === 0) return { cut, score: 0, coverage: 0 };

      let bestOverall = 0;
      let matchedWords = 0;
      for (const cutWord of cutWords) {
        const bestForWord = Math.max(...textWords.map(tw => this.diceCoefficient(cutWord, tw)));
        if (bestForWord > bestOverall) bestOverall = bestForWord;
        if (bestForWord >= 0.6) matchedWords++;
      }

      // El score principal es la mejor palabra que matchea (para que
      // "ASADO" solo alcance para sugerir "ASADO DEL CARNICERO"); la
      // cobertura (cuantas palabras del corte aparecen en el texto) se usa
      // solo para desempatar entre varias sugerencias igual de buenas.
      const coverage = matchedWords / cutWords.length;
      return { cut, score: bestOverall, coverage };
    });

    return scored
      .filter(s => s.score >= 0.6)
      .sort((a, b) => (b.score - a.score) || (b.coverage - a.coverage))
      .slice(0, maxResults)
      .map(s => s.cut);
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
  private detectCut(text: string): { cut: string; matchedCatalog: boolean } | null {
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
          if (cleanProduct.includes(cut)) return { cut, matchedCatalog: true };
          const normalizedProduct = this.normalizeForMatching(cleanProduct);
          const normalizedCut = this.normalizeForMatching(cut);
          if (normalizedProduct.includes(normalizedCut)) return { cut, matchedCatalog: true };
        }
        // Si no matchea el catálogo, usar las primeras 4 palabras significativas
        const words = cleanProduct.split(/\s+/).slice(0, 4).join(' ');
        if (words.length >= 4) return { cut: words, matchedCatalog: false };
      }
    }

    // Estrategia 2: Búsqueda difusa contra el catálogo completo
    const normalizedText = this.normalizeForMatching(text);
    
    // Priorizar cortes más largos (más específicos) primero
    const sortedCuts = [...this.cuts].sort((a, b) => b.length - a.length);
    
    for (const cut of sortedCuts) {
      const normalizedCut = this.normalizeForMatching(cut);
      if (normalizedText.includes(normalizedCut)) {
        return { cut, matchedCatalog: true };
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
        return { cut: words.length > 3 ? words : cut, matchedCatalog: false };
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
  private findMathNeto(uniqueAll: number[]): number | null {
    if (uniqueAll.length < 3) return null;
    for (let i = uniqueAll.length - 1; i >= 2; i--) {
      const bruto = uniqueAll[i];
      for (let j = i - 1; j >= 1; j--) {
        const neto = uniqueAll[j];
        for (let k = j - 1; k >= 0; k--) {
          const tara = uniqueAll[k];
          if (Math.abs(bruto - neto - tara) < 0.15 && neto >= 3 && neto <= 50 && tara < 5) {
            return neto;
          }
        }
      }
    }
    return null;
  }

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

      if (isNetLine && !isGrossLine && !isTaraLine) {
        // Preferir el numero en la MISMA linea que la keyword de Neto: es
        // el caso mas confiable (ej. "PESO NETO: 16,65").
        const sameLineNums = extractValidNums(lines[i]);
        if (sameLineNums.length > 0) {
          netFromKeyword = Math.min(...sameLineNums);
        } else {
          // Formato tabla: el titulo y el valor estan en filas separadas.
          // Buscamos en las 2 lineas siguientes, pero DESCARTANDO
          // cualquiera que sea a su vez una fila de Bruto o Tara -
          // asi evitamos confundir esos valores con el Neto (bug real
          // que causaba registrar la Tara como si fuera el Neto).
          const followingLines = lines.slice(i + 1, i + 3).filter(l => {
            const u = l.toUpperCase();
            return !grossKeywords.some(kw => u.includes(kw)) && !taraKeywords.some(kw => u.includes(kw));
          });
          const nums = extractValidNums(followingLines.join(' '));
          if (nums.length > 0) netFromKeyword = Math.min(...nums);
        }
      }

      if (isGrossLine && !isNetLine) {
        const window = lines.slice(i, i + 3).join(' ');
        const nums = extractValidNums(window);
        if (nums.length > 0) grossFromKeyword = Math.max(...nums);
      }

      // Caso especial: línea con AMBAS keywords (header compacto)
      // Ej: "PESO GRUESO (kg) PESO NETO (kg)"
      // → los valores están en la línea siguiente
      if (isNetLine && isGrossLine && !isTaraLine) {
        const nextLinesNoTara = lines.slice(i + 1, i + 3).filter(l => !taraKeywords.some(kw => l.toUpperCase().includes(kw)));
        const nextNums = extractValidNums(nextLinesNoTara.join(' '));
        if (nextNums.length >= 2) {
          // El neto es el último número (más a la derecha en la tabla)
          netFromKeyword = nextNums[nextNums.length - 1];
          grossFromKeyword = nextNums[0];
        } else if (nextNums.length === 1) {
          netFromKeyword = nextNums[0];
        }
      }
    }

    const mathNeto = this.findMathNeto(uniqueAll);

    if (netFromKeyword !== null) {
      const conflictsWithMath = mathNeto !== null && Math.abs(mathNeto - netFromKeyword) > 0.2;
      // Si hay conflicto, el chequeo matematico (Bruto - Tara = Neto) es
      // una senal mas confiable que el heuristico de lineas/keywords, asi
      // que preferimos ese valor - pero igual pedimos revision manual por
      // las dudas, en vez de confiar ciegamente en ninguno de los dos.
      if (conflictsWithMath) {
        return { weight: mathNeto, needsReview: true };
      }
      return { weight: netFromKeyword, needsReview: false };
    }

    if (mathNeto !== null) {
      return { weight: mathNeto, needsReview: false };
    }

    // Math check con solo dos numeros: Bruto - Tara (si tenemos bruto del keyword)
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
