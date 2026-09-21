import { useEffect, useState } from 'react';
import { PackagePlus, Minus } from 'lucide-react';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { groupBoxesByCut } from '../services/summaryService';
import { MEAT_CUTS } from '../data/meatCuts';

const SORTED_CUTS = [...MEAT_CUTS].sort((a, b) => a.localeCompare(b));

interface ManualEntryProps {
  /** Notifica al resto de la app (Cajas, Resumen) que hay datos nuevos. */
  onAdd: () => void;
}

/**
 * Ventana separada para cargar cortes a mano (sin camara/OCR), pensada
 * para conteos rapidos: elegis el corte, cuantas cajas contaste, y las
 * vas sumando. Cada caja se guarda en la misma tabla `boxes` que usa el
 * escaner, asi que termina apareciendo en "Cajas" y en el "Resumen"
 * general (junto con lo escaneado) sin duplicar logica de reporte.
 */
export const ManualEntry: React.FC<ManualEntryProps> = ({ onAdd }) => {
  const [selectedCut, setSelectedCut] = useState<string>(SORTED_CUTS[0]);
  const [quantity, setQuantity] = useState<number>(1);
  const [manualBoxes, setManualBoxes] = useState<ScannedBox[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadManualBoxes = async () => {
    const boxes = await db.boxes.toArray();
    setManualBoxes(boxes.filter(b => b.source === 'manual'));
  };

  useEffect(() => {
    loadManualBoxes();
  }, []);

  const handleAdd = async () => {
    const qty = Math.floor(quantity);
    if (!selectedCut || isNaN(qty) || qty < 1) {
      alert('Elegí un corte y una cantidad válida de cajas (mínimo 1).');
      return;
    }

    const now = Date.now();
    const newBoxes: ScannedBox[] = Array.from({ length: qty }, (_, i) => ({
      cutName: selectedCut,
      netWeight: 0,
      timestamp: now + i, // evita timestamps identicos si se ordena por fecha
      manualCorrection: false,
      status: 'valid' as const,
      source: 'manual' as const,
    }));

    await db.boxes.bulkAdd(newBoxes);
    setFeedback(`Se agregaron ${qty} caja${qty === 1 ? '' : 's'} de ${selectedCut}.`);
    setQuantity(1);
    await loadManualBoxes();
    onAdd();
  };

  const handleRemoveOne = async (cut: string) => {
    const candidates = manualBoxes
      .filter(b => b.cutName === cut)
      .sort((a, b) => b.timestamp - a.timestamp);
    const last = candidates[0];
    if (!last?.id) return;
    await db.boxes.delete(last.id);
    setFeedback(`Se quitó 1 caja de ${cut}.`);
    await loadManualBoxes();
    onAdd();
  };

  const tally = groupBoxesByCut(manualBoxes);
  const totalManualBoxes = manualBoxes.length;

  return (
    <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 className="card-title">Carga Manual de Cortes</h2>

        <div className="form-group">
          <label htmlFor="manual-cut-select">Corte</label>
          <select
            id="manual-cut-select"
            className="form-control"
            value={selectedCut}
            onChange={e => setSelectedCut(e.target.value)}
          >
            {SORTED_CUTS.map(cut => (
              <option key={cut} value={cut}>{cut}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="manual-qty-input">Cantidad de cajas a agregar</label>
          <input
            id="manual-qty-input"
            type="number"
            min={1}
            step={1}
            className="form-control"
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
          />
        </div>

        <button type="button" className="btn btn-primary" onClick={handleAdd}>
          <PackagePlus size={18} />
          Agregar cajas
        </button>

        {feedback && (
          <p style={{ color: 'var(--success-color)', fontSize: '0.875rem', marginTop: '0.75rem', textAlign: 'center' }}>
            {feedback}
          </p>
        )}
      </div>

      <div>
        <h2 className="card-title">Cargado en esta sesión manual ({totalManualBoxes} cajas)</h2>

        {tally.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '1rem' }}>
            Todavía no cargaste ningún corte a mano.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tally.map(item => (
              <div key={item.cut} className="list-item">
                <div className="list-item-content">
                  <div className="list-item-title">{item.cut}</div>
                  <div className="list-item-subtitle">{item.count} caja{item.count === 1 ? '' : 's'}</div>
                </div>
                <div className="list-item-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem' }}
                    onClick={() => handleRemoveOne(item.cut)}
                    title={`Quitar 1 caja de ${item.cut}`}
                  >
                    <Minus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
          El reporte total (escaneadas + manuales) está en la pestaña "Resumen".
        </p>
      </div>
    </div>
  );
};
