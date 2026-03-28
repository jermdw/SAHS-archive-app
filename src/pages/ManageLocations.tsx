import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { MapPin, Plus, Trash2, Map, Loader2, HelpCircle } from 'lucide-react';
import type { MuseumLocation } from '../types/database';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

export function ManageLocations() {
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form state
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newId, setNewId] = useState('');

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MuseumLocation[];
            setLocations(data.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error("Error fetching locations:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newId) return;

        setIsSubmitting(true);
        try {
            const slug = newId.toLowerCase().replace(/\s+/g, '-').trim();
            await addDoc(collection(db, 'locations'), {
                name: newName,
                description: newDesc,
                id: slug, // This is our custom ID for QR codes
                created_at: new Date().toISOString()
            });
            
            setNewName('');
            setNewDesc('');
            setNewId('');
            fetchLocations();
        } catch (error) {
            console.error("Error adding location:", error);
            alert("Failed to add location.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLocation = async (docId: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"? Items currently tagged here will lose their location reference.`)) return;
        
        try {
            await deleteDoc(doc(db, 'locations', docId));
            fetchLocations();
        } catch (error) {
            console.error("Error deleting location:", error);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 border-b border-tan-light/50 pb-6 pr-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <MapPin className="text-tan" size={32} />
                        Museum Locations
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Define physical locations within the museum and generate tracking QR codes.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form to Add Location */}
                <div className="lg:col-span-4">
                    <div className="bg-white p-6 rounded-2xl border border-tan-light/50 shadow-sm sticky top-24">
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                            <Plus size={20} className="text-tan" />
                            Add New Location
                        </h2>
                        
                        <form onSubmit={handleAddLocation} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">
                                    Location Name
                                </label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="e.g. Gallery A, Shelf 1"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans flex items-center gap-2">
                                    Location ID / Slug
                                    <span className="group relative">
                                        <HelpCircle size={14} className="text-charcoal/30 cursor-help" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-charcoal text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            Unique identifier for QR codes. e.g. "shelf-a1"
                                        </span>
                                    </span>
                                </label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="e.g. shelf-a1"
                                    value={newId}
                                    onChange={(e) => setNewId(e.target.value)}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">
                                    Description (Optional)
                                </label>
                                <textarea 
                                    placeholder="Additional details about this location..."
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream px-4 py-3 rounded-xl border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal resize-none"
                                />
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-tan text-white px-5 py-4 rounded-xl font-bold hover:bg-charcoal transition-all hover:scale-[1.02] active:scale-[0.98] mt-4 flex items-center justify-center gap-2 shadow-sm"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (
                                    <>
                                        <Plus size={20} />
                                        Create Location
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* List of Locations */}
                <div className="lg:col-span-8 space-y-6">
                    {loading ? (
                        <div className="p-12 text-center text-charcoal/60 font-serif flex flex-col items-center gap-4">
                            <Loader2 className="animate-spin text-tan" size={32} />
                            Loading locations...
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="bg-white p-16 text-center text-charcoal/50 font-serif rounded-3xl border border-tan-light/50 border-dashed">
                            <Map size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="text-xl font-bold text-charcoal/40 mb-2">No locations defined yet</p>
                            <p className="max-w-xs mx-auto text-sm leading-relaxed">
                                Start by adding your first museum location to begin tracking artifacts.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                            {locations.map(loc => (
                                <div key={loc.id} className="group relative bg-white border border-tan-light/50 rounded-3xl p-2 transition-all hover:shadow-md hover:border-tan/30">
                                    <div className="flex flex-col">
                                        <div className="p-4 flex justify-between items-start mb-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="w-2 h-2 rounded-full bg-tan"></div>
                                                    <h3 className="font-serif font-bold text-lg text-charcoal">{loc.name}</h3>
                                                </div>
                                                <p className="text-xs font-mono font-bold text-tan/60 uppercase tracking-widest">{loc.id}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteLocation(loc.id, loc.name)}
                                                className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        
                                        <div className="px-2 pb-2">
                                            <QRCodeDisplay 
                                                value={`loc:${loc.id}`} 
                                                label={loc.name}
                                                subLabel={loc.description || "Museum Location"}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
