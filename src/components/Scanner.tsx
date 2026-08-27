import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Camera, Zap, Flashlight, FlashlightOff } from 'lucide-react';
import { ocrService } from '../services/ocrService';
import { parserService } from '../services/parserService';
import type { ParseResult } from '../services/parserService';
import { duplicateService } from '../services/duplicateService';
import { db } from '../services/db';
import { computeCropRect } from '../services/imageUtils';

// Constraint no estandarizada todavía en los tipos de TS, pero soportada
// por Chrome/Android para prender el flash de la cámara trasera.
interface TorchConstraint {
  advanced: [{ torch: boolean }];
}

interface ScannerProps {
  onScanSuccess: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScanSuccess }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Inicializando cámara...');
  const [debugText, setDebugText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  
  // Validation Modal State
  const [showValidation, setShowValidation] = useState(false);
  const [validationData, setValidationData] = useState<ParseResult | null>(null);
  const [validationMsg, setValidationMsg] = useState('');
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
  
  // Manual edit states inside validation modal
  const [editCut, setEditCut] = useState('');
  const [editWeight, setEditWeight] = useState('');

  // Start camera once on mount. Al mismo tiempo (sin esperarlo) arrancamos
  // la inicializacion del worker de OCR: descargar/compilar el modelo de
  // Tesseract tarda unos segundos, asi que si lo hacemos recien al
  // presionar CAPTURAR el usuario nota esa demora en el primer escaneo.
  useEffect(() => {
    ocrService.init();

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : undefined;
        setTorchSupported(!!(capabilities && (capabilities as MediaTrackCapabilities & { torch?: boolean }).torch));

        setStatusMsg(' Apunte a la etiqueta y presione CAPTURAR');
        setIsScanning(true);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setStatusMsg('❌ Error: No se pudo acceder a la cámara');
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nextState = !torchOn;
    try {
      const constraint: TorchConstraint = { advanced: [{ torch: nextState }] };
      await track.applyConstraints(constraint as unknown as MediaTrackConstraints);
      setTorchOn(nextState);
    } catch (e) {
      console.error('No se pudo alternar la linterna', e);
    }
  }, [torchOn]);

  // Auto scanning loop
  useEffect(() => {
    if (!isAutoMode || !isScanning) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const autoScan = async () => {
      if (cancelled || showValidation || !isAutoMode) return;
      
      if (duplicateService.isTemporarilyBlocked()) {
        setStatusMsg('⏳ Bloqueo temporal...');
        timeoutId = setTimeout(autoScan, 1000);
        return;
      }
      
      await captureAndProcess();
      if (!cancelled && isAutoMode) {
        timeoutId = setTimeout(autoScan, 2000);
      }
    };

    timeoutId = setTimeout(autoScan, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isAutoMode, isScanning, showValidation]);

  const captureAndProcess = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    
    setIsProcessing(true);
    setStatusMsg(ocrService.isReady() ? 'Procesando...' : 'Preparando lector (primera vez)...');
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (context && video.videoWidth > 0) {
      const crop = computeCropRect(video.videoWidth, video.videoHeight);
      canvas.width = crop.width;
      canvas.height = crop.height;

      context.filter = 'grayscale(1) contrast(1.3)';
      context.drawImage(
        video,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, crop.width, crop.height
      );
      
      try {
        const text = await ocrService.recognize(canvas);
        
        // Show debug text (trimmed)
        const cleaned = text.replace(/\s+/g, ' ').trim();
        setDebugText(cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned);
        
        processOcrText(text);
      } catch (e) {
        console.error("OCR process error", e);
        setStatusMsg('❌ Error de OCR');
      }
    }
    
    setIsProcessing(false);
  }, [isProcessing]);

  const processOcrText = async (text: string) => {
    if (!text || text.trim().length < 5) {
      setStatusMsg('📷 No se detectó texto. Acerque más la cámara.');
      return;
    }

    const result = parserService.parseText(text);
    
    if (result.confidence === 'none') {
      setStatusMsg('🔍 Buscando peso neto... Acerque la cámara.');
      return;
    }

    // Pause auto scanning
    setIsAutoMode(false);
    
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
      if (result.weightCandidate && !result.cutCandidate) {
        setValidationMsg('⚠️ Peso detectado. Ingrese el corte manualmente.');
      } else if (result.cutCandidate && !result.weightCandidate) {
        setValidationMsg('⚠️ Corte detectado. Ingrese el peso manualmente.');
      } else {
        setValidationMsg('⚠️ No se pudo determinar con seguridad');
      }
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
      setStatusMsg('✅ ¡Caja registrada! Apunte a la siguiente.');
    } catch (e) {
      console.error("Error saving box:", e);
      alert("Error al guardar");
    }
  };

  const closeValidation = () => {
    setShowValidation(false);
    setValidationData(null);
    setIsDuplicateWarning(false);
    setDebugText('');
    setStatusMsg('📷 Apunte a la etiqueta y presione CAPTURAR');
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

      {/* Debug OCR text */}
      {debugText && (
        <div style={{
          padding: '0.5rem 0.75rem',
          backgroundColor: 'rgba(0,0,0,0.8)',
          fontSize: '0.7rem',
          color: '#94a3b8',
          maxHeight: '3.5rem',
          overflowY: 'auto',
          fontFamily: 'monospace',
          lineHeight: 1.3
        }}>
          <strong style={{ color: '#60a5fa' }}>OCR:</strong> {debugText}
        </div>
      )}

      {/* Capture buttons */}
      {!showValidation && isScanning && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={captureAndProcess}
            disabled={isProcessing}
            style={{ flex: 2, fontSize: '1rem', padding: '1rem' }}
          >
            <Camera size={20} />
            {isProcessing ? 'Procesando...' : 'CAPTURAR'}
          </button>
          <button
            className={`btn ${isAutoMode ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => setIsAutoMode(!isAutoMode)}
            style={{ flex: 1 }}
            title="Escaneo automático continuo"
          >
            <Zap size={18} />
            {isAutoMode ? 'AUTO ' : 'AUTO'}
          </button>
          {torchSupported && (
            <button
              className={`btn ${torchOn ? 'btn-success' : 'btn-secondary'}`}
              onClick={toggleTorch}
              style={{ flex: '0 0 auto', minWidth: '3rem' }}
              title="Linterna"
            >
              {torchOn ? <Flashlight size={18} /> : <FlashlightOff size={18} />}
            </button>
          )}
        </div>
      )}

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
                placeholder="Ej: ASADO DEL CARNICERO"
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
                placeholder="Ej: 16.65"
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
