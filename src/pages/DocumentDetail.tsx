import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Tag, Download, Maximize } from 'lucide-react';
import { mockDocuments } from '../lib/mockData';
import { useState } from 'react';

export function DocumentDetail() {
    const { id } = useParams();
    const doc = mockDocuments.find(d => d.id === id);
    const [isFullscreen, setIsFullscreen] = useState(false);

    if (!doc) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl font-serif text-charcoal">Document Not Found</h2>
                <Link to="/documents" className="mt-4 text-tan hover:underline">Return to Archive</Link>
            </div>
        );
    }

    const imageUrl = doc.image_urls[0];

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto animate-in fade-in duration-500">
            <div className="mb-6 flex items-center justify-between">
                <Link to="/documents" className="flex items-center gap-2 text-charcoal/60 hover:text-charcoal transition-colors font-medium">
                    <ArrowLeft size={18} />
                    Back to Archive
                </Link>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-tan-light/50 rounded-lg text-sm font-medium text-charcoal hover:bg-tan-light/20 transition-colors shadow-sm">
                        <Download size={16} /> Download Copy
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-[600px]">
                {/* Document Viewer Area */}
                <div className={`flex-1 bg-[#F5EFE6]/50 rounded-2xl border border-tan-light/50 overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-4 z-50 bg-white shadow-2xl' : 'relative'}`}>
                    <div className="bg-white border-b border-tan-light/50 p-3 flex justify-between items-center z-10">
                        <span className="text-sm font-medium text-charcoal/70 px-2">Page 1 of {doc.image_urls.length}</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsFullscreen(!isFullscreen)}
                                className="p-2 hover:bg-tan-light/30 rounded-lg text-charcoal/60 hover:text-charcoal transition-colors"
                                title="Toggle Fullscreen"
                            >
                                <Maximize size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 relative bg-charcoal/5 flex items-center justify-center overflow-auto p-4 cursor-zoom-in">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt={doc.title}
                                className="max-w-full max-h-full object-contain shadow-md"
                            />
                        ) : (
                            <p className="text-charcoal/50 font-serif">No scan available</p>
                        )}
                    </div>
                </div>

                {/* Metadata Sidebar */}
                <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-6">
                    <div>
                        <div className="inline-block bg-tan-light text-charcoal px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                            {doc.category}
                        </div>
                        <h1 className="text-4xl font-serif font-bold text-charcoal leading-tight mb-4 tracking-tight">
                            {doc.title}
                        </h1>
                        <p className="text-charcoal/80 leading-relaxed font-sans text-lg">
                            {doc.description}
                        </p>
                    </div>

                    <div className="bg-white rounded-xl border border-tan-light/50 p-6 flex flex-col gap-5 shadow-sm">
                        <h3 className="text-xs font-bold text-charcoal/40 uppercase tracking-widest border-b border-tan-light/50 pb-2">Document Details</h3>

                        <div className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-tan-light/30 flex items-center justify-center text-tan mt-0.5 shrink-0">
                                <Calendar size={16} />
                            </div>
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Date</p>
                                <p className="font-medium text-charcoal">{doc.date_approx}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-tan-light/30 flex items-center justify-center text-tan mt-0.5 shrink-0">
                                <MapPin size={16} />
                            </div>
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-0.5">Location</p>
                                <p className="font-medium text-charcoal">{doc.location || 'Senoia, GA'}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="w-8 h-8 rounded-full bg-tan-light/30 flex items-center justify-center text-tan mt-0.5 shrink-0">
                                <Tag size={16} />
                            </div>
                            <div>
                                <p className="text-xs text-charcoal/50 font-bold uppercase tracking-wider mb-1">Tags / Keywords</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="bg-cream border border-tan-light/50 px-2.5 py-1 rounded-md text-xs font-medium text-charcoal/70 hover:border-tan transition-colors cursor-pointer">Senoia</span>
                                    <span className="bg-cream border border-tan-light/50 px-2.5 py-1 rounded-md text-xs font-medium text-charcoal/70 hover:border-tan transition-colors cursor-pointer">History</span>
                                    <span className="bg-cream border border-tan-light/50 px-2.5 py-1 rounded-md text-xs font-medium text-charcoal/70 hover:border-tan transition-colors cursor-pointer">Archives</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-tan-light/50 flex justify-between text-xs font-mono text-charcoal/40">
                            <span>REF: {doc.archive_reference || `SAHS-DOC-${doc.id}`}</span>
                            <span>COND: {doc.condition || 'Fair'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
