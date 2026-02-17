import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface QRGeneratorProps {
  /** The value to encode in the QR code */
  value: string;
  /** Optional label to display below the QR code */
  label?: string;
  /** Size of the QR code in pixels */
  size?: number;
  /** Whether to show the download button */
  showDownload?: boolean;
  /** Whether to show the copy button */
  showCopy?: boolean;
  /** Background color */
  bgColor?: string;
  /** Foreground color */
  fgColor?: string;
  /** Error correction level */
  level?: 'L' | 'M' | 'Q' | 'H';
}

export function QRGenerator({ 
  value, 
  label, 
  size = 200,
  showDownload = true,
  showCopy = true,
  bgColor = '#FFFFFF',
  fgColor = '#000000',
  level = 'M',
}: QRGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) {
      toast.error('No se pudo generar la imagen');
      return;
    }

    // Clone SVG and set explicit dimensions
    const svgClone = svg.cloneNode(true) as SVGElement;
    svgClone.setAttribute('width', String(size));
    svgClone.setAttribute('height', String(size));
    
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      
      // Fill background
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
      }
      
      const pngUrl = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      const filename = `qr-${value.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 30)}.png`;
      link.download = filename;
      link.href = pngUrl;
      link.click();
      
      URL.revokeObjectURL(svgUrl);
      toast.success('QR descargado');
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      toast.error('Error al generar imagen');
    };
    
    img.src = svgUrl;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Código copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  if (!value) {
    return (
      <Card className="inline-block">
        <CardContent className="p-4 text-center">
          <div 
            className="bg-slate-100 rounded-lg flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <p className="text-slate-400 text-sm">Sin código</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="inline-block">
      <CardContent className="p-4 text-center">
        <div ref={qrRef} className="inline-block bg-white p-2 rounded-lg">
          <QRCodeSVG
            value={value}
            size={size}
            level={level}
            bgColor={bgColor}
            fgColor={fgColor}
            includeMargin={false}
          />
        </div>
        
        {label && (
          <p className="mt-3 text-sm font-medium text-slate-700">{label}</p>
        )}
        
        <p className="text-xs text-slate-400 mt-1 font-mono break-all max-w-[200px] mx-auto">
          {value}
        </p>
        
        {(showDownload || showCopy) && (
          <div className="flex gap-2 justify-center mt-3">
            {showCopy && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopy}
                className="gap-1"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            )}
            {showDownload && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDownload}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                PNG
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Generate QR code value for different entity types
 */
export const QRCodeGenerators = {
  /** Generate OSI QR code */
  osi: (year: number, number: number | string) => 
    `OSI-${year}-${String(number).padStart(3, '0')}`,
  
  /** Generate Location QR code */
  location: (warehouse: string, zone: string, aisle?: string, rack?: string, level?: string, bin?: string) => {
    const parts = [warehouse, zone, aisle, rack, level, bin].filter(Boolean);
    return `LOC|${parts.join('-')}`;
  },
  
  /** Generate Asset QR code */
  asset: (assetId: string) => `ASSET|${assetId}`,
  
  /** Generate User QR code */
  user: (userCode: string) => `USR|${userCode}`,
  
  /** Generate Box QR code */
  box: (boxCode: string) => `BOX|${boxCode}`,
  
  /** Generate Vehicle QR code */
  vehicle: (vehicleNumber: number | string) => 
    `VH-${String(vehicleNumber).padStart(3, '0')}`,
  
  /** Generate Handshake QR code */
  handshake: (type: 'PICKUP' | 'DELIVERY', reference: string, date?: Date) => {
    const dateStr = (date || new Date()).toISOString().slice(0, 10).replace(/-/g, '');
    return `HS|${type}|${reference}|${dateStr}`;
  },
};

export default QRGenerator;
