import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { DocumentCard } from '../components/DocumentCard';
import { Search, Loader2, Check, Box, Plus, MapPin, Printer, ChevronLeft, Tag, X, AlertCircle } from 'lucide-react';
import type { MuseumLocation, ArchiveItem } from '../types/database';

export function LocationDetail() {
    const { id } = useParams();
    const [locationData, setLocationData] = useState<MuseumLocation | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser, user } = useAuth();

    // Selection/Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ArchiveItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedItems, setSelectedItems] = useState<ArchiveItem[]>([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [searchMode, setSearchMode] = useState<'keyword' | 'id'>('keyword');
    const [isLinking, setIsLinking] = useState(false);
    
    // Conflict State
    const [conflictedItems, setConflictedItems] = useState<ArchiveItem[]>([]);
    const [currentConflictIndex, setCurrentConflictIndex] = useState(-1);

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

            // Fetch items at this location - support both legacy string and new array
            const q = query(
                collection(db, 'archive_items'), 
                where('museum_location_ids', 'array-contains', id)
            );

            // Also check legacy single-string location for backward compatibility
            const qLegacy = query(
                collection(db, 'archive_items'),
                where('museum_location_id', '==', id)
            );
            
            const [querySnapshot, legacySnapshot] = await Promise.all([
                getDocs(q),
                getDocs(qLegacy)
            ]);

            const itemsMap = new Map<string, ArchiveItem>();
            
            querySnapshot.docs.forEach(doc => {
                itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
            });
            legacySnapshot.docs.forEach(doc => {
                itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as ArchiveItem);
            });

            const itemsData = Array.from(itemsMap.values());
            
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
                const itemsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArchiveItem));
                
                const filtered = itemsData.filter(item => {
                    const kw = searchQuery.toLowerCase();
                    const artifactIdStr = String(item.artifact_id || '').toLowerCase();
                    const identifierStr = String(item.identifier || '').toLowerCase();
                    const idStr = String(item.id || '').toLowerCase();

                    let matchesQuery = false;
                    if (searchMode === 'keyword') {
                        matchesQuery = item.title?.toLowerCase().includes(kw) ||
                                       item.description?.toLowerCase().includes(kw);
                    } else {
                        // ID mode focuses ONLY on the numeric IDs and identifiers
                        matchesQuery = artifactIdStr.includes(kw) ||
                                       idStr.includes(kw) ||
                                       identifierStr.includes(kw);
                    }
                    
                    // Exclude items already here
                    return matchesQuery && item.museum_location_id !== id;
                }).slice(0, 15); // Slightly more for better results
                
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

    const toggleItemSelection = (item: ArchiveItem) => {
        setSelectedItems(prev => {
            const isSelected = prev.some(i => i.id === item.id);
            if (isSelected) {
                return prev.filter(i => i.id !== item.id);
            } else {
                return [...prev, item];
            }
        });
    };

    const handleLinkItems = async (forceResolution?: { itemId: string, mode: 'move' | 'both' }[]) => {
        if (selectedItems.length === 0 || !id) return;
        
        // 1. Check for conflicts if not already resolving
        if (!forceResolution) {
            const conflicts: ArchiveItem[] = [];
            const isMeaningful = (val: string | undefined | null) => {
                if (!val) return false;
                const trimmed = val.trim();
                return trimmed.length > 0 && 
                       trimmed.toLowerCase() !== 'unassigned' && 
                       trimmed.toLowerCase() !== 'none' &&
                       trimmed.toLowerCase() !== 'undefined' &&
                       trimmed.toLowerCase() !== 'null' &&
                       trimmed !== '""';
            };

            selectedItems.forEach(item => {
                // Focus ONLY on the formal NEW location system (IDs)
                const currentId = id || "";
                
                // 1. Singular formal assignment
                const itemFormalId = item.museum_location_id;
                const hasSingularConflict = isMeaningful(itemFormalId) && itemFormalId !== currentId;
                
                // 2. Plural formal assignments
                const hasPluralConflict = item.museum_location_ids?.some(lid => isMeaningful(lid) && lid !== currentId) || false;
                
                // NOTE: We deliberately ignore item.museum_location (legacy text) to avoid 
                // "ghost" conflicts from historical data.
                
                if (hasSingularConflict || hasPluralConflict) {
                    conflicts.push(item);
                }
            });

            if (conflicts.length > 0) {
                setConflictedItems(conflicts);
                setCurrentConflictIndex(0);
                return;
            }
        }

        setIsLinking(true);
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            selectedItems.forEach(item => {
                const itemRef = doc(db, 'archive_items', item.id!);
                const resolution = forceResolution?.find(r => r.itemId === item.id);
                
                let newLocationIds: string[] = [];
                
                if (resolution?.mode === 'both') {
                    // Keep existing locations and add new one
                    const existing = item.museum_location_ids || [];
                    const legacy = item.museum_location_id;
                    newLocationIds = Array.from(new Set([...existing, ...(legacy ? [legacy] : []), id!]));
                } else {
                    // Move/Default: Set to ONLY this location
                    newLocationIds = [id!];
                }

                batch.update(itemRef, {
                    museum_location_ids: newLocationIds,
                    museum_location_id: id, // Still update legacy for safety
                    last_tagged_at: now,
                    last_tagged_by: adminEmail,
                    stage: 'Housed'
                });
            });

            await batch.commit();
            
            // Cleanup and refresh
            setSelectedItems([]);
            setSearchQuery('');
            setIsSelectMode(false);
            setConflictedItems([]);
            setCurrentConflictIndex(-1);
            await fetchLocationAndItems();
        } catch (error) {
            console.error("Error linking items:", error);
            alert("Failed to link items. Please check permissions.");
        } finally {
            setIsLinking(false);
        }
    };

    const handleRemoveItemFromLocation = async (e: React.MouseEvent, item: ArchiveItem) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!id || !isSAHSUser) return;
        
        const confirmMsg = `Remove "${item.title}" from this location? \n\n(The artifact will remain in the archive and can be reassigned later)`;
        if (!window.confirm(confirmMsg)) return;

        try {
            const itemRef = doc(db, 'archive_items', item.id!);
            const now = new Date().toISOString();
            const adminEmail = user?.email || 'Admin';

            // 1. Filter out the current location from IDs array
            const currentIds = item.museum_location_ids || [];
            const newIds = currentIds.filter(lid => lid !== id);

            // 2. Prepare update object
            const updates: any = {
                museum_location_ids: newIds,
                last_tagged_at: now,
                last_tagged_by: adminEmail
            };

            // 3. If legacy ID matches this one, clear it
            if (item.museum_location_id === id) {
                updates.museum_location_id = null;
            }

            // 4. Update stage to 'Unassigned' if this was the last location? 
            // Or maybe just leave it 'Housed' if it has other locations.
            if (newIds.length === 0) {
                updates.stage = 'Unassigned';
            }

            await updateDoc(itemRef, updates);

            // 5. Optimistic local update
            setItems(prev => prev.filter(i => i.id !== item.id));
            
            // Optional: Alert or subtle notification
        } catch (error) {
            console.error("Error removing item from location:", error);
            alert("Failed to remove item. Please check permissions.");
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
        {/* Conflict Resolution Modal */}
        {currentConflictIndex >= 0 && conflictedItems[currentConflictIndex] && (
            <div className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-tan/10 p-8 border-b border-tan/20 text-center">
                        <div className="w-16 h-16 bg-tan/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MapPin size={32} className="text-tan" />
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-charcoal mb-2">Location Conflict</h2>
                        <p className="text-charcoal/60 text-sm italic">"{conflictedItems[currentConflictIndex].title}"</p>
                    </div>
                    
                    <div className="p-8">
                        <p className="text-charcoal/80 mb-6 leading-relaxed">
                            This artifact is currently listed in <span className="font-bold text-tan">{(conflictedItems[currentConflictIndex].museum_location_id || conflictedItems[currentConflictIndex].museum_location_ids?.[0] || conflictedItems[currentConflictIndex].museum_location)?.trim() || "an unspecified location"}</span>. 
                            How would you like to update its records?
                        </p>
                        
                        <div className="grid gap-3">
                            <button 
                                onClick={() => {
                                    // Default Move behavior by allowing the loop to proceed without 'both' flag
                                    if (currentConflictIndex + 1 < conflictedItems.length) {
                                        setCurrentConflictIndex(currentConflictIndex + 1);
                                    } else {
                                        handleLinkItems([]); // Proceed as default move
                                    }
                                }}
                                className="w-full py-4 px-6 bg-tan text-white rounded-xl font-bold hover:bg-charcoal transition-all shadow-md flex items-center justify-between group"
                            >
                                <span>Relocate to {locationData.name}</span>
                                <ChevronLeft size={18} className="rotate-180 opacity-40 group-hover:opacity-100" />
                            </button>
                            
                            <button 
                                onClick={() => {
                                    // Treat this item as 'both'
                                    // We need to track individual resolutions if multiple
                                    const resolutions = conflictedItems.map((item, idx) => ({
                                        itemId: item.id!,
                                        mode: idx === currentConflictIndex ? 'both' : 'move'
                                    } as { itemId: string, mode: 'move' | 'both' }));
                                    
                                    handleLinkItems(resolutions);
                                }}
                                className="w-full py-4 px-6 bg-white border-2 border-tan-light text-tan rounded-xl font-bold hover:bg-tan/5 transition-all flex items-center justify-between group"
                            >
                                <span>List in Both Locations</span>
                                <Plus size={18} className="opacity-40 group-hover:opacity-100" />
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setConflictedItems([]);
                                    setCurrentConflictIndex(-1);
                                    setIsLinking(false);
                                }}
                                className="w-full py-3 px-6 text-charcoal/40 font-bold hover:text-red-500 transition-colors text-sm"
                            >
                                Cancel Operation
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500 pb-16 print:hidden">
            <Link to="/manage-locations" className="inline-flex items-center text-[10px] font-black text-tan uppercase tracking-[0.3em] mb-12 hover:text-charcoal transition-all group">
                <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Museum Wings
            </Link>

            <div className="bg-white rounded-[32px] md:rounded-[48px] border border-tan-light/20 overflow-hidden shadow-2xl shadow-tan/5 mb-10 md:mb-16 flex flex-col lg:flex-row relative">
                {/* Decorative Element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-tan/5 rounded-bl-[200px] -mr-20 -mt-20 pointer-events-none" />
                
                <div className="lg:w-1/4 bg-tan-light/5 p-8 md:p-12 lg:p-16 flex items-center justify-center border-b lg:border-b-0 lg:border-r border-tan-light/10">
                    <div className="relative group/icon">
                        <div className="absolute inset-0 bg-tan/20 blur-3xl rounded-full scale-0 group-hover/icon:scale-100 transition-transform duration-1000 opacity-30" />
                        <MapPin size={80} className="text-tan/10 relative z-10" fill="currentColor" />
                        <Tag size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-tan relative z-20 transition-transform duration-500 group-hover/icon:scale-110" />
                    </div>
                </div>
                <div className="p-8 md:p-12 lg:p-16 flex-1 flex flex-col justify-center relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-px w-8 bg-tan/30" />
                        <span className="text-[10px] font-black text-tan uppercase tracking-[0.4em]">Display Location #{locationData.id}</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4 text-charcoal tracking-tight leading-[0.95]">
                        {locationData.name}
                    </h1>
                    <p className="text-charcoal/60 text-lg md:text-xl font-serif italic mb-6 max-w-3xl leading-relaxed">
                        {locationData.description || "A dedicated archive space within the museum wings."}
                    </p>
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3 text-xs font-black text-charcoal/40 uppercase tracking-[0.2em]">
                            <Box size={20} className="text-tan" /> 
                            <span>{items.length} Artifacts Filed</span>
                        </div>
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
                <div className="bg-white border border-tan-light/20 rounded-[32px] md:rounded-[48px] p-8 md:p-12 mb-12 md:mb-20 animate-in slide-in-from-top-8 duration-500 shadow-2xl shadow-tan/5">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                             <h3 className="text-xl font-serif font-bold text-charcoal mb-4 flex items-center gap-2">
                                <Search size={20} className="text-tan" />
                                Link Artifacts to this Shelf
                            </h3>

                            {/* Search Tab Switcher */}
                            <div className="flex bg-tan/5 p-1.5 rounded-xl border border-tan-light/30 mb-5 gap-1 shadow-inner max-w-sm">
                                <button 
                                    onClick={() => { setSearchMode('keyword'); setSearchQuery(''); }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'keyword' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal/60'
                                    }`}
                                >
                                    <Search size={16} /> Keyword Search
                                </button>
                                <button 
                                    onClick={() => { setSearchMode('id'); setSearchQuery(''); }}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'id' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/40 hover:text-charcoal/60'
                                    }`}
                                >
                                    <Tag size={16} /> ID Number Search
                                </button>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-charcoal/20" size={20} />
                                <input 
                                    type="text"
                                    placeholder={searchMode === 'keyword' ? "Search by title or description..." : "Enter Catalog ID # (e.g. 1905)"}
                                    className="w-full bg-white pl-14 pr-4 py-5 rounded-2xl border-2 border-tan-light/50 focus:border-tan outline-none transition-all shadow-md text-xl font-serif placeholder:font-serif placeholder:text-charcoal/20"
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
                                            onClick={() => toggleItemSelection(result)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                selectedItems.some(i => i.id === result.id) 
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
                                                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold text-charcoal/40 uppercase">
                                                        <span className="bg-tan/10 text-tan px-1.5 py-0.5 rounded">ID: {result.artifact_id || 'NO-ID'}</span>
                                                        <span>&bull;</span>
                                                        <span>{result.item_type}</span>
                                                        {result.museum_location_id?.trim() && (
                                                            <>
                                                                <span className="text-red-400">&bull; Currently at: {result.museum_location_id}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                                selectedItems.some(i => i.id === result.id) ? 'bg-tan border-tan text-white' : 'border-tan-light group-hover:border-tan'
                                            }`}>
                                                {selectedItems.some(i => i.id === result.id) && <Check size={14} strokeWidth={3} />}
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
                                {selectedItems.length === 0 ? (
                                    <p className="italic">No items selected yet. Click an item to select it for this shelf.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-lg font-bold text-tan">{selectedItems.length} Items Selected</p>
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
                                onClick={() => handleLinkItems()}
                                disabled={selectedItems.length === 0 || isLinking}
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
                            {selectedItems.length > 0 && (
                                <button 
                                    onClick={() => setSelectedItems([])}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 auto-rows-max">
                        {items.map(item => (
                            <DocumentCard 
                                key={item.id} 
                                item={item} 
                                galleryIds={items.map(i => i.id || '')} 
                                onRemove={(e) => handleRemoveItemFromLocation(e, item)}
                            />
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
