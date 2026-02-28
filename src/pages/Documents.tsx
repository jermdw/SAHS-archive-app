import { useState, useEffect } from 'react';
import { Search, Filter } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { DocumentRecord } from '../types/database';

export function Documents() {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All Categories');
    const [documents, setDocuments] = useState<DocumentRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDocuments = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'documents'));
                const docsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as DocumentRecord[];
                setDocuments(docsData);
            } catch (error) {
                console.error("Error fetching documents: ", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDocuments();
    }, []);

    // Simple client-side filtering
    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase()) ||
            doc.description.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === 'All Categories' || doc.category === category;
        return matchesSearch && matchesCategory;
    });

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading documents...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight">Document Archive</h1>
                <p className="text-charcoal/70 text-lg">Browse and search through our collection of historical documents</p>
            </div>

            <div className="bg-white p-2 rounded-xl border border-tan-light/50 flex flex-col md:flex-row gap-2 shadow-sm mb-8">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                    <input
                        type="text"
                        placeholder="Search documents by title, description, or tags..."
                        className="w-full bg-cream/50 pl-12 pr-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="w-px bg-tan-light/50 hidden md:block" />
                <div className="relative min-w-[200px]">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                    <select
                        className="w-full bg-cream/50 pl-10 pr-10 py-3 rounded-lg outline-none appearance-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-medium text-charcoal font-sans"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        <option>All Categories</option>
                        <option>Letter</option>
                        <option>Legal Document</option>
                        <option>Photograph</option>
                        <option>Newspaper</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal/60"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
            </div>

            <div className="flex-1">
                {filteredDocs.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {filteredDocs.map(doc => (
                            <DocumentCard key={doc.id} doc={doc} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <p className="text-charcoal/50 text-lg font-serif italic">No documents found matching your search.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
