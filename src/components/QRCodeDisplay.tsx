import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer } from 'lucide-react';
import { useRef } from 'react';

interface QRCodeDisplayProps {
    value: string;
    label: string;
    subLabel?: string;
    size?: number;
}

export function QRCodeDisplay({ value, label, subLabel, size = 200 }: QRCodeDisplayProps) {
    const canvasRef = useRef<HTMLDivElement>(null);

    const downloadQRCode = () => {
        const canvas = canvasRef.current?.querySelector('canvas');
        if (canvas) {
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `qrcode-${label.replace(/\s+/g, '-').toLowerCase()}.png`;
            link.href = url;
            link.click();
        }
    };

    const handlePrint = () => {
        const canvas = canvasRef.current?.querySelector('canvas');
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/png');
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Print QR Code - ${label}</title>
                    <style>
                        body { 
                            display: flex; 
                            flex-direction: column; 
                            align-items: center; 
                            justify-content: center; 
                            height: 100vh; 
                            margin: 0; 
                            font-family: serif;
                        }
                        .container {
                            border: 2px solid #000;
                            padding: 40px;
                            text-align: center;
                        }
                        h1 { margin-bottom: 5px; font-size: 24px; }
                        p { margin-top: 0; color: #666; font-size: 16px; }
                        img { width: 300px; height: 300px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>${label}</h1>
                        ${subLabel ? `<p>${subLabel}</p>` : ''}
                        <img src="${dataUrl}" />
                        <p style="margin-top: 20px; font-size: 12px; color: #999;">SAHS Archive Tracking System</p>
                    </div>
                    <script>
                        window.onload = () => {
                            window.print();
                            window.onafterprint = () => window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-2xl border border-tan-light/50 shadow-sm w-fit">
            <div ref={canvasRef} className="p-4 bg-white border-4 border-tan-light/20 rounded-xl">
                <QRCodeCanvas 
                    value={value} 
                    size={size}
                    level="H"
                    includeMargin={true}
                />
            </div>
            
            <div className="text-center">
                <h3 className="font-serif font-bold text-charcoal">{label}</h3>
                {subLabel && <p className="text-xs text-charcoal/60 mt-1">{subLabel}</p>}
            </div>

            <div className="flex gap-2 w-full mt-2">
                <button
                    onClick={downloadQRCode}
                    className="flex-1 flex items-center justify-center gap-2 bg-cream text-charcoal px-3 py-2 rounded-lg text-sm font-medium hover:bg-tan/10 transition-colors border border-tan-light/30"
                    title="Download PNG"
                >
                    <Download size={16} /> Save
                </button>
                <button
                    onClick={handlePrint}
                    className="flex-1 flex items-center justify-center gap-2 bg-charcoal text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-charcoal/90 transition-colors shadow-sm"
                    title="Print Label"
                >
                    <Printer size={16} /> Print
                </button>
            </div>
        </div>
    );
}
