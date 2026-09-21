import { useEffect, useRef, useState } from 'react';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { MEAT_CUTS } from '../data/meatCuts';

const SORTED_CUTS = [...MEAT_CUTS].sort((a, b) => a.localeCompare(b));

type WeightUnit = 'kg' | 'g';

interface EditBoxModalProps {
  box: ScannedBox;
  onClose: () => void;
  /** Se llama despues de guardar con exito, para que el padre recargue sus datos. */
  onSaved: () => void;
}

/**
 * Modal reutilizable para corregir el corte y/o el peso de una caja ya
 * cargada, sin importar si vino del escaner OCR o de la carga manual. Se
 * usa desde "Cajas" (BoxList) y desde el panel "Ultimas 10" de la carga
 * manual (ManualEntry), para no duplicar este formulario en dos lugares.
 */
export const EditBoxModal: React.FC<EditBoxModalProps> = ({ box, onClose, onSaved }) => {
  const [cutName, setCutName] = useState(box.cutName);
  const [weightInput, setWeightInput] = useState(String(box.netWeight));
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const cutInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cutInputRef.current?.focus();
    cutInputRef.current?.select();
  }, []);

  const handleSave = async () => {
    if (!box.id) return;

    const trimmedCut = cutName.trim().toUpperCase();
    if (!trimmedCut) {
      alert('Elegí o escribí un corte.');
      return;
    }

    const rawValue = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(rawValue) || rawValue < 0) {
      alert('Ingresá un peso válido (ej: 25.5 o 25,5).');
      return;
    }
    const netWeight = weightUnit === 'g' ? rawValue / 1000 : rawValue;

    await db.boxes.update(box.id, {
      cutName: trimmedCut,
      netWeight,
      manualCorrection: true,
    });
    onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Editar caja</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="form-group">
            <label htmlFor="edit-cut-input">Corte</label>
            <input
              ref={cutInputRef}
              id="edit-cut-input"
              type="text"
              list="edit-cuts-datalist"
              className="form-control"
              value={cutName}
              onChange={e => setCutName(e.target.value)}
            />
            {/* datalist = autocompletado nativo del catalogo, pero sigue
                aceptando texto libre por si la caja tenia un corte que el
                OCR leyo distinto de los 22 oficiales. */}
            <datalist id="edit-cuts-datalist">
              {SORTED_CUTS.map(cut => (
                <option key={cut} value={cut} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label htmlFor="edit-weight-input">Peso neto</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="edit-weight-input"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                className="form-control"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
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
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
