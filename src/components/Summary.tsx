import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { groupBoxesByCut, filterBoxesByRange, DATE_RANGE_LABELS } from '../services/summaryService';
import type { CutSummary, DateRangeOption } from '../services/summaryService';
import type { ScannedBox } from '../services/db';

const RANGE_OPTIONS: DateRangeOption[] = ['today', 'yesterday', 'week', 'all'];

export const Summary: React.FC = () => {
  const [allBoxes, setAllBoxes] = useState<ScannedBox[]>([]);
  const [range, setRange] = useState<DateRangeOption>('today');
  const [summary, setSummary] = useState<CutSummary[]>([]);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [totalWeight, setTotalWeight] = useState(0);

  useEffect(() => {
    const load = async () => {
      const boxes = await db.boxes.toArray();
      setAllBoxes(boxes);
    };
    load();
  }, []);

  useEffect(() => {
    const filtered = filterBoxesByRange(allBoxes, range);
    setSummary(groupBoxesByCut(filtered));
    setTotalBoxes(filtered.length);
    setTotalWeight(filtered.reduce((sum, b) => sum + b.netWeight, 0));
  }, [allBoxes, range]);

  return (
    <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
      <h2 className="card-title">Resumen por Corte</h2>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => setRange(opt)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius-full)',
              border: range === opt ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.15)',
              backgroundColor: range === opt ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {DATE_RANGE_LABELS[opt]}
          </button>
        ))}
      </div>

      {summary.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
          Sin datos para resumir en "{DATE_RANGE_LABELS[range]}".
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
              {item.manualCount > 0 && item.ocrCount > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {item.ocrCount} escaneadas · {item.manualCount} manuales
                </div>
              )}
            </div>
          ))}
          
          <div className="card" style={{ padding: '1rem', backgroundColor: 'var(--accent-color)', color: 'white', marginTop: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>TOTAL · {DATE_RANGE_LABELS[range].toUpperCase()}</div>
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
