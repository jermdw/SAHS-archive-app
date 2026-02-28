import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { HistoricFigure } from '../types/database';

export function HistoricFigures() {
    const [search, setSearch] = useState('');
    const [figures, setFigures] = useState<HistoricFigure[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFigures = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'historic_figures'));
                const figuresData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as HistoricFigure[];
                setFigures(figuresData);
            } catch (error) {
                console.error("Error fetching figures: ", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFigures();
    }, []);

    const filteredFigures = figures.filter(fig =>
        fig.full_name.toLowerCase().includes(search.toLowerCase()) ||
        fig.biography.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return <div className="max-w-6xl mx-auto py-12 text-center text-charcoal/60 font-serif">Loading figures...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight">Historic Figures</h1>
                <p className="text-charcoal/70 text-lg">Profiles of notable individuals, organizations, and places in Senoia's history</p>
            </div>

            <div className="bg-white p-2 rounded-xl border border-tan-light/50 flex flex-col md:flex-row gap-2 shadow-sm mb-8">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" size={20} />
                    <input
                        type="text"
                        placeholder="Search figures by name or biography..."
                        className="w-full bg-cream/50 pl-12 pr-4 py-3 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-tan/20 transition-all font-sans"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1">
                {filteredFigures.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                        {filteredFigures.map(fig => (
                            <Link
                                key={fig.id}
                                to={`/figures/${fig.id}`}
                                className="bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col group cursor-pointer"
                            >
                                <div className="aspect-square bg-tan-light/20 relative overflow-hidden">
                                    {fig.portrait_url ? (
                                        <img
                                            src={fig.portrait_url}
                                            alt={fig.full_name}
                                            className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-tan-light bg-charcoal/5">
                                            <span className="font-serif text-4xl opacity-20">{fig.full_name.charAt(0)}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-5 flex-1 flex flex-col bg-white z-10 relative">
                                    <h3 className="font-bold text-lg leading-tight mb-1 font-serif">{fig.full_name}</h3>
                                    <p className="text-xs text-tan font-bold uppercase tracking-wider mb-3">{fig.type}</p>
                                    <p className="text-sm text-charcoal/70 line-clamp-2 mb-4 font-sans leading-relaxed">{fig.biography}</p>
                                    <div className="mt-auto pt-3 border-t border-tan-light/30">
                                        <span className="text-xs text-charcoal/60 font-medium">{fig.life_dates || 'Dates Unknown'}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <p className="text-charcoal/50 text-lg font-serif italic">No figures found matching your search.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
