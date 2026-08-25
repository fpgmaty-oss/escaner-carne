import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { Trash2 } from 'lucide-react';

export const BoxList: React.FC = () => {
  const [boxes, setBoxes] = useState<ScannedBox[]>([]);

  const loadBoxes = async () => {
    const data = await db.boxes.orderBy('timestamp').reverse().toArray();
    setBoxes(data);
  };

  useEffect(() => {
    loadBoxes();
  }, []);

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (window.confirm('¿Eliminar este registro?')) {
      await db.boxes.delete(id);
      loadBoxes();
    }
  };

  return (
    <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
      <h2 className="card-title">Cajas Registradas ({boxes.length})</h2>
      
      {boxes.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
          No hay cajas registradas aún.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {boxes.map((box, index) => (
            <div key={box.id} className="list-item">
              <div className="list-item-content">
                <div className="list-item-title">
                  {boxes.length - index}. {box.cutName}
                </div>
                <div className="list-item-subtitle">
                  {box.netWeight.toFixed(3)} kg • {new Date(box.timestamp).toLocaleTimeString()}
                  {box.manualCorrection && ' • (Editado)'}
                </div>
              </div>
              <div className="list-item-actions">
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem' }}
                  onClick={() => handleDelete(box.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
