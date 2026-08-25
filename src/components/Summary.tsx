import React, { useEffect, useState } from 'react';
import { db } from '../services/db';

interface SummaryData {
  cut: string;
  count: number;
  totalWeight: number;
}

export const Summary: React.FC = () => {
  const [summary, setSummary] = useState<SummaryData[]>([]);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [totalWeight, setTotalWeight] = useState(0);

  useEffect(() => {
    const loadSummary = async () => {
      const boxes = await db.boxes.toArray();
      
      const summaryMap = new Map<string, SummaryData>();
      let tBoxes = 0;
      let tWeight = 0;

      boxes.forEach(box => {
        tBoxes++;
        tWeight += box.netWeight;

        const current = summaryMap.get(box.cutName) || { cut: box.cutName, count: 0, totalWeight: 0 };
        summaryMap.set(box.cutName, {
          cut: box.cutName,
          count: current.count + 1,
          totalWeight: current.totalWeight + box.netWeight
        });
      });

      // Sort alphabetically
      const sortedSummary = Array.from(summaryMap.values()).sort((a, b) => a.cut.localeCompare(b.cut));
      
      setSummary(sortedSummary);
      setTotalBoxes(tBoxes);
      setTotalWeight(tWeight);
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
