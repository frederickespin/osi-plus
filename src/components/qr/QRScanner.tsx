import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, X, Keyboard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QR Code Types supported by the system
 */
export type QRCodeType = 
  | 'OSI'       // OSI-2024-001 format
  | 'LOCATION'  // LOC|WAREHOUSE-ZONE-AISLE-RACK
  | 'ASSET'     // ASSET|Equipment-ID
  | 'USER'      // USR|User-Code
  | 'BOX'       // BOX|Box-Code
  | 'VEHICLE'   // VH-001 format
  | 'HANDSHAKE' // HS|TYPE|OSI|DATE
  | 'UNKNOWN';

/**
 * Parsed QR Code result
 */
export interface ParsedQRCode {
  type: QRCodeType;
  rawValue: string;
  payload: string;
  isValid: boolean;
  metadata?: Record<string, string>;
}

/**
 * QR Code format patterns
 */
const QR_PATTERNS: Array<{ type: QRCodeType; regex: RegExp; parseMetadata?: (match: RegExpMatchArray) => Record<string, string> }> = [
  { 
    type: 'OSI', 
    regex: /^OSI-(\d{4})-(\d{3,})$/,
    parseMetadata: (match) => ({ year: match[1], number: match[2] })
  },
  { 
    type: 'LOCATION', 
    regex: /^LOC\|(.+)$/,
    parseMetadata: (match) => {
      const parts = match[1].split('-');
      return { 
        warehouse: parts[0] || '', 
        zone: parts[1] || '', 
        location: match[1] 
      };
    }
  },
  { 
    type: 'ASSET', 
    regex: /^ASSET\|(.+)$/,
    parseMetadata: (match) => ({ assetId: match[1] })
  },
  { 
    type: 'USER', 
    regex: /^USR\|(.+)$/,
    parseMetadata: (match) => ({ userCode: match[1] })
  },
  { 
    type: 'BOX', 
    regex: /^BOX\|(.+)$/,
    parseMetadata: (match) => ({ boxCode: match[1] })
  },
  { 
    type: 'VEHICLE', 
    regex: /^VH-(\d{3})$/,
    parseMetadata: (match) => ({ vehicleNumber: match[1] })
  },
  { 
    type: 'HANDSHAKE', 
    regex: /^HS\|(\w+)\|(.+)\|(\d{8})$/,
    parseMetadata: (match) => ({ 
      handshakeType: match[1], 
      reference: match[2], 
      date: match[3] 
    })
  },
];

/**
 * Parse a QR code value and determine its type
 */
export function parseQRCode(value: string): ParsedQRCode {
  const trimmed = value.trim();
  
  for (const pattern of QR_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type,
        rawValue: trimmed,
        payload: match[1] || trimmed,
        isValid: true,
        metadata: pattern.parseMetadata?.(match),
      };
    }
  }
  
  return {
    type: 'UNKNOWN',
    rawValue: trimmed,
    payload: trimmed,
    isValid: false,
  };
}

/**
 * Get human-readable label for QR type
 */
export function getQRTypeLabel(type: QRCodeType): string {
  const labels: Record<QRCodeType, string> = {
    OSI: 'Orden de Servicio',
    LOCATION: 'Ubicación',
    ASSET: 'Activo/Equipo',
    USER: 'Usuario',
    BOX: 'Caja',
    VEHICLE: 'Vehículo',
    HANDSHAKE: 'Handshake',
    UNKNOWN: 'Desconocido',
  };
  return labels[type];
}

interface QRScannerProps {
  /** Callback when a QR code is scanned */
  onScan: (result: ParsedQRCode) => void;
  /** Callback to close the scanner */
  onClose?: () => void;
  /** Accepted QR code types (empty = accept all) */
  acceptedTypes?: QRCodeType[];
  /** Title for the scanner dialog */
  title?: string;
  /** Whether to auto-close after successful scan */
  autoClose?: boolean;
}

export function QRScanner({ 
  onScan, 
  onClose, 
  acceptedTypes = [],
  title = 'Escanear Código QR',
  autoClose = true,
}: QRScannerProps) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<ParsedQRCode | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        // Ignore stop errors
        console.warn('Error stopping scanner:', e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const isAcceptedType = useCallback((type: QRCodeType): boolean => {
    if (acceptedTypes.length === 0) return true;
    return acceptedTypes.includes(type) || type === 'UNKNOWN';
  }, [acceptedTypes]);

  const handleScanResult = useCallback((result: ParsedQRCode) => {
    setLastScanned(result);
    
    if (!isAcceptedType(result.type) && result.type !== 'UNKNOWN') {
      toast.error(`Tipo de código no aceptado: ${getQRTypeLabel(result.type)}`);
      return;
    }
    
    if (result.isValid) {
      toast.success(`Código escaneado: ${getQRTypeLabel(result.type)}`);
    } else {
      toast.warning('Código no reconocido');
    }
    
    onScan(result);
    
    if (autoClose) {
      stopScanner();
    }
  }, [acceptedTypes, autoClose, isAcceptedType, onScan, stopScanner]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current) return;

    try {
      setCameraError(null);
      
      const scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          const parsed = parseQRCode(decodedText);
          handleScanResult(parsed);
        },
        () => {} // Ignore scan failures (continuous scanning)
      );
      
      setIsScanning(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'No se pudo acceder a la cámara';
      setCameraError(message);
      setMode('manual');
      console.error('Camera error:', error);
    }
  }, [handleScanResult]);

  useEffect(() => {
    if (mode === 'camera') {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => clearTimeout(timer);
    }
    return () => {
      stopScanner();
    };
  }, [mode, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      toast.error('Ingresa un código');
      return;
    }
    
    const parsed = parseQRCode(manualCode);
    handleScanResult(parsed);
    setManualCode('');
  };

  const handleClose = () => {
    stopScanner();
    onClose?.();
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'camera' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('camera')}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Cámara
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { stopScanner(); setMode('manual'); }}
            className="flex-1"
          >
            <Keyboard className="h-4 w-4 mr-2" />
            Manual
          </Button>
        </div>

        {/* Camera Mode */}
        {mode === 'camera' && (
          <div className="space-y-4">
            {cameraError ? (
              <div className="text-center p-6 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
                <p className="text-red-600 text-sm font-medium mb-2">Error de cámara</p>
                <p className="text-red-500 text-xs mb-4">{cameraError}</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setMode('manual')}
                >
                  Ingresar código manualmente
                </Button>
              </div>
            ) : (
              <>
                <div 
                  id="qr-reader" 
                  ref={containerRef}
                  className="w-full aspect-square bg-slate-900 rounded-lg overflow-hidden"
                />
                <p className="text-center text-sm text-slate-500">
                  {isScanning ? 'Apunta la cámara al código QR' : 'Iniciando cámara...'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Manual Mode */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ingresa el código (ej: OSI-2024-001)"
                autoFocus
                className="text-center font-mono"
              />
              <p className="text-xs text-slate-400 text-center">
                Formatos: OSI-YYYY-NNN, LOC|..., ASSET|..., USR|..., VH-NNN
              </p>
            </div>
            <Button type="submit" className="w-full">
              Verificar Código
            </Button>
          </form>
        )}

        {/* Last Scanned Result */}
        {lastScanned && (
          <div className={`mt-4 p-3 rounded-lg border ${lastScanned.isValid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2">
              {lastScanned.isValid ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${lastScanned.isValid ? 'text-green-700' : 'text-amber-700'}`}>
                  {getQRTypeLabel(lastScanned.type)}
                </p>
                <p className="text-xs text-slate-500 font-mono truncate">
                  {lastScanned.rawValue}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Accepted Types Info */}
        {acceptedTypes.length > 0 && (
          <div className="mt-4 text-xs text-slate-400 text-center">
            Tipos aceptados: {acceptedTypes.map(t => getQRTypeLabel(t)).join(', ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default QRScanner;
