import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Box, MapPin } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { DocumentCard } from '../components/DocumentCard';
import type { MuseumLocation, ArchiveItem } from '../types/database';

export function LocationDetail() {
    const { id } = useParams();
    const [locationData, setLocationData] = useState<MuseumLocation | null>(null);
    const [items, setItems] = useState<ArchiveItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLocationAndItems = async () => {
            if (!id) return;
            try {
                // Fetch location details
                const docRef = doc(db, 'locations', id);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setLocationData({ id: docSnap.id, ...docSnap.data() } as MuseumLocation);
                } else {
                    // It's possible the route was hit with the custom "id" string rather than document ID
                    // Let's query for it just in case
                    const locQuery = query(collection(db, 'locations'), where('id', '==', id));
                    const locSnap = await getDocs(locQuery);
                    if (!locSnap.empty) {
                        setLocationData({ id: locSnap.docs[0].id, ...locSnap.docs[0].data() } as MuseumLocation);
                    } else {
                        console.error("No such location!");
                    }
                }

                // Fetch items at this location
                const q = query(
                    collection(db, 'archive_items'), 
                    // Depending on how tagging was implemented, it saves string `id` or document `id` 
                    // `selectedLocation.id` was used in TaggingHub, so let's check for that.
                    where('museum_location_id', '==', id)
                );
                
                const querySnapshot = await getDocs(q);
                let itemsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArchiveItem[];
                
                // Sort client-side to avoid needing a Firestore composite index
                itemsData.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
                
                setItems(itemsData);
            } catch (error) {
                console.error("Error fetching location details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLocationAndItems();
    }, [id]);

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
        <div className="max-w-full mx-auto h-full flex flex-col animate-in fade-in duration-500 pb-16">
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

            <h2 className="text-2xl font-serif font-bold text-charcoal tracking-tight mb-6 flex items-center gap-3">
                Items Housed Here
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
                        <Box size={48} className="mx-auto text-tan/30 mb-4" />
                        <p className="text-charcoal-light text-xl font-serif mb-2 text-charcoal/70">Shelf is empty.</p>
                        <p className="text-charcoal-light/60 font-sans max-w-md mx-auto">There are currently no artifacts registered to this physical location.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
