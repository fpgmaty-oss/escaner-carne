import { useState } from 'react';
import { Scanner } from './components/Scanner';
import { BoxList } from './components/BoxList';
import { Summary } from './components/Summary';
import { exportService } from './services/exportService';
import { Camera, List, BarChart3, Download } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'list' | 'summary'>('scanner');
  
  // A simple state to force re-renders on child components when a scan happens
  const [scanKey, setScanKey] = useState(0);

  const handleScanSuccess = () => {
    setScanKey(prev => prev + 1);
  };

  const handleExport = async () => {
    try {
      await exportService.exportToExcel();
      alert('Excel exportado correctamente');
    } catch (e) {
      console.error(e);
      alert('Error al exportar a Excel');
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>ESCÁNER DE CARNE</h1>
      </header>

      <main className="main-content">
        {activeTab === 'scanner' && <Scanner onScanSuccess={handleScanSuccess} />}
        {activeTab === 'list' && <BoxList key={`list-${scanKey}`} />}
        {activeTab === 'summary' && <Summary key={`summary-${scanKey}`} />}
      </main>

      <div className="nav-tabs">
        <button 
          className={`nav-tab ${activeTab === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('scanner')}
        >
          <Camera size={20} style={{ margin: '0 auto', marginBottom: '0.25rem' }} />
          <div>Escáner</div>
        </button>
        <button 
          className={`nav-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          <List size={20} style={{ margin: '0 auto', marginBottom: '0.25rem' }} />
          <div>Cajas</div>
        </button>
        <button 
          className={`nav-tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          <BarChart3 size={20} style={{ margin: '0 auto', marginBottom: '0.25rem' }} />
          <div>Resumen</div>
        </button>
        <button 
          className="nav-tab"
          onClick={handleExport}
        >
          <Download size={20} style={{ margin: '0 auto', marginBottom: '0.25rem', color: 'var(--success-color)' }} />
          <div style={{ color: 'var(--success-color)' }}>Exportar</div>
        </button>
      </div>
    </div>
  );
}

export default App;
