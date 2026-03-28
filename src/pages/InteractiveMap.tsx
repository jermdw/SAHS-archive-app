import { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { Save, Plus, MapPin, ZoomIn, ZoomOut, Maximize, Edit3, X, Pointer, BoxSelect, Maximize2, RotateCw, ChevronsUp, ChevronsDown } from 'lucide-react';
import type { MuseumLocation } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

interface StructuralRoom {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    z_index?: number;
}

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const PIXELS_PER_FOOT = 24; // 1 foot = 24 pixels (1 inch = 2 pixels)

export function InteractiveMap() {
    const { isAdmin } = useAuth();
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [scale, setScale] = useState(0.4);
    const [isSaving, setIsSaving] = useState(false);
    
    // Track changes locally before saving
    const [localCoords, setLocalCoords] = useState<Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number}>>({});

    // For binding unmapped locations
    const [selectedLocationForBinding, setSelectedLocationForBinding] = useState<string>('');
    const [isBindingMode, setIsBindingMode] = useState(false);

    // Structural Rooms
    const [rooms, setRooms] = useState<StructuralRoom[]>([]);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MuseumLocation[];
            
            setLocations(data);
            
            // Initialize local coordinates state from database
            const coords: Record<string, any> = {};
            data.forEach(loc => {
                if (loc.map_coordinates) {
                    coords[loc.id] = loc.map_coordinates;
                }
            });
            setLocalCoords(coords);

            // Fetch rooms
            const roomsDoc = await getDoc(doc(db, 'settings', 'interactive_map'));
            if (roomsDoc.exists()) {
                setRooms(roomsDoc.data().rooms || []);
            }
        } catch (error) {
            console.error("Error fetching map data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            // Firestore throws errors if objects contain `undefined`. We must strip them.
            const stripUndefined = (obj: any) => JSON.parse(JSON.stringify(obj));

            // Save Locations
            const promises = Object.entries(localCoords).map(([id, coords]) => {
                const docRef = doc(db, 'locations', id); 
                return updateDoc(docRef, { map_coordinates: stripUndefined(coords) });
            });
            
            // If any locations were completely removed from the map during edit, 
            // we should technically nullify them, but to be safe and simple:
            locations.forEach(loc => {
                if (loc.map_coordinates && !localCoords[loc.id]) {
                    promises.push(updateDoc(doc(db, 'locations', loc.id), { map_coordinates: null }));
                }
            });

            await Promise.all(promises);

            // Save Rooms
            await setDoc(doc(db, 'settings', 'interactive_map'), { rooms: stripUndefined(rooms) }, { merge: true });

            setIsEditMode(false);
            alert("Layout saved successfully!");
        } catch (error) {
            console.error("Error saving layout:", error);
            alert("Error saving layout. Check console for details.");
        } finally {
            setIsSaving(false);
        }
    };

    const addBlock = () => {
        if (!selectedLocationForBinding) {
            alert("Please select a location from the dropdown first to add it to the map.");
            return;
        }
        
        if (localCoords[selectedLocationForBinding]) {
            alert("This location is already on the map!");
            return;
        }

        // Add a default 100x100 block in the center
        setLocalCoords(prev => ({
            ...prev,
            [selectedLocationForBinding]: {
                x: CANVAS_WIDTH / 2 - 50,
                y: CANVAS_HEIGHT / 2 - 50,
                width: 150,
                height: 100
            }
        }));
        setSelectedLocationForBinding('');
        setIsBindingMode(false);
    };

    const removeBlock = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Remove this location from the map? (This doesn't delete the location from the database, just the floorplan)")) {
            setLocalCoords(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    const addRoom = () => {
        const roomName = window.prompt("Enter a name for the structural room (e.g. Gallery A, Hallway):");
        if (!roomName) return;

        const newRoom: StructuralRoom = {
            id: 'room_' + Date.now(),
            name: roomName,
            x: CANVAS_WIDTH / 2 - 150,
            y: CANVAS_HEIGHT / 2 - 150,
            width: Math.round(15 * PIXELS_PER_FOOT), // default 15ft
            height: Math.round(15 * PIXELS_PER_FOOT)
        };

        setRooms(prev => [...prev, newRoom]);
    };

    const removeRoom = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Delete this room structure?")) {
            setRooms(prev => prev.filter(r => r.id !== id));
        }
    };

    const editBlockSize = (id: string, type: 'room' | 'location', currentWidth: number, currentHeight: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const currentWFeet = (currentWidth / PIXELS_PER_FOOT).toFixed(1);
        const currentHFeet = (currentHeight / PIXELS_PER_FOOT).toFixed(1);

        const input = window.prompt(`SET DIMENSIONS\n\nEnter dimensions in feet (Width x Height)\nExample: 12.5 x 10`, `${currentWFeet} x ${currentHFeet}`);
        
        if (!input) return;

        const parts = input.toLowerCase().split('x').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const newW = Math.max(20, Math.round(parts[0] * PIXELS_PER_FOOT));
            const newH = Math.max(20, Math.round(parts[1] * PIXELS_PER_FOOT));

            if (type === 'room') {
                setRooms(prev => prev.map(r => r.id === id ? { ...r, width: newW, height: newH } : r));
            } else {
                setLocalCoords(prev => ({
                    ...prev,
                    [id]: { ...prev[id], width: newW, height: newH }
                }));
            }
        } else {
            alert("Invalid format. Please use 'Width x Height' with numbers (e.g., 10 x 15)");
        }
    };

    // Calculate which locations are NOT yet on the map
    const unmappedLocations = locations.filter(loc => !localCoords[loc.id]);

    const bringToFront = (id: string, type: 'room' | 'location', e: React.MouseEvent) => {
        e.stopPropagation();
        let maxZ = 15; // default location baseline is 10
        rooms.forEach(r => { maxZ = Math.max(maxZ, r.z_index || 5) });
        Object.values(localCoords).forEach(c => { maxZ = Math.max(maxZ, c.z_index || 10) });

        if (type === 'room') {
            setRooms(prev => prev.map(r => r.id === id ? { ...r, z_index: maxZ + 1 } : r));
        } else {
            setLocalCoords(prev => ({
                ...prev,
                [id]: { ...prev[id], z_index: maxZ + 1 }
            }));
        }
    };

    const sendToBack = (id: string, type: 'room' | 'location', e: React.MouseEvent) => {
        e.stopPropagation();
        let minZ = 5; // default room baseline is 5
        rooms.forEach(r => { minZ = Math.min(minZ, r.z_index || 5) });
        Object.values(localCoords).forEach(c => { minZ = Math.min(minZ, c.z_index || 10) });

        if (type === 'room') {
            setRooms(prev => prev.map(r => r.id === id ? { ...r, z_index: minZ - 1 } : r));
        } else {
            setLocalCoords(prev => ({
                ...prev,
                [id]: { ...prev[id], z_index: minZ - 1 }
            }));
        }
    };

    const rotateItem = (id: string, type: 'room' | 'location', currentRotation: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const res = window.prompt("Enter new angle in degrees (e.g. 90, 45, -90):", (currentRotation || 0).toString());
        if (!res) return;
        const deg = parseInt(res, 10);
        if (!isNaN(deg)) {
            if (type === 'room') {
                setRooms(prev => prev.map(r => r.id === id ? { ...r, rotation: deg } : r));
            } else {
                setLocalCoords(prev => ({
                    ...prev,
                    [id]: { ...prev[id], rotation: deg }
                }));
            }
        }
    };

    return (
        <div className="relative flex flex-col h-full animate-in fade-in duration-500 overflow-hidden bg-cream">
            {/* Header controls */}
            <div className="bg-white border-b border-tan-light/50 p-4 md:px-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 z-20 shrink-0">
                <div>
                    <h1 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                        <MapPin className="text-tan" size={24} />
                        Museum Blueprint
                    </h1>
                    <p className="text-sm text-charcoal/60">Interactive digital floor plan</p>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Zoom Controls */}
                    <div className="flex items-center bg-cream rounded-lg p-1 border border-tan-light/30">
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-2 hover:bg-white rounded hover:text-tan transition-colors" title="Zoom Out">
                            <ZoomOut size={16} />
                        </button>
                        <span className="text-xs font-mono font-bold px-2 w-12 text-center text-charcoal/60">{(scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-white rounded hover:text-tan transition-colors" title="Zoom In">
                            <ZoomIn size={16} />
                        </button>
                        <div className="w-px h-6 bg-tan-light/50 mx-1"></div>
                        <button onClick={() => setScale(0.4)} className="p-2 hover:bg-white rounded hover:text-tan transition-colors" title="Reset Zoom">
                            <Maximize size={16} />
                        </button>
                    </div>

                    {/* Admin Modes */}
                    {isAdmin && (
                        <div className="flex items-center gap-3 ml-4 border-l border-tan-light/50 pl-4">
                            {isEditMode ? (
                                <>
                                    <button 
                                        onClick={handleSaveLayout}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-charcoal transition-all shadow-sm"
                                    >
                                        <Save size={16} /> {isSaving ? "Saving..." : "Save Layout"}
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if(window.confirm("Discard unsaved changes?")) {
                                                setIsEditMode(false);
                                                setIsBindingMode(false);
                                                fetchLocations(); // reset state
                                            }
                                        }}
                                        className="text-sm font-bold text-charcoal-light hover:text-charcoal underline underline-offset-4"
                                    >
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <button 
                                    onClick={() => setIsEditMode(true)}
                                    className="flex items-center gap-2 bg-white border border-tan-light shadow-sm text-charcoal px-4 py-2 rounded-lg text-sm font-bold hover:border-tan hover:text-tan transition-colors"
                                >
                                    <Edit3 size={16} /> Edit Blueprint
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Editing Tools Panel (Floating) */}
            {isEditMode && (
                <div className="absolute top-24 left-8 z-30 bg-white p-4 rounded-xl shadow-lg border border-tan w-80 max-h-[80vh] overflow-y-auto animate-in slide-in-from-left-4">
                    <h3 className="font-serif font-bold text-charcoal mb-3 flex items-center gap-2">
                        <Pointer size={16} className="text-tan" />
                        Layout Tools
                    </h3>
                    
                    {isBindingMode ? (
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest">Select Location to Place</label>
                            <select 
                                className="w-full bg-cream p-2 rounded border border-tan-light text-sm outline-none font-sans"
                                value={selectedLocationForBinding}
                                onChange={e => setSelectedLocationForBinding(e.target.value)}
                            >
                                <option value="">-- Choose unmapped location --</option>
                                {unmappedLocations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                            <div className="flex gap-2 pt-2">
                                <button 
                                    onClick={addBlock}
                                    className="flex-1 bg-tan text-white px-3 py-2 rounded text-xs font-bold hover:bg-charcoal transition-colors"
                                >
                                    Drop on Map
                                </button>
                                <button 
                                    onClick={() => setIsBindingMode(false)}
                                    className="px-3 py-2 bg-cream text-charcoal text-xs font-bold rounded hover:bg-tan-light/30 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => setIsBindingMode(true)}
                                className="w-full flex items-center justify-center gap-2 bg-tan/10 text-tan border border-tan/30 border-dashed px-4 py-3 rounded-lg text-sm font-bold hover:bg-tan hover:text-white transition-all group"
                            >
                                <Plus size={18} className="transition-transform group-hover:scale-125 group-hover:rotate-90" />
                                Add Location Block
                            </button>
                            <button 
                                onClick={addRoom}
                                className="w-full flex items-center justify-center gap-2 bg-charcoal/5 border border-charcoal/20 px-4 py-3 rounded-lg text-sm font-bold text-charcoal hover:bg-charcoal hover:text-white transition-colors group"
                            >
                                <BoxSelect size={18} className="transition-transform group-hover:scale-110" />
                                Add Structural Room
                            </button>
                        </div>
                    )}
                    
                    <p className="text-[10px] text-charcoal/50 mt-4 leading-tight italic">
                        Tip: Drag blocks to move them. Drag the edges or corners to resize them to match the physical scale of the cases or rooms.
                    </p>
                </div>
            )}

            {/* Map Canvas Workspace */}
            <div className="flex-1 overflow-auto relative bg-[#f5f5f0] shadow-inner cursor-grab active:cursor-grabbing flex items-center justify-center p-8">
                
                {/* CSS grid background generator */}
                <style>{`
                    .blueprint-grid {
                        background-size: 40px 40px;
                        background-image: 
                            linear-gradient(to right, rgba(200, 180, 160, 0.15) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(200, 180, 160, 0.15) 1px, transparent 1px);
                    }
                `}</style>

                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-charcoal/40 font-serif text-lg">
                        Processing layout...
                    </div>
                ) : (
                    <div 
                        className="relative transition-all ease-out duration-200 flex-shrink-0"
                        style={{ 
                            width: CANVAS_WIDTH * scale, 
                            height: CANVAS_HEIGHT * scale
                        }}
                    >
                        <div 
                            className="absolute top-0 left-0 blueprint-grid"
                            style={{ 
                                width: CANVAS_WIDTH, 
                                height: CANVAS_HEIGHT,
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left'
                            }}
                        >
                            {/* Canvas Border Indicator */}
                            <div className="absolute inset-0 border-2 border-tan/40 rounded-lg pointer-events-none shadow-sm bg-white/60 backdrop-blur-[2px]"></div>

                            {/* Render Rooms (Bottom Layer) */}
                        {rooms.map(room => (
                                <Rnd
                                    key={room.id}
                                    scale={scale}
                                    disableDragging={!isEditMode}
                                    enableResizing={isEditMode}
                                    bounds="parent"
                                    position={{ x: room.x, y: room.y }}
                                    size={{ width: room.width, height: room.height }}
                                    onDragStop={(_e, d) => {
                                        setRooms(prev => prev.map(r => r.id === room.id ? { ...r, x: d.x, y: d.y } : r));
                                    }}
                                    onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                        setRooms(prev => prev.map(r => r.id === room.id ? { 
                                            ...r, 
                                            x: pos.x, 
                                            y: pos.y, 
                                            width: parseInt(ref.style.width, 10), 
                                            height: parseInt(ref.style.height, 10) 
                                        } : r));
                                    }}
                                    className={`
                                        absolute flex flex-col transition-shadow group
                                        ${isEditMode ? 'cursor-move hover:shadow-lg' : 'pointer-events-none'}
                                    `}
                                style={{ zIndex: room.z_index ?? 5 }}
                            >
                                {/* Room Action Bar */}
                                    {isEditMode && (
                                        <div className="absolute top-0 right-0 p-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto flex gap-1">
                                            <button 
                                                onClick={(e) => editBlockSize(room.id, 'room', room.width, room.height, e)}
                                                className="text-white bg-tan hover:bg-charcoal transition-colors p-1.5 rounded shadow-sm"
                                                title="Set precise dimensions (ft)"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                            >
                                                <Maximize2 size={12} strokeWidth={2.5}/>
                                            </button>
                                            <button 
                                                onClick={(e) => rotateItem(room.id, 'room', room.rotation || 0, e)}
                                                className="text-white bg-tan hover:bg-charcoal transition-colors p-1.5 rounded shadow-sm"
                                                title="Rotate precise angle"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                            >
                                                <RotateCw size={12} strokeWidth={2.5}/>
                                            </button>
                                            <div className="flex bg-charcoal/30 hover:bg-charcoal/50 rounded overflow-hidden shadow-sm transition-colors">
                                                <button 
                                                    onClick={(e) => bringToFront(room.id, 'room', e)}
                                                    className="text-white hover:bg-charcoal transition-colors p-1"
                                                    title="Bring forward"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <ChevronsUp size={12} strokeWidth={2.5}/>
                                                </button>
                                                <div className="w-px bg-white/20"></div>
                                                <button 
                                                    onClick={(e) => sendToBack(room.id, 'room', e)}
                                                    className="text-white hover:bg-charcoal transition-colors p-1"
                                                    title="Send backward"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <ChevronsDown size={12} strokeWidth={2.5}/>
                                                </button>
                                            </div>
                                            <button 
                                                onClick={(e) => removeRoom(room.id, e)}
                                                className="text-white bg-red-400 hover:bg-red-500 transition-colors p-1.5 rounded shadow-sm"
                                                title="Delete Room"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                            >
                                                <X size={14} strokeWidth={3} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Inner Room Visual */}
                                <div className={`w-full h-full border-2 border-charcoal/20 bg-[#e9e6df]/40 flex flex-col transition-transform
                                    ${isEditMode ? 'hover:border-charcoal/40 group-hover:bg-[#e9e6df]/60 border-dashed rounded-lg shadow-inner' : 'rounded-lg'}
                                `}
                                style={{ transform: `rotate(${room.rotation || 0}deg)`, transformOrigin: 'center' }}
                                >
                                     <div className="flex justify-center items-center w-full h-full pointer-events-none opacity-40">
                                             <h3 className="font-serif font-bold text-charcoal uppercase tracking-[0.2em] text-center" 
                                                 style={{ fontSize: `${Math.max(12, Math.min(48, room.width / 10))}px` }}>
                                                 {room.name}
                                             </h3>
                                         </div>
                                    </div>
                                </Rnd>
                            ))}
                        
                        {/* Render all mapped locations */}
                        {locations.map(loc => {
                            const coords = localCoords[loc.id];
                            if (!coords) return null;

                            return (
                                <Rnd
                                    key={loc.id}
                                    scale={scale}
                                    disableDragging={!isEditMode}
                                    enableResizing={isEditMode}
                                    bounds="parent"
                                    position={{ x: coords.x, y: coords.y }}
                                    size={{ width: coords.width, height: coords.height }}
                                    onDragStop={(_e, d) => {
                                        setLocalCoords(prev => ({
                                            ...prev,
                                            [loc.id]: { ...prev[loc.id], x: d.x, y: d.y }
                                        }));
                                    }}
                                    onResizeStop={(_e, _direction, ref, _delta, position) => {
                                        setLocalCoords(prev => ({
                                            ...prev,
                                            [loc.id]: {
                                                x: position.x,
                                                y: position.y,
                                                width: parseInt(ref.style.width, 10),
                                                height: parseInt(ref.style.height, 10),
                                            }
                                        }));
                                    }}
                                    className={`
                                        absolute flex flex-col transition-shadow group
                                        ${isEditMode ? 'cursor-move' : 'cursor-pointer'}
                                    `}
                                    style={{
                                        zIndex: coords.z_index ?? 10
                                    }}
                                >
                                    {/* Action bar for edit mode - Floating above to prevent clipping */}
                                    {isEditMode && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                                            <div className="bg-white shadow-lg border border-tan/30 rounded-lg p-1 flex items-center gap-1 whitespace-nowrap">
                                                <span className="text-[10px] font-mono font-bold text-charcoal/60 bg-cream px-1.5 py-0.5 rounded mr-1">{loc.id}</span>
                                                <button 
                                                    onClick={(e) => editBlockSize(loc.id, 'location', coords.width, coords.height, e)}
                                                    className="text-charcoal hover:bg-cream transition-colors p-1 rounded hover:scale-105 active:scale-95 border border-tan-light/50"
                                                    title="Set precise dimensions (ft)"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                                    <Maximize2 size={12} strokeWidth={2.5} />
                                                </button>
                                                <button 
                                                    onClick={(e) => rotateItem(loc.id, 'location', coords.rotation || 0, e)}
                                                    className="text-charcoal hover:bg-cream transition-colors p-1 rounded hover:scale-105 active:scale-95 border border-tan-light/50"
                                                    title="Rotate precise angle"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                                    <RotateCw size={12} strokeWidth={2.5} />
                                                </button>
                                                <div className="flex bg-white rounded mx-0.5 overflow-hidden border border-tan-light/50">
                                                    <button 
                                                        onClick={(e) => bringToFront(loc.id, 'location', e)}
                                                        className="text-charcoal hover:bg-tan/10 transition-colors p-1"
                                                        title="Bring to front"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <ChevronsUp size={12} strokeWidth={2.5}/>
                                                    </button>
                                                    <div className="w-px bg-tan-light/50"></div>
                                                    <button 
                                                        onClick={(e) => sendToBack(loc.id, 'location', e)}
                                                        className="text-charcoal hover:bg-tan/10 transition-colors p-1"
                                                        title="Send to back"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <ChevronsDown size={12} strokeWidth={2.5}/>
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={(e) => removeBlock(loc.id, e)}
                                                    className="text-white bg-red-400 hover:bg-red-500 transition-colors p-1 rounded hover:scale-105 active:scale-95 shadow-sm"
                                                    title="Remove from map"
                                                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag conflict
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                                    <X size={12} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Inner Box Content (Clipped) */}
                                    <div className={`relative w-full h-full overflow-hidden border-2 flex flex-col transition-all rounded-[4px]
                                        ${isEditMode ? 'border-tan/60 bg-white/90 group-hover:shadow-md' : 'border-tan/40 bg-white/80 hover:bg-white hover:border-tan hover:shadow-md hover:scale-[1.01]'}
                                    `}
                                    style={{
                                        boxShadow: isEditMode ? '0 0 0 2px rgba(196, 164, 132, 0.3)' : 'none',
                                        transform: `rotate(${coords.rotation || 0}deg)`,
                                        transformOrigin: 'center'
                                    }}>
                                        <div className="flex-1 flex flex-col justify-center items-center p-2 text-center h-full">
                                            <MapPin size={Math.max(12, Math.min(32, coords.height / 3))} className="text-tan/60 mb-1 shrink-0" />
                                            <h4 className="font-serif font-bold text-charcoal w-full truncate px-1" style={{ fontSize: `${Math.max(10, Math.min(16, coords.width / 8))}px` }}>
                                                {loc.name}
                                            </h4>
                                        </div>
                                        
                                        {/* Hover overlay for View Mode */}
                                        {!isEditMode && (
                                            <div className="absolute inset-0 bg-tan/90 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                                                <p className="text-white font-serif font-bold text-center text-xs md:text-sm leading-tight mb-2 line-clamp-2">
                                                    {loc.name}
                                                </p>
                                                <Link 
                                                    to={`/locations/${loc.id}`}
                                                    className="bg-white text-tan text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-full hover:bg-charcoal hover:text-white transition-colors shadow-sm"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    View Shelf
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </Rnd>
                            );
                        })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
