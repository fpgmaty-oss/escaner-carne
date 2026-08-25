import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ocrService } from '../services/ocrService';
import { parserService } from '../services/parserService';
import type { ParseResult } from '../services/parserService';
import { duplicateService } from '../services/duplicateService';
import { db } from '../services/db';

interface ScannerProps {
  onScanSuccess: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScanSuccess }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Inicializando cámara...');
  
  // Validation Modal State
  const [showValidation, setShowValidation] = useState(false);
  const [validationData, setValidationData] = useState<ParseResult | null>(null);
  const [validationMsg, setValidationMsg] = useState('');
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
  
  // Manual edit states inside validation modal
  const [editCut, setEditCut] = useState('');
  const [editWeight, setEditWeight] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let lastScanTime = 0;
    const SCAN_INTERVAL = 1500; // Scan every 1.5 seconds

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setStatusMsg('Apunte hacia la etiqueta');
        setIsScanning(true);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setStatusMsg('Error: No se pudo acceder a la cámara');
      }
    };

    const scanFrame = async (timestamp: number) => {
      if (!isScanning) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
      }

      if (timestamp - lastScanTime > SCAN_INTERVAL && videoRef.current && canvasRef.current) {
        lastScanTime = timestamp;
        
        if (duplicateService.isTemporarilyBlocked()) {
          setStatusMsg('Bloqueo temporal (evitando duplicados)...');
          animationFrameId = requestAnimationFrame(scanFrame);
          return;
        }

        if (showValidation) {
          animationFrameId = requestAnimationFrame(scanFrame);
          return;
        }

        setStatusMsg('Escaneando...');
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        if (context && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          try {
            const text = await ocrService.recognize(canvas);
            processOcrText(text);
          } catch (e) {
            console.error("OCR process error", e);
          }
        }
      }
      
      animationFrameId = requestAnimationFrame(scanFrame);
    };

    startCamera().then(() => {
      animationFrameId = requestAnimationFrame(scanFrame);
    });

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, showValidation]); // Dependencies that might affect the loop

  const processOcrText = async (text: string) => {
    if (!text || text.trim().length === 0) {
      setStatusMsg('Apunte hacia la etiqueta');
      return;
    }

    const result = parserService.parseText(text);
    
    if (result.confidence === 'none') {
      setStatusMsg('Buscando peso neto...');
      return;
    }

    setIsScanning(false); // Pause scanning
    
    // Check duplicates if we have data
    if (result.cutCandidate && result.weightCandidate) {
      const isDup = await duplicateService.isPossibleDuplicate(result.cutCandidate, result.weightCandidate);
      if (isDup) {
        setIsDuplicateWarning(true);
        setValidationMsg('⚠️ Posible caja duplicada');
      } else if (result.needsReview) {
        setIsDuplicateWarning(false);
        setValidationMsg('⚠️ Revisar etiqueta (Confianza baja)');
      } else {
        // High confidence, no duplicate -> Auto register
        await registerBox(result.cutCandidate, result.weightCandidate, false);
        return;
      }
    } else {
      setIsDuplicateWarning(false);
      setValidationMsg('⚠️ No se pudo determinar con seguridad');
    }

    // Show modal
    setValidationData(result);
    setEditCut(result.cutCandidate || '');
    setEditWeight(result.weightCandidate ? result.weightCandidate.toString() : '');
    setShowValidation(true);
  };

  const registerBox = async (cut: string, weight: number, isManualCorrection: boolean) => {
    try {
      await db.boxes.add({
        cutName: cut.toUpperCase(),
        netWeight: weight,
        timestamp: Date.now(),
        manualCorrection: isManualCorrection,
        status: isDuplicateWarning ? 'duplicate' : 'valid'
      });
      
      // Feedback
      if (navigator.vibrate) navigator.vibrate(200);
      
      duplicateService.blockTemporarily();
      onScanSuccess();
      
      // Resume
      closeValidation();
    } catch (e) {
      console.error("Error saving box:", e);
      alert("Error al guardar");
    }
  };

  const closeValidation = () => {
    setShowValidation(false);
    setValidationData(null);
    setIsDuplicateWarning(false);
    setStatusMsg('Apunte hacia la etiqueta');
    // small delay before resuming scanning
    setTimeout(() => setIsScanning(true), 500);
  };

  const handleConfirm = () => {
    if (!editCut || !editWeight) {
      alert('Debe ingresar corte y peso');
      return;
    }
    const weightNum = parseFloat(editWeight.replace(',', '.'));
    if (isNaN(weightNum)) {
      alert('Peso inválido');
      return;
    }
    
    // If it was edited, it's a manual correction
    const isManual = validationData?.cutCandidate !== editCut || 
                     validationData?.weightCandidate?.toString() !== editWeight;
                     
    registerBox(editCut, weightNum, isManual || validationData?.needsReview || false);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="scanner-container">
        <video ref={videoRef} className="scanner-video" playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        <div className="scanner-overlay">
          <div className="scanner-frame"></div>
          <div className="scanner-status">
            {statusMsg}
          </div>
        </div>
      </div>

      {showValidation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className={`modal-title ${isDuplicateWarning || validationData?.needsReview ? 'warning' : ''}`}>
              {isDuplicateWarning ? <AlertTriangle /> : (validationData?.needsReview ? <AlertTriangle /> : <CheckCircle2 />)}
              {validationMsg}
            </h2>
            
            <div className="form-group">
              <label>Corte Detectado</label>
              <input 
                type="text" 
                className="form-control" 
                value={editCut} 
                onChange={e => setEditCut(e.target.value)}
                placeholder="Ej: SOBRECOSTILLA"
              />
            </div>
            
            <div className="form-group">
              <label>Peso Neto (kg)</label>
              <input 
                type="number" 
                step="0.001"
                className="form-control" 
                value={editWeight} 
                onChange={e => setEditWeight(e.target.value)}
                placeholder="Ej: 7.842"
              />
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeValidation}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirm}>
                {isDuplicateWarning ? 'Registrar Igualmente' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
