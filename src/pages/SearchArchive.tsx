import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Calendar, MapPin, Tag, SlidersHorizontal } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { ArchiveItem, ItemType } from '../types/database';

export function SearchArchive() {
    const [searchParams, setSearchParams] = useSearchParams();

    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);

    const keyword = searchParams.get('q') || '';
    const selectedType = (searchParams.get('type') as ItemType | null) || 'All Items';
    const searchYear = searchParams.get('year') || '';
    const searchPlace = searchParams.get('place') || '';
    const searchTag = searchParams.get('tag') || '';
    const searchArtifactId = searchParams.get('id') || '';
    const sortBy = (searchParams.get('sort') as any) || 'newest';

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
    }, []);

    const filteredItems = items.filter(item => {
        // Keyword match across multiple fields
        const kw = keyword.toLowerCase();
        const matchesKeyword = !keyword ||
            item.title?.toLowerCase().includes(kw) ||
            item.description?.toLowerCase().includes(kw) ||
            item.subject?.toLowerCase().includes(kw) ||
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
        const matchesYear = !searchYear || (item.date && item.date.toLowerCase().includes(searchYear.toLowerCase()));

        // Place / Coverage match
        const matchesPlace = !searchPlace || (item.coverage && item.coverage.toLowerCase().includes(searchPlace.toLowerCase()));

        // Tag match (partial match)
        const matchesTag = !searchTag || (item.tags && item.tags.some(t => t.toLowerCase().includes(searchTag.toLowerCase())));

        // Artifact ID match (exact match)
        const matchesArtifactId = !searchArtifactId || (item.artifact_id && item.artifact_id.toLowerCase() === searchArtifactId.toLowerCase());

        return matchesKeyword && matchesType && matchesYear && matchesPlace && matchesTag && matchesArtifactId;
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

    const resetFilters = () => {
        setSearchParams(new URLSearchParams(), { replace: true });
    };

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading search engine...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col pb-12">
            <div className="mb-10">
                <h1 className="text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight flex items-center gap-4">
                    <SlidersHorizontal className="text-tan" size={40} />
                    Advanced Search
                </h1>
                <p className="text-charcoal-light text-xl">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Keyword Search */}
                    <div className="lg:col-span-3 pb-6 border-b border-tan-light/50">
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Keyword Search</label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                                <input
                                    type="text"
                                    placeholder="Search by title, description, transcriptions, or creator..."
                                    className="w-full bg-cream pl-12 pr-4 py-4 rounded-xl border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal text-lg shadow-inner"
                                    value={keyword}
                                    onChange={(e) => updateParam('q', e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className="bg-tan text-white px-8 py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md hidden md:block"
                            >
                                Search
                            </button>
                        </div>
                    </div>

                    {/* Filter: Item Type */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Item Type</label>
                        <div className="relative">
                            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <select
                                className="w-full bg-cream pl-11 pr-10 py-3 rounded-lg border border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal"
                                value={selectedType}
                                onChange={(e) => updateParam('type', e.target.value, 'All Items')}
                            >
                                <option value="All Items">All Types</option>
                                <option value="Document">Documents</option>
                                <option value="Historic Figure">Historic Figures</option>
                                <option value="Historic Organization">Historic Organizations</option>
                                <option value="Artifact">Artifacts</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDownIcon />
                            </div>
                        </div>
                    </div>

                    {/* Filter: Date/Year */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Year / Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. 1920, 1850-1900..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchYear}
                                onChange={(e) => updateParam('year', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filter: Place */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Place / Location</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="e.g. Main Street, Newnan..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchPlace}
                                onChange={(e) => updateParam('place', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Subject Tag</label>
                        <div className="relative">
                            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <input
                                type="text"
                                placeholder="Search by tag..."
                                className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                value={searchTag}
                                onChange={(e) => updateParam('tag', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Filter: Sort By */}
                    <div>
                        <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Sort By</label>
                        <div className="relative">
                            <SlidersHorizontal className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                            <select
                                className="w-full bg-cream pl-11 pr-10 py-3 rounded-lg border border-transparent outline-none appearance-none cursor-pointer focus:bg-white focus:border-tan-light transition-all font-sans text-charcoal"
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
                            <label className="block text-sm font-bold text-charcoal/70 uppercase tracking-wider mb-2">Artifact ID #</label>
                            <div className="relative">
                                <InfoIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" />
                                <input
                                    type="text"
                                    placeholder="Enter artifact ID number..."
                                    className="w-full bg-cream pl-11 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan-light outline-none transition-all font-sans text-charcoal"
                                    value={searchArtifactId}
                                    onChange={(e) => updateParam('id', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Reset Button */}
                    <div className="md:col-span-2 lg:col-span-3 flex justify-between items-center mt-2">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="text-sm font-bold text-charcoal hover:text-tan underline underline-offset-4 transition-colors p-2"
                        >
                            Reset Filters
                        </button>
                        <button
                            type="submit"
                            className="bg-tan text-white px-8 py-3 rounded-lg font-bold hover:bg-charcoal transition-all md:hidden"
                        >
                            Search
                        </button>
                    </div>
                </div>
            </form>

            <div className="flex-1">
                <div className="mb-6 flex justify-between items-end">
                    <h2 className="text-2xl font-serif font-bold text-charcoal">Search Results</h2>
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

function InfoIcon({ className }: { className?: string }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
    );
}
