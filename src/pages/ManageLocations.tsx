import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { MapPin, Plus, Trash2, Map, Loader2, HelpCircle, Edit2, X } from 'lucide-react';
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

    const [mode, setMode] = useState<'add' | 'edit'>('add');
    const [editingDocId, setEditingDocId] = useState<string | null>(null);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            const data = snapshot.docs.map(doc => ({
                docId: doc.id,
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
            if (mode === 'edit' && editingDocId) {
                await updateDoc(doc(db, 'locations', editingDocId), {
                    name: newName,
                    description: newDesc
                });
            } else {
                const slug = newId.toLowerCase().replace(/\s+/g, '-').trim();
                await addDoc(collection(db, 'locations'), {
                    name: newName,
                    description: newDesc,
                    id: slug, // custom ID for QR codes
                    created_at: new Date().toISOString()
                });
            }
            
            // Reset form completely
            handleCancelEdit();
            fetchLocations();
        } catch (error) {
            console.error("Error saving location:", error);
            alert("Failed to save location.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClick = (loc: MuseumLocation) => {
        if (!loc.docId) return;
        setMode('edit');
        setEditingDocId(loc.docId);
        setNewName(loc.name);
        setNewDesc(loc.description || '');
        setNewId(loc.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setMode('add');
        setEditingDocId(null);
        setNewName('');
        setNewDesc('');
        setNewId('');
    };

    const handleDeleteLocation = async (docId: string | undefined, name: string) => {
        if (!docId) return;
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
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-serif font-bold text-charcoal flex items-center gap-2">
                                {mode === 'edit' ? (
                                    <><Edit2 size={20} className="text-tan" /> Edit Location</>
                                ) : (
                                    <><Plus size={20} className="text-tan" /> Add New Location</>
                                )}
                            </h2>
                            {mode === 'edit' && (
                                <button onClick={handleCancelEdit} className="text-charcoal/40 hover:text-red-500 transition-colors p-1" title="Cancel Edit">
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                        
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
                                    disabled={mode === 'edit'}
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all font-sans text-charcoal font-mono text-sm ${
                                        mode === 'edit' 
                                            ? 'bg-cream/50 border-transparent text-charcoal/50 cursor-not-allowed' 
                                            : 'bg-cream border-transparent focus:bg-white focus:border-tan'
                                    }`}
                                />
                                {mode === 'edit' && (
                                    <p className="text-[10px] bg-red-50 text-red-600 font-bold p-2 mt-2 rounded">
                                        Location Slug cannot be modified to prevent breaking printed physical asset tags.
                                    </p>
                                )}
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
                                        {mode === 'edit' ? <Edit2 size={20} /> : <Plus size={20} />}
                                        {mode === 'edit' ? 'Save Changes' : 'Create Location'}
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
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleEditClick(loc)}
                                                    className="p-2 text-charcoal hover:bg-black/5 rounded-full transition-colors"
                                                    title="Edit Location"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteLocation(loc.docId, loc.name)}
                                                    className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                                                    title="Delete Location"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="px-2 pb-2">
                                            {loc.description && (
                                                <p className="text-sm text-charcoal/70 font-serif leading-relaxed mb-4 px-2">{loc.description}</p>
                                            )}
                                            
                                            <div className="bg-cream/30 p-4 rounded-2xl flex flex-col items-center justify-center gap-4 mt-2">
                                                <QRCodeDisplay 
                                                    value={`loc:${loc.id}`} 
                                                    label={loc.name} 
                                                    subLabel="Museum Location Tag"
                                                    size={120}
                                                />

                                                <Link 
                                                    to={`/locations/${loc.id}`}
                                                    className="flex items-center gap-2 px-6 py-3 bg-tan text-white rounded-xl text-sm font-bold hover:bg-charcoal transition-colors shadow-sm w-full justify-center"
                                                >
                                                    <MapPin size={16} /> View Shelf Display
                                                </Link>
                                            </div>
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
