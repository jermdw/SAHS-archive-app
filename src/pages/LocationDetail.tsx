import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Box, MapPin, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { DocumentCard } from '../components/DocumentCard';
import { Search, Plus, Check, Loader2, X, AlertCircle } from 'lucide-react';
import type { MuseumLocation, ArchiveItem } from '../types/database';

export function LocationDetail() {
    const { id } = useParams();
    const [locationData, setLocationData] = useState<MuseumLocation | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser, user } = useAuth();

    // Selection/Search State
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ArchiveItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [isLinking, setIsLinking] = useState(false);

    const fetchLocationAndItems = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // Fetch location details
            const docRef = doc(db, 'locations', id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                setLocationData({ id: docSnap.id, ...docSnap.data() } as MuseumLocation);
            } else {
                const locQuery = query(collection(db, 'locations'), where('id', '==', id));
                const locSnap = await getDocs(locQuery);
                if (!locSnap.empty) {
                    setLocationData({ id: locSnap.docs[0].id, ...locSnap.docs[0].data() } as MuseumLocation);
                }
            }

            // Fetch items at this location
            const q = query(
                collection(db, 'archive_items'), 
                where('museum_location_id', '==', id)
            );
            
            const querySnapshot = await getDocs(q);
            let itemsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ArchiveItem[];
            
            itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            setItems(itemsData);
        } catch (error) {
            console.error("Error fetching location details:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocationAndItems();
    }, [id]);

    // Search for items to add
    useEffect(() => {
        const searchItems = async () => {
            if (!searchQuery || searchQuery.length < 2) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const q = query(collection(db, 'archive_items'));
                const snap = await getDocs(q);
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArchiveItem));
                
                const filtered = all.filter(item => {
                    const matchesQuery = 
                        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.artifact_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        item.description?.toLowerCase().includes(searchQuery.toLowerCase());
                    
                    // Exclude items already here
                    return matchesQuery && item.museum_location_id !== id;
                }).slice(0, 10); // Limit results for speed
                
                setSearchResults(filtered);
            } catch (err) {
                console.error("Error searching items:", err);
            } finally {
                setIsSearching(false);
            }
        };

        const timer = setTimeout(searchItems, 400);
        return () => clearTimeout(timer);
    }, [searchQuery, id]);

    const toggleItemSelection = (itemId: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const handleLinkItems = async () => {
        if (selectedItemIds.size === 0 || !id) return;
        setIsLinking(true);
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            selectedItemIds.forEach(itemId => {
                const itemRef = doc(db, 'archive_items', itemId);
                batch.update(itemRef, {
                    museum_location_id: id,
                    last_tagged_at: now,
                    last_tagged_by: adminEmail,
                    stage: 'Housed'
                });
            });

            await batch.commit();
            
            // Cleanup and refresh
            setSelectedItemIds(new Set());
            setSearchQuery('');
            setIsSelectMode(false);
            await fetchLocationAndItems();
        } catch (error) {
            console.error("Error linking items:", error);
            alert("Failed to link items. Please check permissions.");
        } finally {
            setIsLinking(false);
        }
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading shelf details...</div>;
    }

    if (!locationData) {
        return (
            <div className="max-w-6xl mx-auto py-12 text-center">
                <h2 className="text-2xl font-serif text-charcoal mb-4">Location not found</h2>
                <Link to="/manage-locations" className="text-tan hover:text-charcoal transition-colors">
                    &larr; Back to Locations
                </Link>
            </div>
        );
    }

    return (
        <>
        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500 pb-16 print:hidden">
            <Link to="/manage-locations" className="inline-flex items-center text-sm font-bold text-tan uppercase tracking-wider mb-6 hover:text-charcoal transition-colors">
                <ChevronLeft size={16} className="mr-1" /> Back to Museum Locations
            </Link>

            <div className="bg-white rounded-2xl border border-tan-light/50 overflow-hidden mb-10 shadow-sm flex flex-col md:flex-row">
                <div className="md:w-1/4 bg-tan-light/10 relative min-h-[200px] flex items-center justify-center border-r border-tan-light/30">
                    <MapPin size={80} className="text-tan/20" />
                </div>
                
                <div className="p-8 md:p-10 flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-black text-white bg-tan px-3 py-1 rounded-full uppercase tracking-[0.2em]">Physical Location</span>
                        <span className="text-[10px] font-mono font-bold text-tan/60 uppercase tracking-widest">{locationData.id}</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight">
                        {locationData.name}
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-3xl leading-relaxed whitespace-pre-wrap">
                        {locationData.description || "No description provided."}
                    </p>
                    <div className="mt-6 flex items-center gap-4 text-sm font-bold text-charcoal/50 uppercase tracking-wider">
                        <span className="flex items-center gap-2"><Box size={16} /> {items.length} Artifacts Filed</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-serif font-bold text-charcoal tracking-tight flex items-center gap-3">
                    Items Housed Here
                    <span className="bg-tan/10 text-tan text-sm py-1 px-3 rounded-full font-sans">{items.length}</span>
                </h2>
                
                <div className="flex items-center gap-3">
                    {isSAHSUser && (
                        <button 
                            onClick={() => setIsSelectMode(!isSelectMode)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-bold transition-all shadow-sm w-full sm:w-auto justify-center ${
                                isSelectMode ? 'bg-charcoal text-white' : 'bg-white border border-tan text-tan hover:bg-tan/5'
                            }`}
                        >
                            {isSelectMode ? <X size={18} /> : <Plus size={18} />}
                            {isSelectMode ? 'Close' : 'Add Artifacts'}
                        </button>
                    )}
                    {items.length > 0 && !isSelectMode && (
                        <button 
                            onClick={() => window.print()}
                            className="flex items-center gap-2 bg-tan text-white px-5 py-3 rounded-lg font-bold hover:bg-charcoal transition-colors shadow-sm w-full sm:w-auto justify-center"
                        >
                            <Printer size={18} /> Print Labels
                        </button>
                    )}
                </div>
            </div>

            {/* Add Items Interface */}
            {isSelectMode && (
                <div className="bg-cream/40 border-2 border-dashed border-tan/30 rounded-2xl p-6 md:p-8 mb-10 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                            <h3 className="text-xl font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                                <Search size={20} className="text-tan" />
                                Search Collection to Link
                            </h3>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/30" size={18} />
                                <input 
                                    type="text"
                                    placeholder="Search by title, ID, or description..."
                                    className="w-full bg-white pl-11 pr-4 py-4 rounded-xl border border-tan-light/50 focus:border-tan outline-none transition-all shadow-sm"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="mt-6 space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {isSearching ? (
                                    <div className="flex items-center justify-center py-8 text-charcoal/40 gap-2">
                                        <Loader2 className="animate-spin" size={18} />
                                        Searching items...
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(result => (
                                        <div 
                                            key={result.id}
                                            onClick={() => toggleItemSelection(result.id!)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                selectedItemIds.has(result.id!) 
                                                    ? 'bg-tan/10 border-tan shadow-sm' 
                                                    : 'bg-white border-tan-light/30 hover:border-tan/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-lg bg-tan-light/10 flex items-center justify-center overflow-hidden shrink-0 border border-tan-light/20">
                                                    {result.file_urls?.[0] ? (
                                                        <img src={result.file_urls[0]} alt={result.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Box size={20} className="text-tan/30" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-charcoal group-hover:text-tan transition-colors">{result.title}</h4>
                                                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-charcoal/40 uppercase">
                                                        <span>{result.artifact_id || 'NO-ID'}</span>
                                                        <span>&bull;</span>
                                                        <span>{result.item_type}</span>
                                                        {result.museum_location_id && (
                                                            <>
                                                                <span className="text-red-400">&bull; Currently at: {result.museum_location_id}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                                selectedItemIds.has(result.id!) ? 'bg-tan border-tan text-white' : 'border-tan-light group-hover:border-tan'
                                            }`}>
                                                {selectedItemIds.has(result.id!) && <Check size={14} strokeWidth={3} />}
                                            </div>
                                        </div>
                                    ))
                                ) : searchQuery.length >= 2 ? (
                                    <div className="text-center py-8 text-charcoal/40 italic">No items found matching "{searchQuery}"</div>
                                ) : (
                                    <div className="text-center py-8 text-charcoal/30 flex flex-col items-center gap-2">
                                        <AlertCircle size={24} className="opacity-20" />
                                        <p className="text-sm font-sans">Enter at least 2 characters to search the archive.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:w-72 bg-white/50 border border-tan-light/30 rounded-xl p-6 flex flex-col">
                            <h3 className="font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                                <Check size={18} className="text-tan" />
                                Selection
                            </h3>
                            <div className="flex-1 text-sm text-charcoal/60 mb-6">
                                {selectedItemIds.size === 0 ? (
                                    <p className="italic">No items selected yet. Click an item to select it for this shelf.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-lg font-bold text-tan">{selectedItemIds.size} Items Selected</p>
                                        <div className="bg-tan/5 p-3 rounded-lg border border-tan/20">
                                            <p className="text-xs leading-relaxed">
                                                These artifacts will be reassigned to:
                                                <span className="block font-bold text-charcoal mt-1">{locationData.name}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={handleLinkItems}
                                disabled={selectedItemIds.size === 0 || isLinking}
                                className="w-full bg-tan text-white py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md disabled:bg-charcoal/20 disabled:shadow-none flex items-center justify-center gap-3"
                            >
                                {isLinking ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        Linking...
                                    </>
                                ) : (
                                    <>
                                        Link to this Location
                                        <Check size={20} />
                                    </>
                                )}
                            </button>
                            {selectedItemIds.size > 0 && (
                                <button 
                                    onClick={() => setSelectedItemIds(new Set())}
                                    className="mt-3 text-[10px] font-black uppercase tracking-widest text-charcoal/40 hover:text-red-500 transition-colors mx-auto"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1">
                {items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {items.map(item => (
                            <DocumentCard key={item.id} item={item} galleryIds={items.map(i => i.id || '')} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-cream/30 rounded-xl border border-tan-light/50 shadow-sm">
                        <Box size={48} className="mx-auto text-tan/30 mb-4" />
                        <p className="text-charcoal-light text-xl font-serif mb-2 text-charcoal/70">Shelf is empty.</p>
                        <p className="text-charcoal-light/60 font-sans max-w-md mx-auto">There are currently no artifacts registered to this physical location.</p>
                    </div>
                )}
            </div>
        </div>
        
        {/* Dedicated Print Layout - Purely optimized for paper density */}
        <div className="hidden print:block w-full bg-white text-black bg-none">
            <div className="mb-6 border-b border-black pb-4 text-center">
                <h1 className="text-2xl font-bold font-serif m-0">{locationData.name} - Asset Tags</h1>
                <p className="text-sm m-0 text-gray-500">Inventory Label Sheet &bull; Generated {new Date().toLocaleDateString()}</p>
            </div>
            
            {/* Grid layout ensuring ~1.5 inch squares fit tightly across paper width */}
            <div className="flex flex-wrap gap-[0.2in] justify-center items-center text-center">
                {items.map(item => (
                    <div key={item.id} className="flex flex-col items-center justify-center p-2 border border-gray-400 w-[1.5in] h-[1.5in] bg-white break-inside-avoid">
                        <QRCodeSVG 
                            value={`${window.location.hostname === 'localhost' ? 'https://sahs-archives.web.app' : window.location.origin}/items/${item.id}`} 
                            size={96} // Exactly 1 inch optical scale on 96dpi output
                            level="L"
                            includeMargin={false}
                        />
                        <span className="text-[10px] font-bold mt-[0.1in] truncate w-full px-1">{item.title}</span>
                        <span className="text-[8px] mt-0.5 text-gray-600 font-mono tracking-tighter truncate w-full px-1">{item.artifact_id || item.id}</span>
                    </div>
                ))}
            </div>
        </div>
        </>
    );
}
