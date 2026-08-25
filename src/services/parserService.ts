export interface ParseResult {
  cutCandidate: string | null;
  weightCandidate: number | null;
  needsReview: boolean;
  confidence: 'high' | 'low' | 'none';
}

const DEFAULT_CUTS = [
  // Cortes de vacuno comunes en Chile/Sudamérica
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
  'OSSOBUCO'
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

  private normalizeForMatching(str: string): string {
    return str
      .toUpperCase()
      .replace(/\s+/g, '')                  // Eliminar espacios
      .replace(/[1IL|]/g, 'L')              // Normalizar caracteres tipo 'L' o 'I' o '|'
      .replace(/[0OQ]/g, 'O')               // Normalizar ceros y 'O'
      .replace(/[UÚ]/g, 'U')
      .replace(/[AÁ]/g, 'A')
      .replace(/[EÉ]/g, 'E')
      .replace(/[IÍ]/g, 'I')
      .replace(/[OÓ]/g, 'O');
  }

  private detectCut(text: string): string | null {
    const normalizedText = this.normalizeForMatching(text);
    
    for (const cut of this.cuts) {
      const normalizedCut = this.normalizeForMatching(cut);
      if (normalizedText.includes(normalizedCut)) {
        return cut;
      }
    }
    return null;
  }

  private detectNetWeight(text: string): { weight: number | null; needsReview: boolean } {
    // 1. Extraer todos los números que parezcan pesos (con decimales)
    // Coincide con números como 16.65, 17,85, 1.200
    const numberRegex = /\b\d+[.,]\d{1,3}\b/g;
    const matches = text.match(numberRegex);
    
    if (!matches) {
      return { weight: null, needsReview: true };
    }

    // Parsear a floats únicos ordenados de menor a mayor
    const numbers = Array.from(new Set(
      matches.map(m => parseFloat(m.replace(',', '.')))
    )).sort((a, b) => a - b);

    // 2. Intentar validación matemática de balanza: Tara + Neto = Bruto
    // Buscamos cualquier combinación A - B = T donde:
    // A es Bruto (el mayor), B es Neto (el del medio), T es Tara (el menor)
    if (numbers.length >= 3) {
      for (let i = numbers.length - 1; i >= 2; i--) {
        const A = numbers[i]; // Candidato a Bruto (más grande)
        for (let j = i - 1; j >= 1; j--) {
          const B = numbers[j]; // Candidato a Neto
          for (let k = j - 1; k >= 0; k--) {
            const T = numbers[k]; // Candidato a Tara
            
            // Si A (Bruto) - B (Neto) es aproximadamente T (Tara)
            // Y el peso neto está en un rango razonable para una caja de carne (ej: 4kg a 45kg)
            // Y la tara es razonable (ej: < 4kg)
            if (Math.abs(A - B - T) < 0.05 && B >= 4 && B <= 45 && T < 4) {
              return { weight: B, needsReview: false }; // ¡Coincidencia matemática exacta encontrada!
            }
          }
        }
      }
    }

    // 3. Si no hay validación matemática, buscar por palabras clave
    const netKeywords = ['PESO NETO', 'NETO', 'NET WEIGHT', 'NET', 'PESO LIQUIDO', 'LIQUIDO', 'P.NETO', 'P.NET', 'LIQ'];
    const grossKeywords = ['PESO BRUTO', 'BRUTO', 'PESO GRUESO', 'GRUESO', 'GROSS', 'BRUT'];
    
    const hasNetKeyword = netKeywords.some(kw => text.includes(kw));
    const hasGrossKeyword = grossKeywords.some(kw => text.includes(kw));

    // Filtrar números en rango típico de caja de carne (4kg a 45kg)
    const validWeights = numbers.filter(n => n >= 4 && n <= 45);

    if (validWeights.length === 1) {
      // Si solo hay un peso lógico en la etiqueta y hay palabra clave de Neto
      return { weight: validWeights[0], needsReview: !hasNetKeyword };
    }

    if (validWeights.length >= 2) {
      // Si tenemos al menos dos pesos lógicos (probablemente Bruto y Neto)
      // Y detectamos ambas palabras clave en la etiqueta
      if (hasNetKeyword && hasGrossKeyword) {
        // En cajas de carne, el Peso Neto es SIEMPRE menor que el Peso Bruto
        // Tomamos el menor de los dos pesos más grandes
        const sortedValid = validWeights.sort((a, b) => b - a); // orden descendente
        const net = sortedValid[1];
        
        return { weight: net, needsReview: false };
      }
      
      // Si no tenemos ambas palabras clave pero sí la de neto, tomamos el menor por descarte
      if (hasNetKeyword) {
        const sortedValid = validWeights.sort((a, b) => a - b);
        return { weight: sortedValid[0], needsReview: true };
      }
    }

    return { weight: null, needsReview: true };
  }
}

export const parserService = new ParserService();
