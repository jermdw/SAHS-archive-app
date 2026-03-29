import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw } from 'lucide-react';

interface QRScannerProps {
    onScan: (data: string) => void;
    onClose?: () => void;
    active?: boolean;
}

export function QRScanner({ onScan, onClose, active = true }: QRScannerProps) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const hasScannedRef = useRef<boolean>(false);
    const activeTracksRef = useRef<MediaStreamTrack[]>([]);

    // Completely forces the hardware camera light to go off by stopping tracks we intercepted
    const forceKillVideoTracks = () => {
        activeTracksRef.current.forEach(track => {
            try { track.stop(); } catch (e) { /* ignore */ }
        });
        activeTracksRef.current = [];
        
        // Failsafe for the DOM element if attached
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
            if (video.srcObject) {
                const stream = video.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
        });
    };

    useEffect(() => {
        if (!active) return;
        hasScannedRef.current = false;

        // Intercept WebRTC track requests so we can guarantee their destruction later
        const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
        if (navigator.mediaDevices && originalGetUserMedia) {
            navigator.mediaDevices.getUserMedia = async (constraints) => {
                const stream = await originalGetUserMedia(constraints);
                stream.getTracks().forEach(t => activeTracksRef.current.push(t));
                return stream;
            };
        }

        // Initialize scanner
        // We request high resolution (1080p) so tiny QR codes occupy enough pixels to be parsed.
        const scanner = new Html5QrcodeScanner(
            "qr-reader",
            { 
                fps: 15, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                },
                videoConstraints: { 
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            },
            /* verbose= */ false
        );

        scanner.render(
            (decodedText) => {
                if (!hasScannedRef.current) {
                    hasScannedRef.current = true;
                    // Properly shut down the scanner before notifying parent
                    // This ensures the DOM node exists so html5-qrcode can stop the video stream correctly
                    if (scannerRef.current) {
                        scannerRef.current.clear()
                            .catch(console.error)
                            .finally(() => {
                                forceKillVideoTracks();
                                onScan(decodedText);
                            });
                    } else {
                        forceKillVideoTracks();
                        onScan(decodedText);
                    }
                }
            },
            () => {
                // Ignore frequent scan errors (usually just "no QR code detected in frame")
            }
        );

        scannerRef.current = scanner;

        return () => {
            // Restore getUserMedia
            if (navigator.mediaDevices && originalGetUserMedia) {
                navigator.mediaDevices.getUserMedia = originalGetUserMedia;
            }

            if (scannerRef.current && !hasScannedRef.current) {
                // Failsafe for normal unmounts
                scannerRef.current.clear().catch(console.error).finally(() => {
                    forceKillVideoTracks();
                });
            } else {
                forceKillVideoTracks();
            }
        };
    }, [active, onScan]);

    if (!active) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-tan-light/50 flex items-center justify-between bg-cream/30">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-tan/10 flex items-center justify-center text-tan">
                            <Camera size={18} />
                        </div>
                        <h2 className="font-serif font-bold text-charcoal">Scan Tracking Code</h2>
                    </div>
                    {onClose && (
                        <button 
                            onClick={() => {
                                if (!hasScannedRef.current) {
                                    hasScannedRef.current = true;
                                    if (scannerRef.current) {
                                        scannerRef.current.clear()
                                            .catch(console.error)
                                            .finally(() => {
                                                forceKillVideoTracks();
                                                onClose();
                                            });
                                    } else {
                                        forceKillVideoTracks();
                                        onClose();
                                    }
                                }
                            }}
                            className="p-2 hover:bg-black/5 rounded-full transition-colors text-charcoal/60"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    <div id="qr-reader" className="overflow-hidden rounded-2xl border-4 border-tan-light/20 bg-black">
                        {/* html5-qrcode injects here */}
                    </div>
                    
                    <div className="mt-6 flex flex-col items-center text-center">
                        <p className="text-sm text-charcoal/70 max-w-xs">
                            Point your camera at a SAHS artifact or location QR code.
                        </p>
                        
                        <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-tan/60 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-tan"></div>
                            Scanner Active
                        </div>
                    </div>
                </div>
            </div>
            
            <button 
                onClick={() => window.location.reload()} 
                className="mt-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium"
            >
                <RefreshCw size={16} /> Reset Camera
            </button>
        </div>
    );
}
