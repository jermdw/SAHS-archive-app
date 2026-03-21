import { useState } from 'react';
import { APIProvider, Map as GoogleMap, AdvancedMarker, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { Link } from 'react-router-dom';
import type { ArchiveItem } from '../types/database';

interface ArchiveMapProps {
    items: ArchiveItem[];
}

export function ArchiveMap({ items }: ArchiveMapProps) {
    // Filter items that have valid coordinates
    const mapItems = items.filter(item => 
        item.coordinates && 
        typeof item.coordinates.lat === 'number' && 
        typeof item.coordinates.lng === 'number'
    );

    const senioaCenter = { lat: 33.3001, lng: -84.5544 };

    return (
        <div className="w-full h-[600px] rounded-2xl border border-tan-light overflow-hidden shadow-sm bg-cream/20">
            <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}>
                <GoogleMap
                    defaultCenter={senioaCenter}
                    defaultZoom={15}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    mapId="DEMO_MAP_ID"
                    className="w-full h-full"
                >
                    {mapItems.map((item) => (
                        <MarkerWithInfoWindow 
                            key={item.id} 
                            item={item} 
                        />
                    ))}
                </GoogleMap>
            </APIProvider>
        </div>
    );
}

function MarkerWithInfoWindow({ item }: { item: ArchiveItem }) {
    const [infoWindowShown, setInfoWindowShown] = useState(false);
    const [markerRef, marker] = useAdvancedMarkerRef();

    const handleMarkerClick = () => setInfoWindowShown(isShown => !isShown);
    const handleClose = () => setInfoWindowShown(false);

    if (!item.coordinates) return null;

    return (
        <>
            <AdvancedMarker
                ref={markerRef}
                position={{ lat: item.coordinates.lat, lng: item.coordinates.lng }}
                onClick={handleMarkerClick}
                title={item.title || item.org_name || 'Archive Item'}
            />
            {infoWindowShown && (
                <InfoWindow anchor={marker} onCloseClick={handleClose}>
                    <div className="p-2 max-w-[240px]">
                        {item.featured_image_url && (
                            <img 
                                src={item.featured_image_url} 
                                alt={item.title} 
                                className="w-full h-32 object-cover rounded-lg mb-2 border border-tan-light/50"
                            />
                        )}
                        <h4 className="font-serif font-bold text-charcoal mb-1 line-clamp-1">{item.title || item.org_name}</h4>
                        <p className="text-xs text-charcoal/60 mb-3 line-clamp-2">{item.description}</p>
                        <Link 
                            to={`/item/${item.id}`}
                            className="inline-block w-full py-1.5 bg-tan text-white text-center text-xs font-bold rounded hover:bg-charcoal transition-colors"
                        >
                            View Details
                        </Link>
                    </div>
                </InfoWindow>
            )}
        </>
    );
}
