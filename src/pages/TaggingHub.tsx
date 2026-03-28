import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { Camera, MapPin, Box, CheckCircle2, AlertCircle, ArrowRight, History, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { ArchiveItem, MuseumLocation } from '../types/database';
import { QRScanner } from '../components/QRScanner';

export function TaggingHub() {
    const { user } = useAuth();
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    
    // State for the tagging process
    const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<MuseumLocation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleScan = async (data: string) => {
        setIsScannerOpen(false);
        setIsLoading(true);
        setMessage(null);

        try {
            if (data.startsWith('item:')) {
                const itemId = data.replace('item:', '');
                const itemDoc = await getDoc(doc(db, 'archive_items', itemId));
                if (itemDoc.exists()) {
                    setSelectedItem({ id: itemDoc.id, ...itemDoc.data() } as ArchiveItem);
                } else {
                    setMessage({ type: 'error', text: "Item not found in database." });
                }
            } else if (data.startsWith('loc:')) {
                const locId = data.replace('loc:', '');
                // Find location by its slug string (locId) rather than Firestore Doc ID
                const locQuery = query(collection(db, 'locations'), where('id', '==', locId));
                const locSnapshot = await getDocs(locQuery);
                
                if (!locSnapshot.empty) {
                    const locData = { id: locSnapshot.docs[0].id, ...locSnapshot.docs[0].data() } as MuseumLocation;
                    setSelectedLocation(locData);
                } else {
                    setMessage({ type: 'error', text: "Location code not recognized." });
                }
            } else {
                setMessage({ type: 'error', text: "Invalid QR code format. Please scan a SAHS tracking code." });
            }
        } catch (error) {
            console.error("Scan processing error:", error);
            setMessage({ type: 'error', text: "An error occurred while processing the scan." });
        } finally {
            setIsLoading(false);
        }
    };

    const performTagging = async () => {
        if (!selectedItem || !selectedLocation) return;

        setIsLoading(true);
        try {
            const itemRef = doc(db, 'archive_items', selectedItem.id);
            await updateDoc(itemRef, {
                museum_location_id: selectedLocation.id,
                last_tagged_at: new Date().toISOString(),
                last_tagged_by: user?.email || 'unknown'
            });

            setMessage({ 
                type: 'success', 
                text: `Successfully tagged "${selectedItem.title}" to "${selectedLocation.name}"` 
            });
            
            // Reset for next scan
            setSelectedItem(null);
            setSelectedLocation(null);
        } catch (error) {
            console.error("Tagging error:", error);
            setMessage({ type: 'error', text: "Failed to update item location." });
        } finally {
            setIsLoading(false);
        }
    };

    const resetFlow = () => {
        setSelectedItem(null);
        setSelectedLocation(null);
        setMessage(null);
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 border-b border-tan-light/50 pb-6">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <History className="text-tan" size={32} />
                        Tagging Hub
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Move artifacts between museum locations using QR codes.
                    </p>
                </div>
            </div>

            {message && (
                <div className={`mb-8 p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2 duration-300 ${
                    message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                    <p className="font-medium">{message.text}</p>
                    <button onClick={() => setMessage(null)} className="ml-auto opacity-50 hover:opacity-100 p-1">
                        <X size={18} />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {/* Item Card */}
                <div className={`relative p-8 rounded-3xl border-2 transition-all flex flex-col items-center text-center gap-4 ${
                    selectedItem 
                        ? 'bg-tan/5 border-tan shadow-sm' 
                        : 'bg-white border-tan-light/50 border-dashed hover:border-tan/30 cursor-pointer'
                }`} onClick={() => !selectedItem && setIsScannerOpen(true)}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 ${
                        selectedItem ? 'bg-tan text-white' : 'bg-cream text-tan'
                    }`}>
                        <Box size={32} />
                    </div>
                    
                    {selectedItem ? (
                        <>
                            <div className="flex-1">
                                <h3 className="font-serif font-bold text-xl text-charcoal mb-1">{selectedItem.title}</h3>
                                <p className="text-xs font-bold text-tan/60 uppercase tracking-widest leading-loose">
                                    {selectedItem.artifact_id || selectedItem.id}
                                </p>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedItem(null); }}
                                className="text-xs text-charcoal/40 hover:text-red-500 font-bold uppercase tracking-wider"
                            >
                                Change Item
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex-1">
                                <h3 className="font-serif font-bold text-xl text-charcoal mb-2">Identify Artifact</h3>
                                <p className="text-sm text-charcoal/60 px-4 leading-relaxed">
                                    Scan the QR code attached to the physical artifact.
                                </p>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsScannerOpen(true); }}
                                className="bg-charcoal text-white px-6 py-3 rounded-xl font-bold hover:bg-charcoal-light transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Camera size={18} /> Scan Item
                            </button>
                        </>
                    )}
                </div>

                {/* Location Card */}
                <div className={`relative p-8 rounded-3xl border-2 transition-all flex flex-col items-center text-center gap-4 ${
                    selectedLocation 
                        ? 'bg-tan/5 border-tan shadow-sm' 
                        : !selectedItem 
                            ? 'bg-cream/10 border-tan-light/20 opacity-40 cursor-not-allowed'
                            : 'bg-white border-tan-light/50 border-dashed hover:border-tan/30 cursor-pointer'
                }`} onClick={() => selectedItem && !selectedLocation && setIsScannerOpen(true)}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 ${
                        selectedLocation ? 'bg-tan text-white' : 'bg-cream text-tan'
                    }`}>
                        <MapPin size={32} />
                    </div>
                    
                    {selectedLocation ? (
                        <>
                            <div className="flex-1">
                                <h3 className="font-serif font-bold text-xl text-charcoal mb-1">{selectedLocation.name}</h3>
                                <p className="text-xs font-bold text-tan/60 uppercase tracking-widest leading-loose">
                                    Current Destination
                                </p>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedLocation(null); }}
                                className="text-xs text-charcoal/40 hover:text-red-500 font-bold uppercase tracking-wider"
                            >
                                Change Location
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex-1">
                                <h3 className="font-serif font-bold text-xl text-charcoal mb-2">Identify Location</h3>
                                <p className="text-sm text-charcoal/60 px-4 leading-relaxed">
                                    Scan the QR code at the destination shelf or display case.
                                </p>
                            </div>
                            <button 
                                disabled={!selectedItem}
                                onClick={(e) => { e.stopPropagation(); setIsScannerOpen(true); }}
                                className="bg-charcoal text-white px-6 py-3 rounded-xl font-bold hover:bg-charcoal-light transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                            >
                                <Camera size={18} /> Scan Location
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Confirmation Section */}
            <div className={`bg-white rounded-3xl border border-tan-light/50 p-8 flex flex-col items-center transition-all duration-500 ${
                selectedItem && selectedLocation ? 'opacity-100 translate-y-0' : 'opacity-30 pointer-events-none translate-y-4'
            }`}>
                <div className="flex items-center gap-6 mb-8 w-full justify-center">
                    <div className="text-right">
                        <p className="text-xs font-bold text-tan uppercase tracking-widest mb-1">Item</p>
                        <p className="font-serif font-bold text-charcoal">{selectedItem?.title}</p>
                    </div>
                    <ArrowRight className="text-tan/30" size={32} />
                    <div>
                        <p className="text-xs font-bold text-tan uppercase tracking-widest mb-1">Destination</p>
                        <p className="font-serif font-bold text-charcoal">{selectedLocation?.name}</p>
                    </div>
                </div>

                <div className="flex gap-4 w-full">
                    <button 
                        onClick={resetFlow}
                        className="flex-1 px-8 py-4 rounded-xl font-bold text-charcoal-light border border-tan-light hover:bg-black/5 transition-all"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={performTagging}
                        disabled={isLoading || !selectedItem || !selectedLocation}
                        className="flex-[2] bg-tan text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-charcoal transition-all shadow-md flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={24} /> : (
                            <>
                                <CheckCircle2 size={24} /> Confirm Tag In
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Recent Activity Placeholder */}
            <div className="mt-16 pb-20">
                <h2 className="text-xs font-bold text-charcoal-light tracking-wider uppercase mb-6 flex items-center gap-2">
                    <History size={16} /> Recent Tagging Activity
                </h2>
                <div className="bg-white rounded-2xl border border-tan-light/30 p-8 text-center">
                    <p className="text-sm text-charcoal/40 font-serif italic">Your recent movements will appear here.</p>
                </div>
            </div>

            {isScannerOpen && (
                <QRScanner 
                    active={isScannerOpen} 
                    onScan={handleScan} 
                    onClose={() => setIsScannerOpen(false)} 
                />
            )}
        </div>
    );
}
