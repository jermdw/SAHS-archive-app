import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Calendar, MapPin, Tag, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType, Collection } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

export function SearchArchive() {
    const [searchParams, setSearchParams] = useSearchParams();

    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [collectionPrivacyMap, setCollectionPrivacyMap] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const { isSAHSUser } = useAuth();

    // Responsive local states for inputs
    const [localKeyword, setLocalKeyword] = useState(searchParams.get('q') || '');
    const [localYear, setLocalYear] = useState(searchParams.get('year') || '');
    const [localPlace, setLocalPlace] = useState(searchParams.get('place') || '');
    const [localTag, setLocalTag] = useState(searchParams.get('tag') || '');
    const [localArtifactId, setLocalArtifactId] = useState(searchParams.get('id') || '');
    const [localLocId, setLocalLocId] = useState(searchParams.get('loc_id') || '');

    const selectedType = (searchParams.get('type') as ItemType | null) || 'All Items';
    const sortBy = (searchParams.get('sort') as any) || 'newest';

    // Debounce effects to sync local state to URL
    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localKeyword) params.set('q', localKeyword); else params.delete('q');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localKeyword]);

    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localYear) params.set('year', localYear); else params.delete('year');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localYear]);

    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localPlace) params.set('place', localPlace); else params.delete('place');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localPlace]);

    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localTag) params.set('tag', localTag); else params.delete('tag');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localTag]);

    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localArtifactId) params.set('id', localArtifactId); else params.delete('id');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localArtifactId]);

    useEffect(() => {
        const h = setTimeout(() => {
            const params = new URLSearchParams(searchParams);
            if (localLocId) params.set('loc_id', localLocId); else params.delete('loc_id');
            setSearchParams(params, { replace: true });
        }, 300);
        return () => clearTimeout(h);
    }, [localLocId]);

    const updateParam = (key: string, value: string, defaultValue: string = '') => {
        const params = new URLSearchParams(searchParams);
        if (!value || value === defaultValue) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        setSearchParams(params, { replace: true });
    };

    useEffect(() => {
        const fetchItems = async () => {
            try {
                // Fetch collections to determine privacy status
                const collectionsSnapshot = await getDocs(collection(db, 'collections'));
                const privacyMap: Record<string, boolean> = {};
                collectionsSnapshot.docs.forEach(doc => {
                    const data = doc.data() as Collection;
                    if (data.is_private) {
                        privacyMap[doc.id] = true;
                    }
                });
                setCollectionPrivacyMap(privacyMap);

                const q = query(collection(db, 'archive_items'), orderBy('created_at', 'desc'));
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                setItems(itemsData);
            } catch (error) {
                console.error("Error fetching items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [isSAHSUser]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            // Keyword match across multiple fields
            const kw = localKeyword.toLowerCase();
            const matchesKeyword = !localKeyword ||
                item.title?.toLowerCase().includes(kw) ||
                item.description?.toLowerCase().includes(kw) ||
                item.subject?.toLowerCase().includes(kw) ||
                item.artifact_id?.toString().toLowerCase().includes(kw) ||
                item.id?.toLowerCase().includes(kw) ||
                item.identifier?.toLowerCase().includes(kw) ||
                item.transcription?.toLowerCase().includes(kw) ||
                item.creator?.toLowerCase().includes(kw) ||
                item.full_name?.toLowerCase().includes(kw) ||
                item.also_known_as?.toLowerCase().includes(kw) ||
                item.birthplace?.toLowerCase().includes(kw) ||
                item.occupation?.toLowerCase().includes(kw) ||
                item.org_name?.toLowerCase().includes(kw) ||
                item.alternative_names?.toLowerCase().includes(kw) ||
                item.founding_date?.toLowerCase().includes(kw) ||
                item.dissolved_date?.toLowerCase().includes(kw);

            // Type match
            const matchesType = selectedType === 'All Items' || item.item_type === selectedType;

            // Year / Date match (simple substring search on the date field)
            const matchesYear = !localYear || (item.date && item.date.toLowerCase().includes(localYear.toLowerCase()));

            // Place / Coverage match
            const matchesPlace = !localPlace || (item.coverage && item.coverage.toLowerCase().includes(localPlace.toLowerCase()));

            // Tag match (partial match)
            const matchesTag = !localTag || (item.tags && item.tags.some(t => t.toLowerCase().includes(localTag.toLowerCase())));

            // Artifact ID match (exact match)
            const matchesArtifactId = !localArtifactId || (item.artifact_id && item.artifact_id.toLowerCase() === localArtifactId.toLowerCase());
            
            // Location ID match (exact match)
            const matchesLocId = !localLocId || 
                item.museum_location_id === localLocId || 
                (item.museum_location_ids && item.museum_location_ids.includes(localLocId));

            if (!isSAHSUser) {
                const isItemPrivate = item.is_private === true;
                const isCollectionPrivate = item.collection_id ? collectionPrivacyMap[item.collection_id] === true : false;
                if (isItemPrivate || isCollectionPrivate) return false;
            }

            return matchesKeyword && matchesType && matchesYear && matchesPlace && matchesTag && matchesArtifactId && matchesLocId;
        }).sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            }

            if (sortBy === 'id_asc') {
                const idA = parseInt(a.artifact_id || '0', 10);
                const idB = parseInt(b.artifact_id || '0', 10);
                if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
                return (a.artifact_id || '').localeCompare(b.artifact_id || '');
            }

            if (sortBy === 'id_desc') {
                const idA = parseInt(a.artifact_id || '0', 10);
                const idB = parseInt(b.artifact_id || '0', 10);
                if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
                return (b.artifact_id || '').localeCompare(a.artifact_id || '');
            }

            if (sortBy === 'az') {
                return a.title.localeCompare(b.title);
            }

            if (sortBy === 'za') {
                return b.title.localeCompare(a.title);
            }

            return 0;
        });
    }, [items, localKeyword, localYear, localPlace, localTag, localArtifactId, selectedType, sortBy, isSAHSUser, collectionPrivacyMap]);

    const resetFilters = () => {
        setLocalKeyword('');
        setLocalYear('');
        setLocalPlace('');
        setLocalTag('');
        setLocalArtifactId('');
        setSearchParams(new URLSearchParams(), { replace: true });
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading search engine...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-6 md:mb-10">
                <h1 className="text-3xl md:text-5xl font-serif font-bold mb-3 md:mb-4 text-charcoal tracking-tight flex items-center gap-3 md:gap-4">
                    <SlidersHorizontal className="text-tan" size={32} />
                    Advanced Search
                </h1>
                <p className="text-charcoal-light text-base md:text-xl max-w-3xl leading-relaxed">
                    Query the entire database of documents, figures, and organizations using specific criteria.
                </p>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    // Filters are already reactive via state, but this enables 'Enter' key support
                }}
                className="bg-white p-6 md:p-8 rounded-2xl border border-tan-light shadow-sm mb-10"
            >
                    <div className="col-span-full border-b border-tan-light/30 pb-8 mb-2">
                        <label className="block text-xl font-serif font-black text-charcoal/80 uppercase tracking-widest mb-4">Keyword Search</label>
                        <div className="relative">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-tan" size={24} />
                            <input
                                type="text"
                                placeholder="Search by name, object, or historical event..."
                                className="w-full bg-cream/50 pl-16 pr-8 py-6 rounded-2xl border-2 border-tan-light/20 focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal text-xl shadow-lg placeholder:text-charcoal/30 placeholder:italic"
                                value={localKeyword}
                                onChange={(e) => setLocalKeyword(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Secondary Filters Section */}
                    <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Item Type */}
                        <div>
                            <label className="block text-xs font-bold text-charcoal/40 uppercase tracking-[0.2em] mb-3">Item Type</label>
                            <div className="relative group">
                                <Filter className="absolute left-5 top-1/2 -translate-y-1/2 text-tan transition-colors group-focus-within:text-charcoal" size={24} />
                                <select
                                    className="w-full bg-cream pl-14 pr-10 py-6 rounded-2xl border-2 border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan transition-all font-sans text-charcoal text-xl shadow-sm"
                                    value={selectedType}
                                    onChange={(e) => updateParam('type', e.target.value, 'All Items')}
                                >
                                    <option value="All Items">All Categories</option>
                                    <option value="Artifact">Artifact</option>
                                    <option value="Document">Document</option>
                                    <option value="Historic Figure">Historic Figure</option>
                                    <option value="Historic Organization">Historic Organization</option>
                                </select>
                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-charcoal/30 pointer-events-none" size={20} />
                            </div>
                        </div>


                    {/* Filter: Date/Year */}
                    <div>
                        <label className="block text-[10px] md:text-xs font-bold text-charcoal/50 uppercase tracking-[0.2em] mb-2">Year / Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={24} />
                            <input
                                type="text"
                                placeholder="e.g. 1920, 1850-1900..."
                                className="w-full bg-cream pl-14 pr-4 py-6 rounded-xl border-2 border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-xl shadow-sm"
                                value={localYear}
                                onChange={(e) => setLocalYear(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filter: Place */}
                    <div>
                        <label className="block text-[10px] md:text-xs font-bold text-charcoal/50 uppercase tracking-[0.2em] mb-2">Place / Location</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={24} />
                            <input
                                type="text"
                                placeholder="e.g. Main Street, Newnan..."
                                className="w-full bg-cream pl-14 pr-4 py-6 rounded-xl border-2 border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-xl shadow-sm"
                                value={localPlace}
                                onChange={(e) => setLocalPlace(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-[10px] md:text-xs font-bold text-charcoal/50 uppercase tracking-[0.2em] mb-2">Subject Tag</label>
                        <div className="relative">
                            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={24} />
                            <input
                                type="text"
                                placeholder="Search by tag..."
                                className="w-full bg-cream pl-14 pr-4 py-6 rounded-xl border-2 border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-xl shadow-sm"
                                value={localTag}
                                onChange={(e) => setLocalTag(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filter: Sort By */}
                    <div>
                        <label className="block text-[10px] md:text-xs font-bold text-charcoal/50 uppercase tracking-[0.2em] mb-2">Sort By</label>
                        <div className="relative">
                            <SlidersHorizontal className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={24} />
                            <select
                                className="w-full bg-cream pl-12 pr-10 py-6 rounded-xl border-2 border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal text-xl shadow-sm"
                                value={sortBy}
                                onChange={(e) => updateParam('sort', e.target.value, 'newest')}
                            >
                                <option value="newest">Newest First</option>
                                <option value="az">A-Z (Title)</option>
                                <option value="za">Z-A (Title)</option>
                                <option value="id_asc">Numerical (ID # Low-High)</option>
                                <option value="id_desc">Numerical (ID # High-Low)</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDownIcon />
                            </div>
                        </div>
                    </div>

                    {/* Filter: Artifact ID */}
                    {(selectedType === 'All Items' || selectedType === 'Artifact') && (
                        <div className="md:col-span-1 border-t md:border-t-0 pt-4 md:pt-0">
                            <label className="block text-[10px] md:text-xs font-bold text-charcoal/50 uppercase tracking-[0.2em] mb-2">Artifact ID #</label>
                            <div className="relative">
                                <InfoIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/30" size={24} />
                                <input
                                    type="text"
                                    placeholder="Enter artifact ID..."
                                    className="w-full bg-cream pl-14 pr-4 py-6 rounded-xl border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-xl shadow-sm"
                                    value={localArtifactId}
                                    onChange={(e) => setLocalArtifactId(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Button Row */}
                    <div className="col-span-full pt-10 flex flex-col md:flex-row gap-6 items-center justify-between border-t border-tan-light/20 mt-8">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="text-tan hover:text-charcoal font-black text-xs uppercase tracking-[0.2em] px-8 py-3 rounded-full hover:bg-tan/5 transition-all order-2 md:order-1"
                        >
                            Reset All Filters
                        </button>
                        <button
                            type="submit"
                            className="w-full md:w-auto bg-tan text-white px-12 py-5 rounded-2xl font-black text-xl hover:bg-charcoal transition-all shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] order-1 md:order-2"
                        >
                            <Search size={22} />
                            Search Archive
                        </button>
                    </div>
            </form>

            <div className="flex-1">
                <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-charcoal">Search Results</h2>
                        {localLocId && (
                            <div className="flex items-center gap-2 mt-2 bg-tan/10 border border-tan/20 px-3 py-1.5 rounded-full w-fit">
                                <MapPin size={14} className="text-tan" />
                                <span className="text-xs font-bold text-tan uppercase tracking-wider">Location: {localLocId}</span>
                                <button 
                                    onClick={() => setLocalLocId('')}
                                    className="ml-1 hover:text-charcoal text-tan/60 transition-colors"
                                    title="Clear location filter"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="text-charcoal-light font-medium">{filteredItems.length} {filteredItems.length === 1 ? 'result' : 'results'} found</p>
                </div>

                {filteredItems.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {filteredItems.map(item => (
                            <DocumentCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-24 bg-white rounded-xl border border-tan-light/50 shadow-sm">
                        <p className="text-charcoal-light text-xl font-serif italic mb-2">No matching items found.</p>
                        <p className="text-charcoal-light/70 font-sans">Try broadening your search criteria.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChevronDownIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal-light">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    );
}

function InfoIcon({ className, size = 18 }: { className?: string, size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
    );
}
