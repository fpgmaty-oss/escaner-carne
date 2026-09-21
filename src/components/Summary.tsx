import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { groupBoxesByCut } from '../services/summaryService';
import type { CutSummary } from '../services/summaryService';

export const Summary: React.FC = () => {
  const [summary, setSummary] = useState<CutSummary[]>([]);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [totalWeight, setTotalWeight] = useState(0);

  useEffect(() => {
    const loadSummary = async () => {
      const boxes = await db.boxes.toArray();
      const grouped = groupBoxesByCut(boxes);

      setSummary(grouped);
      setTotalBoxes(boxes.length);
      setTotalWeight(boxes.reduce((sum, b) => sum + b.netWeight, 0));
    };

    loadSummary();
  }, []);

  return (
    <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
      <h2 className="card-title">Resumen por Corte</h2>
      
      {summary.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
          Sin datos para resumir.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {summary.map(item => (
            <div key={item.cut} className="card" style={{ padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--accent-color)' }}>
                {item.cut}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span>{item.count} cajas</span>
                <span style={{ fontWeight: 700 }}>{item.totalWeight.toFixed(3)} kg</span>
              </div>
            </div>
          ))}
          
          <div className="card" style={{ padding: '1rem', backgroundColor: 'var(--accent-color)', color: 'white', marginTop: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>TOTAL GENERAL</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', fontWeight: 700 }}>
              <span>{totalBoxes} cajas</span>
              <span>{totalWeight.toFixed(3)} kg</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
