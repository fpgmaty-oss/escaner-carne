import { useState } from 'react';
import { Trash2, PackageCheck } from 'lucide-react';

export interface MultiBoxCandidate {
  id: string;
  cut: string;
  weight: string; // texto editable; se valida/parsea recien al confirmar
  suggestions: string[];
}

interface MultiBoxReviewProps {
  candidates: MultiBoxCandidate[];
  onConfirm: (boxes: { cut: string; weight: number }[]) => void;
  onCancel: () => void;
}

/**
 * Modal de revision para el modo "una foto con varias cajas": Tesseract
 * detecto varios bloques de texto separados en la misma imagen (ver
 * ocrService.recognizeWithBlocks) y cada uno se parseo por separado. Acá
 * el usuario confirma/corrige cada fila antes de registrarlas todas juntas
 * de una, en vez de tener que sacar una foto por caja.
 */
export const MultiBoxReview: React.FC<MultiBoxReviewProps> = ({ candidates, onConfirm, onCancel }) => {
  const [rows, setRows] = useState<MultiBoxCandidate[]>(candidates);

  const updateRow = (id: string, field: 'cut' | 'weight', value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const totalWeight = rows.reduce((sum, r) => {
    const w = parseFloat(r.weight.replace(',', '.'));
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  const handleConfirm = () => {
    const parsed: { cut: string; weight: number }[] = [];
    for (const row of rows) {
      const weightNum = parseFloat(row.weight.replace(',', '.'));
      if (!row.cut.trim() || isNaN(weightNum)) {
        alert(`Falta completar corte o peso en la caja "${row.cut || '(sin corte)'}"`);
        return;
      }
      parsed.push({ cut: row.cut.trim(), weight: weightNum });
    }
    if (parsed.length === 0) {
      alert('No quedan cajas para registrar');
      return;
    }
    onConfirm(parsed);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 className="modal-title">
          <PackageCheck />
          Se detectaron {rows.length} cajas en la foto
        </h2>

        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
            Quitaste todas las cajas de la lista.
          </p>
        ) : (
          rows.map((row, idx) => (
            <div key={row.id} className="form-group" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Caja {idx + 1}</label>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem' }} onClick={() => removeRow(row.id)} title="Quitar de la lista">
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                type="text"
                className="form-control"
                value={row.cut}
                onChange={e => updateRow(row.id, 'cut', e.target.value)}
                placeholder="Ej: ASADO DEL CARNICERO"
              />
              {row.suggestions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {row.suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateRow(row.id, 'cut', s)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: 'var(--radius-full)',
                        border: row.cut === s ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.15)',
                        backgroundColor: row.cut === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                        color: 'var(--text-primary)',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="number"
                step="0.001"
                className="form-control"
                style={{ marginTop: '0.5rem' }}
                value={row.weight}
                onChange={e => updateRow(row.id, 'weight', e.target.value)}
                placeholder="Peso neto (kg)"
              />
            </div>
          ))
        )}

        {rows.length > 0 && (
          <div style={{ textAlign: 'right', fontWeight: 700, marginBottom: '1rem' }}>
            Total: {totalWeight.toFixed(3)} kg
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={rows.length === 0}>
            Registrar {rows.length} caja{rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
