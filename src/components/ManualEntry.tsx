import { useEffect, useRef, useState } from 'react';
import { ListChecks, X } from 'lucide-react';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { MEAT_CUTS } from '../data/meatCuts';

const SORTED_CUTS = [...MEAT_CUTS].sort((a, b) => a.localeCompare(b));

interface ManualEntryProps {
  /** Notifica al resto de la app (Cajas, Resumen) que hay datos nuevos. */
  onAdd: () => void;
}

/**
 * Ventana separada para cargar cortes a mano (sin camara/OCR), pensada para
 * conteo rapido de CAJAS y KILOS durante la recepcion/despacho: los 22
 * cortes del catalogo quedan siempre visibles en una lista vertical. Un
 * toque en el nombre del corte abre un mini formulario para ingresar el
 * peso neto de esa caja; al confirmar, se suma 1 caja y los kg quedan
 * acumulados para ese corte. Cada caja se guarda en la misma tabla `boxes`
 * que usa el escaner, asi que termina apareciendo en "Cajas" y en el
 * "Resumen" general junto con lo escaneado.
 */
export const ManualEntry: React.FC<ManualEntryProps> = ({ onAdd }) => {
  const [manualBoxes, setManualBoxes] = useState<ScannedBox[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [pendingCut, setPendingCut] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const weightInputRef = useRef<HTMLInputElement>(null);

  const loadManualBoxes = async () => {
    const boxes = await db.boxes.toArray();
    setManualBoxes(boxes.filter(b => b.source === 'manual'));
  };

  useEffect(() => {
    loadManualBoxes();
  }, []);

  // El aviso de "+1 caja de X" se borra solo despues de un ratito.
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 1500);
    return () => clearTimeout(t);
  }, [justAdded]);

  // Foco automatico en el input de peso al abrir el mini formulario, para
  // que en el celular salga el teclado numerico de una sola vez.
  useEffect(() => {
    if (pendingCut) weightInputRef.current?.focus();
  }, [pendingCut]);

  const openWeightPrompt = (cut: string) => {
    setWeightInput('');
    setPendingCut(cut);
  };

  const closeWeightPrompt = () => {
    setPendingCut(null);
    setWeightInput('');
  };

  const confirmAdd = async () => {
    if (!pendingCut) return;
    const weight = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(weight) || weight < 0) {
      alert('Ingresá un peso válido en kg (ej: 12,450).');
      return;
    }

    await db.boxes.add({
      cutName: pendingCut,
      netWeight: weight,
      timestamp: Date.now(),
      manualCorrection: false,
      status: 'valid',
      source: 'manual',
    });

    setJustAdded(pendingCut);
    closeWeightPrompt();
    await loadManualBoxes();
    onAdd();
  };

  const handleUndo = async (id?: number) => {
    if (!id) return;
    await db.boxes.delete(id);
    await loadManualBoxes();
    onAdd();
  };

  const boxesFor = (cut: string) => manualBoxes.filter(b => b.cutName === cut);

  const lastTen = [...manualBoxes].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

  return (
    <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Tocá un corte para cargar una caja</h2>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}
          onClick={() => setShowRecent(true)}
        >
          <ListChecks size={16} />
          Últimas 10
        </button>
      </div>

      <div style={{ minHeight: '1.25rem', textAlign: 'center' }}>
        {justAdded && (
          <span style={{ color: 'var(--success-color)', fontSize: '0.875rem', fontWeight: 600 }}>
            + 1 caja de {justAdded}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {SORTED_CUTS.map(cut => {
          const boxes = boxesFor(cut);
          const count = boxes.length;
          const totalKg = boxes.reduce((sum, b) => sum + b.netWeight, 0);
          return (
            <button
              key={cut}
              type="button"
              onClick={() => openWeightPrompt(cut)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: count > 0 ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.1)',
                backgroundColor: count > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease'
              }}
            >
              <span>
                {cut}
                {count > 0 && (
                  <span style={{ display: 'block', fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {totalKg.toFixed(3)} kg
                  </span>
                )}
              </span>
              {count > 0 && (
                <span
                  style={{
                    backgroundColor: 'var(--accent-color)',
                    color: 'white',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.15rem 0.65rem',
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pendingCut && (
        <div className="modal-overlay" onClick={closeWeightPrompt}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{pendingCut}</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                confirmAdd();
              }}
            >
              <div className="form-group">
                <label htmlFor="manual-weight-input">Peso neto (kg)</label>
                <input
                  ref={weightInputRef}
                  id="manual-weight-input"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  className="form-control"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  placeholder="Ej: 12,450"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeWeightPrompt}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Agregar caja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRecent && (
        <div className="modal-overlay" onClick={() => setShowRecent(false)}>
          <div
            className="modal-content"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="modal-title">Últimas 10 cajas cargadas a mano</h2>

            {lastTen.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                Todavía no cargaste ninguna caja a mano.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {lastTen.map((box, i) => (
                  <div key={box.id} className="list-item">
                    <div className="list-item-content">
                      <div className="list-item-title">{i + 1}. {box.cutName}</div>
                      <div className="list-item-subtitle">
                        {box.netWeight.toFixed(3)} kg • {new Date(box.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="list-item-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem' }}
                        onClick={() => handleUndo(box.id)}
                        title="Deshacer esta caja"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowRecent(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
