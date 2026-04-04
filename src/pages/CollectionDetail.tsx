import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, FolderOpen, Image as ImageIcon, Lock, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { DocumentCard } from '../components/DocumentCard';
import { CollectionGridImage } from '../components/CollectionGridImage';
import type { Collection, ArchiveItem } from '../types/database';

export function CollectionDetail() {
    const { id } = useParams();
    const [collectionData, setCollectionData] = useState<Collection | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { isSAHSUser } = useAuth();

    useEffect(() => {
        const fetchCollectionAndItems = async () => {
            if (!id) return;
            try {
                // Fetch collection details
                const docRef = doc(db, 'collections', id);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setCollectionData({ id: docSnap.id, ...docSnap.data() } as Collection);
                } else {
                    console.error("No such collection!");
                }

                // Fetch items in this collection
                const q = query(
                    collection(db, 'archive_items'), 
                    where('collection_id', '==', id)
                );
                
                const querySnapshot = await getDocs(q);
                const itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                
                // Sort client-side to avoid needing a Firestore composite index
                itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                
                // Filter private items for non-SAHS users
                if (!isSAHSUser) {
                    setItems(itemsData.filter(i => !i.is_private));
                } else {
                    setItems(itemsData);
                }
            } catch (error) {
                console.error("Error fetching collection details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCollectionAndItems();
    }, [id]);

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading collection...</div>;
    }

    if (!collectionData || (collectionData.is_private && !isSAHSUser)) {
        return (
            <div className="max-w-6xl mx-auto py-12 text-center">
                <h2 className="text-2xl font-serif text-charcoal mb-4">
                    {!collectionData ? "Collection not found" : "Unauthorized: This collection is private"}
                </h2>
                <Link to="/collections" className="text-tan hover:text-charcoal transition-colors">
                    &larr; Back to Collections
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500">
            <Link to="/collections" className="inline-flex items-center text-sm font-bold text-tan uppercase tracking-wider mb-6 hover:text-charcoal transition-colors">
                <ChevronLeft size={16} className="mr-1" /> Back to Collections
            </Link>

            <div className="bg-white rounded-2xl border border-tan-light/50 overflow-hidden mb-10 shadow-sm flex flex-col md:flex-row">
                <div className="md:w-1/3 bg-tan-light/20 relative min-h-[250px] md:min-h-full flex-shrink-0">
                    <CollectionGridImage 
                        collectionId={collectionData.id}
                        fallbackImage={collectionData.featured_image_url || collectionData.file_urls?.[0]}
                        items={items}
                    />
                </div>
                
                <div className="p-8 md:p-10 flex-1 flex flex-col justify-center">
                    <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-charcoal tracking-tight">
                        {collectionData.title}
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-3xl leading-relaxed whitespace-pre-wrap">
                        {collectionData.description || "No description provided."}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-4 text-sm font-bold text-charcoal/50 uppercase tracking-wider">
                            <span className="flex items-center gap-2"><ImageIcon size={16} /> {items.length} Items</span>
                        </div>
                        {collectionData.is_private && isSAHSUser && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                <Lock size={12} /> Private Collection
                            </div>
                        )}
                        {!collectionData.is_private && isSAHSUser && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 border border-green-100 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                <Users size={12} /> Public Collection
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <h2 className="text-2xl font-serif font-bold text-charcoal tracking-tight mb-6 flex items-center gap-3">
                Items in this Collection
                <span className="bg-tan/10 text-tan text-sm py-1 px-3 rounded-full font-sans">{items.length}</span>
            </h2>

            <div className="flex-1">
                {items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {items.map(item => (
                            <DocumentCard key={item.id} item={item} galleryIds={items.map(i => i.id || '')} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-cream/30 rounded-xl border border-tan-light/50 shadow-sm">
                        <FolderOpen size={48} className="mx-auto text-tan/30 mb-4" />
                        <p className="text-charcoal-light text-xl font-serif mb-2 text-charcoal/70">No items available.</p>
                        <p className="text-charcoal-light/60 font-sans max-w-md mx-auto">There are currently no items added to this collection.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
