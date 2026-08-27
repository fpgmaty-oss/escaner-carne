import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Camera, Zap, Flashlight, FlashlightOff, Upload } from 'lucide-react';
import { PSM } from 'tesseract.js';
import { ocrService } from '../services/ocrService';
import { parserService } from '../services/parserService';
import type { ParseResult } from '../services/parserService';
import { duplicateService } from '../services/duplicateService';
import { db } from '../services/db';
import type { ScannedBox } from '../services/db';
import { computeCropRect } from '../services/imageUtils';
import { MultiBoxReview } from './MultiBoxReview';
import type { MultiBoxCandidate } from './MultiBoxReview';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Foto con varias cajas: cuando la deteccion por bloques encuentra 2+
  // cajas en una sola imagen, se llena esta lista y se muestra el modal
  // de revision multiple en vez del modal de una sola caja.
  const [multiBoxCandidates, setMultiBoxCandidates] = useState<MultiBoxCandidate[] | null>(null);

  // Start camera once on mount. Al mismo tiempo (sin esperarlo) arrancamos
  // la inicializacion del worker de OCR: descargar/compilar el modelo de
  // Tesseract tarda unos segundos, asi que si lo hacemos recien al
  // presionar CAPTURAR el usuario nota esa demora en el primer escaneo.
  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // ya esta prendida, no duplicar
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
        setStatusMsg(' Error: No se pudo acceder a la cámara');
      }
  }, []);

  // Apaga la camara en vivo por completo (libera el hardware). Se usa
  // antes de abrir el selector de foto/camara nativa del celular: en la
  // mayoria de los celulares SOLO UNA app/pestaña puede usar la camara a
  // la vez, asi que si dejamos nuestro stream de video corriendo, la
  // camara nativa que abre el input de archivo puede chocar con el
  // nuestro y comportarse raro (ej. solo prender el flash y no dejar
  // sacar la foto). Por eso hay que soltarla antes de subir una foto.
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, []);

  useEffect(() => {
    ocrService.init();
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  // Red de seguridad para volver a prender la camara despues de que el
  // usuario use el selector de foto/camara nativa (ya sea que elija una
  // foto o cancele): escuchamos cuando la pagina vuelve a estar visible
  // o la ventana recupera el foco, y si la camara quedo apagada, la
  // reiniciamos solos sin que el usuario tenga que hacer nada.
  useEffect(() => {
    const maybeResumeCamera = () => {
      if (!streamRef.current) startCamera();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') maybeResumeCamera();
    };
    window.addEventListener('focus', maybeResumeCamera);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', maybeResumeCamera);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startCamera]);

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

  // Analiza una foto elegida/tomada por el usuario (input file) en vez del
  // stream de la cámara en vivo. No tenemos el marco guía acá, así que no
  // podemos recortar la zona de la etiqueta: le pasamos la imagen completa
  // a Tesseract con PSM.AUTO para que primero detecte dónde está el texto.
  const processImageFile = useCallback(async (file: File) => {
    if (!canvasRef.current || isProcessing) return;

    setIsProcessing(true);
    setStatusMsg(ocrService.isReady() ? 'Analizando foto...' : 'Preparando lector (primera vez)...');

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('No se pudo leer la imagen'));
        image.src = objectUrl;
      });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        context.filter = 'grayscale(1) contrast(1.3)';
        context.drawImage(img, 0, 0);

        // Pedimos los bloques de texto detectados por separado: si el
        // analizador de layout de Tesseract encuentra 2 o mas regiones
        // de texto bien separadas (foto con varias etiquetas juntas),
        // tratamos cada una como una caja independiente. Si solo hay una
        // region (o el analisis no separo nada), seguimos el flujo
        // normal de una sola caja con el texto completo.
        const { text, blockTexts } = await ocrService.recognizeWithBlocks(canvas, PSM.AUTO);
        const cleaned = text.replace(/\s+/g, ' ').trim();
        setDebugText(cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned);

        const perBlockResults = blockTexts.length > 1
          ? blockTexts
              .map(blockText => parserService.parseText(blockText))
              .filter(result => result.confidence !== 'none')
          : [];

        if (perBlockResults.length >= 2) {
          setMultiBoxCandidates(
            perBlockResults.map((result, idx) => ({
              id: `${Date.now()}-${idx}`,
              cut: result.cutCandidate || '',
              weight: result.weightCandidate !== null ? result.weightCandidate.toString() : '',
              suggestions: result.cutSuggestions
            }))
          );
          setStatusMsg(`Se detectaron ${perBlockResults.length} cajas en la foto. Revisalas abajo.`);
        } else {
          processOcrText(text);
        }
      }
    } catch (e) {
      console.error('Error procesando la foto subida', e);
      setStatusMsg(' No se pudo analizar la foto. Probá con otra.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsProcessing(false);
      startCamera(); // la habiamos apagado antes de abrir el selector
    }
  }, [isProcessing, startCamera]);

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      processImageFile(file);
    } else {
      // El usuario cancelo el selector de foto/camara sin elegir nada:
      // volvemos a prender la camara en vivo de una, sin esperar el
      // evento de focus/visibilitychange.
      startCamera();
    }
  };

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

  const saveBoxToDb = async (
    cut: string,
    weight: number,
    status: ScannedBox['status'],
    isManualCorrection: boolean
  ) => {
    await db.boxes.add({
      cutName: cut.toUpperCase(),
      netWeight: weight,
      timestamp: Date.now(),
      manualCorrection: isManualCorrection,
      status
    });
  };

  const registerBox = async (cut: string, weight: number, isManualCorrection: boolean) => {
    try {
      await saveBoxToDb(cut, weight, isDuplicateWarning ? 'duplicate' : 'valid', isManualCorrection);
      
      // Feedback
      if (navigator.vibrate) navigator.vibrate(200);
      
      duplicateService.blockTemporarily();
      onScanSuccess();
      
      // Resume
      closeValidation();
      setStatusMsg(' ¡Caja registrada! Apunte a la siguiente.');
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
    setStatusMsg(' Apunte a la etiqueta y presione CAPTURAR');
  };

  // Registra todas las cajas confirmadas en el modal de revision multiple
  // (foto con varias etiquetas), respetando el mismo chequeo de
  // duplicados que usa el flujo de una sola caja.
  const handleMultiBoxConfirm = async (boxes: { cut: string; weight: number }[]) => {
    try {
      for (const box of boxes) {
        const isDup = await duplicateService.isPossibleDuplicate(box.cut, box.weight);
        await saveBoxToDb(box.cut, box.weight, isDup ? 'duplicate' : 'valid', false);
      }
      duplicateService.blockTemporarily();
      onScanSuccess();
      setMultiBoxCandidates(null);
      setDebugText('');
      setStatusMsg(`Se registraron ${boxes.length} cajas de la foto. Apunte a la siguiente.`);
    } catch (e) {
      console.error('Error saving multi-box scan:', e);
      alert('Error al guardar una o mas cajas');
    }
  };

  const handleMultiBoxCancel = () => {
    setMultiBoxCandidates(null);
    setDebugText('');
    setStatusMsg(' Apunte a la etiqueta y presione CAPTURAR');
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

      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        capture='environment'
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />

      {/* Capture buttons */}
      {!showValidation && !multiBoxCandidates && isScanning && (
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

      {!showValidation && !multiBoxCandidates && (
        <div style={{ padding: '0 0.75rem 0.75rem' }}>
          <button
            className='btn btn-secondary'
            onClick={() => { stopCamera(); fileInputRef.current?.click(); }}
            disabled={isProcessing}
            style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}
            title='Analizar una foto de la etiqueta en vez de la camara en vivo'
          >
            <Upload size={18} />
            {isProcessing ? 'Analizando...' : 'SUBIR FOTO'}
          </button>
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
              {validationData?.cutSuggestions && validationData.cutSuggestions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {validationData.cutSuggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setEditCut(suggestion)}
                      style={{
                        padding: '0.35rem 0.7rem',
                        borderRadius: 'var(--radius-full)',
                        border: editCut === suggestion ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.15)',
                        backgroundColor: editCut === suggestion ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                        color: 'var(--text-primary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
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

      {multiBoxCandidates && (
        <MultiBoxReview
          candidates={multiBoxCandidates}
          onConfirm={handleMultiBoxConfirm}
          onCancel={handleMultiBoxCancel}
        />
      )}
    </div>
  );
};
