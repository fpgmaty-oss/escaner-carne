import { useEffect, useRef, useState } from 'react';
import { ListChecks, X, Pencil, Search } from 'lucide-react';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { MEAT_CUTS } from '../data/meatCuts';
import { EditBoxModal } from './EditBoxModal';

const SORTED_CUTS = [...MEAT_CUTS].sort((a, b) => a.localeCompare(b));

type WeightUnit = 'kg' | 'g';

interface ManualEntryProps {
  /** Notifica al resto de la app (Cajas, Resumen) que hay datos nuevos. */
  onAdd: () => void;
}

/** Normaliza para buscar sin acentos y sin importar mayus/minus. */
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/**
 * Ventana separada para cargar cortes a mano (sin camara/OCR), pensada para
 * conteo de CAJAS y KILOS durante la recepcion/despacho: los 22 cortes del
 * catalogo quedan siempre visibles en una lista vertical (filtrable con el
 * buscador). Tocar un corte SIEMPRE abre el mini formulario de peso (no hay
 * atajo para sumar una caja sin peso): como cada caja pesa distinto,
 * agregar "a ciegas" le haria perder el sentido al conteo de kilos.
 */
export const ManualEntry: React.FC<ManualEntryProps> = ({ onAdd }) => {
  const [manualBoxes, setManualBoxes] = useState<ScannedBox[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Mini formulario para AGREGAR una caja nueva (el corte ya viene fijo,
  // porque se elige tocando el boton correspondiente de la lista).
  const [addingCut, setAddingCut] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const weightInputRef = useRef<HTMLInputElement>(null);

  // Caja que se esta corrigiendo (corte y/o peso) desde "Ultimas 10".
  const [editingBox, setEditingBox] = useState<ScannedBox | null>(null);

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
    if (addingCut) weightInputRef.current?.focus();
  }, [addingCut]);

  const openWeightPrompt = (cut: string) => {
    setAddingCut(cut);
    setWeightInput('');
    setWeightUnit('kg');
  };

  const closeWeightPrompt = () => {
    setAddingCut(null);
    setWeightInput('');
  };

  const confirmAdd = async () => {
    if (!addingCut) return;
    const rawValue = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(rawValue) || rawValue < 0) {
      alert('Ingresá un peso válido (ej: 25.5 o 25,5).');
      return;
    }
    // Adentro de la app todo se guarda en KG (asi combina con lo que ya
    // registra el escaner OCR); si el usuario tipeo en gramos, se convierte.
    const netWeight = weightUnit === 'g' ? rawValue / 1000 : rawValue;

    await db.boxes.add({
      cutName: addingCut,
      netWeight,
      timestamp: Date.now(),
      manualCorrection: false,
      status: 'valid',
      source: 'manual',
    });
    setJustAdded(addingCut);

    closeWeightPrompt();
    await loadManualBoxes();
    onAdd();
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await db.boxes.delete(id);
    await loadManualBoxes();
    onAdd();
  };

  const boxesFor = (cut: string) => manualBoxes.filter(b => b.cutName === cut);

  const visibleCuts = search.trim()
    ? SORTED_CUTS.filter(cut => normalize(cut).includes(normalize(search)))
    : SORTED_CUTS;

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

      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          type="text"
          className="form-control"
          style={{ paddingLeft: '2.25rem' }}
          placeholder="Buscar corte..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ minHeight: '1.25rem', textAlign: 'center' }}>
        {justAdded && (
          <span style={{ color: 'var(--success-color)', fontSize: '0.875rem', fontWeight: 600 }}>
            + 1 caja de {justAdded}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visibleCuts.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Ningún corte coincide con "{search}".</p>
        )}
        {visibleCuts.map(cut => {
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

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.25rem' }}>
        Los datos quedan guardados solo en este navegador — exportá a Excel seguido para no perderlos.
      </p>

      {addingCut && (
        <div className="modal-overlay" onClick={closeWeightPrompt}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{addingCut}</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                confirmAdd();
              }}
            >
              <div className="form-group">
                <label htmlFor="manual-weight-input">Peso neto</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    ref={weightInputRef}
                    id="manual-weight-input"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    className="form-control"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    placeholder={weightUnit === 'kg' ? 'Ej: 25.5 o 25,5' : 'Ej: 450'}
                    style={{ flex: 1 }}
                  />
                  <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {(['kg', 'g'] as WeightUnit[]).map(unit => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setWeightUnit(unit)}
                        style={{
                          padding: '0 1rem',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          backgroundColor: weightUnit === unit ? 'var(--accent-color)' : 'rgba(0,0,0,0.2)',
                          color: 'white',
                        }}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
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
                        {box.manualCorrection && ' • (editado)'}
                      </div>
                    </div>
                    <div className="list-item-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem' }}
                        onClick={() => setEditingBox(box)}
                        title="Editar corte o peso"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem' }}
                        onClick={() => handleDelete(box.id)}
                        title="Eliminar esta caja"
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

      {editingBox && (
        <EditBoxModal
          box={editingBox}
          onClose={() => setEditingBox(null)}
          onSaved={() => {
            loadManualBoxes();
            onAdd();
          }}
        />
      )}
    </div>
  );
};
