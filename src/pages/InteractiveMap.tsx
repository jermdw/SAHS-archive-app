import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import { Save, Plus, MapPin, ZoomIn, ZoomOut, Maximize, Edit3, X, Pointer, BoxSelect, Maximize2, RotateCw, ChevronsUp, ChevronsDown, LayoutGrid } from 'lucide-react';
import type { MuseumLocation, Room } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

type LayoutHistoryState = {
    rooms: Room[];
    localCoords: Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin'}>;
};

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const PIXELS_PER_FOOT = 24; // 1 foot = 24 pixels (1 inch = 2 pixels)

export function InteractiveMap() {
    const { isSAHSUser } = useAuth();
    const [locations, setLocations] = useState<MuseumLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [scale, setScale] = useState(0.4);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Track changes locally before saving
    const [localCoords, setLocalCoords] = useState<Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin'}>>({});

    // For binding unmapped locations
    const [selectedLocationForBinding, setSelectedLocationForBinding] = useState<string>('');
    const [isBindingMode, setIsBindingMode] = useState(false);
    
    // New Feature States
    const [isSnapping, setIsSnapping] = useState(true);
    const [displayStyle, setDisplayStyle] = useState<'box' | 'pin'>('box');
    const absoluteSnap = (val: number) => isSnapping ? Math.round(val / 12) * 12 : val;

    // Structural Rooms
    const [rooms, setRooms] = useState<Room[]>([]);
    
    // Multi-select and Drag tracking
    const selectedIdsRef = useRef<Set<string>>(new Set());
    const dragStartPosRef = useRef<Record<string, {x: number, y: number}>>({});
    const [selectionTick, setSelectionTick] = useState(0); // For triggering UI buttons reacting to ref changes

    // History and Undo tracking
    const [history, setHistory] = useState<LayoutHistoryState[]>([]);
    
    const saveSnapshot = () => {
        setHistory(prev => {
            const next = [...prev, { rooms: JSON.parse(JSON.stringify(rooms)), localCoords: JSON.parse(JSON.stringify(localCoords)) }];
            if (next.length > 30) return next.slice(next.length - 30);
            return next;
        });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isEditMode) return;
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                setHistory(prev => {
                    if (prev.length === 0) return prev;
                    const next = [...prev];
                    const lastState = next.pop();
                    if (lastState) {
                        setRooms(lastState.rooms);
                        setLocalCoords(lastState.localCoords);
                        selectedIdsRef.current.forEach(id => setSelectionDOM(id, false));
                        selectedIdsRef.current.clear();
                    }
                    return next;
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, rooms, localCoords]);

    useEffect(() => {
        fetchMapData();
    }, []);

    const handleFitToScreen = () => {
        if (!wrapperRef.current) return;
        const padding = 80;
        const availableW = wrapperRef.current.clientWidth - padding;
        const availableH = wrapperRef.current.clientHeight - padding;
        const scaleW = availableW / CANVAS_WIDTH;
        const scaleH = availableH / CANVAS_HEIGHT;
        const fitScale = Math.min(scaleW, scaleH);
        const finalScale = Math.max(0.2, Math.min(1, fitScale));
        setScale(parseFloat(finalScale.toFixed(2)));
    };

    const fetchMapData = async () => {
        setLoading(true);
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                docId: doc.id
            })) as MuseumLocation[];
            
            setLocations(data);
            
            const coords: Record<string, any> = {};
            data.forEach(loc => {
                if (loc.map_coordinates) {
                    coords[loc.id] = loc.map_coordinates;
                }
            });
            setLocalCoords(coords);

            // NEW: Fetch rooms from the collection instead of settings
            const roomSnapshot = await getDocs(collection(db, 'rooms'));
            let roomData = roomSnapshot.docs.map(doc => ({
                docId: doc.id,
                ...doc.data()
            })) as Room[];

            // Auto-Migration check: If rooms collection is empty OR any exist without coordinates, check legacy settings
            const needsMigration = roomData.length === 0 || roomData.some(r => !r.map_coordinates);
            if (needsMigration) {
                console.log("Map Diagnostics: Checking legacy settings for missing room coordinates...");
                const settingsDoc = await getDoc(doc(db, 'settings', 'interactive_map'));
                
                if (settingsDoc.exists() && settingsDoc.data().rooms) {
                    const legacyRooms = settingsDoc.data().rooms;
                    console.log(`Map Diagnostics: Found ${legacyRooms.length} legacy rooms. Syncing...`);
                    const batch = writeBatch(db);
                    let syncCount = 0;
                    
                    legacyRooms.forEach((r: any) => {
                        const existing = roomData.find(ex => ex.name === r.name);
                        
                        // Smart Coordinate Discovery
                        const coords = r.map_coordinates || r.map_coords || r.coords || r.coordinates || 
                                     (r.x !== undefined ? { x: r.x, y: r.y, width: r.width || 360, height: r.height || 360, rotation: r.rotation ?? 0 } : null);

                        if (existing) {
                            // Update existing room if it's missing coordinates
                            if (!existing.map_coordinates && coords) {
                                console.log(`Map Diagnostics: Successfully recovered coordinates for: ${r.name}`);
                                batch.update(doc(db, 'rooms', existing.docId!), { 
                                    map_coordinates: JSON.parse(JSON.stringify(coords)) 
                                });
                                existing.map_coordinates = coords;
                                syncCount++;
                            }
                        } else {
                            // Create new room if it doesn't exist
                            console.log(`Map Diagnostics: Migrating NEW room from legacy: ${r.name}`);
                            const newRoomRef = doc(collection(db, 'rooms'));
                            const roomObj = {
                                id: r.id.toString(),
                                name: r.name,
                                map_coordinates: coords || null,
                                created_at: new Date().toISOString()
                            };
                            batch.set(newRoomRef, roomObj);
                            roomData.push({ ...roomObj, docId: newRoomRef.id });
                            syncCount++;
                        }
                    });
                    
                    if (syncCount > 0) {
                        await batch.commit();
                        console.log(`Map Diagnostics: Successfully synced ${syncCount} room(s).`);
                    }
                } else {
                    console.warn("Map Diagnostics: No legacy settings found in 'settings/interactive_map'.");
                }
            }
            
            setRooms(roomData);
        } catch (error) {
            console.error("Error fetching map data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLayout = async () => {
        setIsSaving(true);
        try {
            const stripUndefined = (obj: any) => JSON.parse(JSON.stringify(obj));

            // Save Locations
            const promises = Object.entries(localCoords).map(([id, coords]) => {
                const loc = locations.find(l => l.id === id);
                if (loc?.docId) {
                    return updateDoc(doc(db, 'locations', loc.docId), { 
                        map_coordinates: stripUndefined(coords) 
                    });
                }
                return Promise.resolve();
            });
            
            // Clean unmapped locations
            locations.forEach(loc => {
                if (loc.map_coordinates && !localCoords[loc.id] && loc.docId) {
                    promises.push(updateDoc(doc(db, 'locations', loc.docId), { 
                        map_coordinates: null 
                    }));
                }
            });

            // NEW: Save Rooms individually to their docs
            const roomPromises = rooms.map(room => {
                if (room.docId) {
                    return updateDoc(doc(db, 'rooms', room.docId), {
                        name: room.name,
                        map_coordinates: room.map_coordinates ? stripUndefined(room.map_coordinates) : null
                    });
                }
                return Promise.resolve();
            });

            await Promise.all([...promises, ...roomPromises]);

            setIsEditMode(false);
            alert("Layout saved successfully!");
        } catch (error: any) {
            console.error("Error saving layout:", error);
            alert(`Error saving layout: ${error.message || error}`);
        } finally {
            setIsSaving(false);
        }
    };

    const addBlock = () => {
        if (!selectedLocationForBinding) {
            alert("Please select a location first.");
            return;
        }
        if (localCoords[selectedLocationForBinding]) {
            alert("Already on the map!");
            return;
        }

        const isPin = displayStyle === 'pin';
        const startX = Math.round((CANVAS_WIDTH / 2 - (isPin ? 24 : 50)) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - (isPin ? 24 : 50)) / 12) * 12;
        
        saveSnapshot();
        setLocalCoords(prev => ({
            ...prev,
            [selectedLocationForBinding]: {
                x: startX,
                y: startY,
                width: isPin ? 60 : 150,
                height: isPin ? 80 : 100,
                display_type: displayStyle
            }
        }));
        setSelectedLocationForBinding('');
        setIsBindingMode(false);
    };

    const removeBlock = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Remove this location from the map?")) {
            saveSnapshot();
            selectedIdsRef.current.delete(id);
            setLocalCoords(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    // Updated addRoom to talk to the collection
    const addRoom = async () => {
        const roomName = window.prompt("Enter Room Name:");
        if (!roomName) return;

        const startX = Math.round((CANVAS_WIDTH / 2 - 150) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - 150) / 12) * 12;

        try {
            const newRoomData = {
                id: 'room_' + Date.now(),
                name: roomName,
                created_at: new Date().toISOString(),
                map_coordinates: {
                    x: startX,
                    y: startY,
                    width: 360, // 15ft
                    height: 360
                }
            };
            const docRef = await addDoc(collection(db, 'rooms'), newRoomData);
            saveSnapshot();
            setRooms(prev => [...prev, { ...newRoomData, docId: docRef.id }]);
        } catch (error) {
            console.error("Error creating room:", error);
        }
    };

    const removeRoom = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Delete this room structure? (This removes it from both the map AND Locations tab)")) {
            const room = rooms.find(r => r.id === id || r.docId === id);
            if (!room?.docId) return;
            
            saveSnapshot();
            deleteDoc(doc(db, 'rooms', room.docId)).then(() => {
                setRooms(prev => prev.filter(r => r.docId !== room.docId));
            });
        }
    };

    const removeFromMap = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Hide this room from the map design? (Folder will remain in Locations)")) {
            saveSnapshot();
            setRooms(prev => prev.map(r => (r.id === id || r.docId === id) ? { ...r, map_coordinates: null } : r));
        }
    };

    const placeExistingRoom = (roomDocId: string) => {
        const room = rooms.find(r => r.docId === roomDocId);
        if (!room) return;
        
        // Find a center screen position and snap it
        const wrapper = wrapperRef.current;
        const startX = wrapper ? absoluteSnap((wrapper.scrollLeft + wrapper.clientWidth/2) / scale - 180) : absoluteSnap(CANVAS_WIDTH/2 - 180);
        const startY = wrapper ? absoluteSnap((wrapper.scrollTop + wrapper.clientHeight/2) / scale - 180) : absoluteSnap(CANVAS_HEIGHT/2 - 180);
        
        saveSnapshot();
        setRooms(prev => prev.map(r => r.docId === roomDocId ? {
            ...r,
            map_coordinates: { x: startX, y: startY, width: 360, height: 360 }
        } : r));
    };

    const placeAllUnplacedRooms = () => {
        const unplaced = rooms.filter(r => !r.map_coordinates);
        if (unplaced.length === 0) return;
        
        saveSnapshot();
        setRooms(prev => {
            let nextX = 120;
            let nextY = 120;
            const updated = [...prev];
            
            unplaced.forEach(room => {
                const idx = updated.findIndex(r => r.docId === room.docId);
                if (idx !== -1) {
                    updated[idx] = {
                        ...updated[idx],
                        map_coordinates: { x: nextX, y: nextY, width: 360, height: 360 }
                    };
                    nextX += 400;
                    if (nextX > CANVAS_WIDTH - 400) {
                        nextX = 120;
                        nextY += 400;
                    }
                }
            });
            return updated;
        });
    };

    const bringToFront = (id: string, type: 'room' | 'location', e: React.MouseEvent) => {
        e.stopPropagation();
        saveSnapshot();
        // Simplified Z-index logic for now - just push to top of current array/state
        if (type === 'room') {
            const roomIndex = rooms.findIndex(r => r.id === id || r.docId === id);
            if (roomIndex > -1) {
                const room = rooms[roomIndex];
                setRooms(prev => [...prev.filter((_, i) => i !== roomIndex), room]);
            }
        } else {
            // For locations, we use the localCoords object which doesn't really have order, 
            // but we can add a persistent z_index field
            setLocalCoords(prev => {
                const current = prev[id] || {};
                let maxZ = 10;
                Object.values(prev).forEach(c => maxZ = Math.max(maxZ, c.z_index || 10));
                return { ...prev, [id]: { ...current, z_index: maxZ + 1 } };
            });
        }
    };

    const sendToBack = (id: string, type: 'room' | 'location', e: React.MouseEvent) => {
        e.stopPropagation();
        saveSnapshot();
        if (type === 'room') {
            const roomIndex = rooms.findIndex(r => r.id === id || r.docId === id);
            if (roomIndex > -1) {
                const room = rooms[roomIndex];
                setRooms(prev => [room, ...prev.filter((_, i) => i !== roomIndex)]);
            }
        } else {
            setLocalCoords(prev => {
                const current = prev[id] || {};
                let minZ = 10;
                Object.values(prev).forEach(c => minZ = Math.min(minZ, c.z_index || 10));
                return { ...prev, [id]: { ...current, z_index: minZ - 1 } };
            });
        }
    };

    const rotateItem = (id: string, type: 'room' | 'location', currentRotation: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const res = window.prompt("Enter rotation degrees:", currentRotation.toString());
        if (!res) return;
        const deg = parseInt(res, 10);
        if (isNaN(deg)) return;

        saveSnapshot();
        if (type === 'room') {
            setRooms(prev => prev.map(r => (r.id === id || r.docId === id) ? { 
                ...r, 
                map_coordinates: r.map_coordinates ? { ...r.map_coordinates, rotation: deg } : null 
            } : r));
        } else {
            setLocalCoords(prev => ({ ...prev, [id]: { ...prev[id], rotation: deg } }));
        }
    };

    const setSelectionDOM = (id: string, select: boolean) => {
        const el = document.getElementById(`inner-rnd-${id}`);
        if (el) el.setAttribute('data-selected', select ? 'true' : 'false');
    };

    const handlePointDown = (id: string, e: any) => {
        if (!isEditMode) return;
        const isShift = e.shiftKey;
        if (!isShift) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
        }
        if (selectedIdsRef.current.has(id)) {
            selectedIdsRef.current.delete(id);
            setSelectionDOM(id, false);
        } else {
            selectedIdsRef.current.add(id);
            setSelectionDOM(id, true);
        }
        setSelectionTick(t => t + 1);
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.react-draggable') || (e.target as HTMLElement).closest('button')) return;
        selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
        selectedIdsRef.current.clear();
        setSelectionTick(t => t + 1);
    };

    const handleGroupDragStart = (draggedId: string) => {
        dragStartPosRef.current = {};
        const getX = (id: string) => rooms.find(r => r.id === id || r.docId === id)?.map_coordinates?.x ?? localCoords[id]?.x ?? 0;
        const getY = (id: string) => rooms.find(r => r.id === id || r.docId === id)?.map_coordinates?.y ?? localCoords[id]?.y ?? 0;
        
        selectedIdsRef.current.add(draggedId);
        selectedIdsRef.current.forEach(id => {
            dragStartPosRef.current[id] = { x: getX(id), y: getY(id) };
        });
    };

    const handleGroupDrag = (draggedId: string, d: { x: number, y: number }) => {
        const start = dragStartPosRef.current[draggedId];
        if (!start) return;
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        selectedIdsRef.current.forEach(id => {
            if (id === draggedId) return;
            const el = document.getElementById(`rnd-node-${id}`);
            const init = dragStartPosRef.current[id];
            if (el && init) {
                el.style.transform = `translate(${init.x + offsetX}px, ${init.y + offsetY}px)`;
            }
        });
    };

    const handleGroupDragStopStateSync = (draggedId: string, d: { x: number, y: number }) => {
        const start = dragStartPosRef.current[draggedId];
        if (!start) return;
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        saveSnapshot();
        const snap = (v: number) => absoluteSnap(v);

        setRooms(prev => prev.map(r => {
            const id = r.docId || r.id;
            if (selectedIdsRef.current.has(id) && dragStartPosRef.current[id]) {
                const coords = r.map_coordinates;
                if (!coords) return r;
                return {
                    ...r,
                    map_coordinates: {
                        ...coords,
                        x: snap(dragStartPosRef.current[id].x + offsetX),
                        y: snap(dragStartPosRef.current[id].y + offsetY)
                    }
                };
            }
            return r;
        }));

        setLocalCoords(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(id => {
                if (selectedIdsRef.current.has(id) && dragStartPosRef.current[id]) {
                    next[id] = {
                        ...next[id],
                        x: snap(dragStartPosRef.current[id].x + offsetX),
                        y: snap(dragStartPosRef.current[id].y + offsetY)
                    };
                }
            });
            return next;
        });
    };

    return (
        <div className="relative flex flex-col h-full animate-in fade-in duration-500 overflow-hidden bg-cream" onClick={handleCanvasClick}>
            <div className="bg-white border-b border-tan-light/50 p-4 md:px-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 z-20 shrink-0">
                <div>
                    <h1 className="text-2xl font-serif font-bold text-charcoal flex items-center gap-2">
                        <MapPin className="text-tan" size={24} /> Museum Blueprint
                    </h1>
                    <p className="text-[10px] text-charcoal/40 font-bold uppercase tracking-widest mt-0.5 ml-8">Interactive digital floor plan</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-cream rounded-lg p-1 border border-tan-light/30">
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-2 hover:bg-white rounded hover:text-tan"><ZoomOut size={16}/></button>
                        <span className="text-xs font-mono font-bold px-2 w-12 text-center">{(scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-white rounded hover:text-tan"><ZoomIn size={16}/></button>
                        <button onClick={handleFitToScreen} className="p-2 hover:bg-white rounded hover:text-tan ml-1"><Maximize size={16}/></button>
                    </div>

                    {isSAHSUser && (
                        <div className="flex items-center gap-3 ml-4 border-l border-tan-light/50 pl-4">
                            {isEditMode ? (
                                <>
                                    <button onClick={handleSaveLayout} disabled={isSaving} className="bg-tan text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">{isSaving?"Saving...":"Save Changes"}</button>
                                    <button onClick={() => setIsEditMode(false)} className="text-sm font-bold text-charcoal">Cancel</button>
                                </>
                            ) : (
                                <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 bg-white border border-tan-light shadow-sm text-charcoal px-4 py-2 rounded-lg text-sm font-bold hover:bg-tan-light/10 transition-colors">
                                    <Edit3 size={16} className="text-tan"/> <span>Edit Blueprint</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isEditMode && (
                <div className="absolute top-24 left-8 z-30 bg-white p-4 rounded-xl shadow-lg border border-tan w-80 max-h-[80vh] overflow-y-auto">
                    <h3 className="font-serif font-bold text-charcoal mb-3 border-b border-tan-light/50 pb-2 flex items-center gap-2">
                        <LayoutGrid size={16} className="text-tan"/> Layout Tools
                    </h3>

                    {/* Diagnostic Stats */}
                    <div className="space-y-2 mb-4">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-tan/5 p-2 rounded-lg border border-tan/20">
                                <p className="text-[10px] font-black uppercase text-tan/60 mb-0.5">Rooms</p>
                                <p className="font-mono text-xs font-bold text-charcoal">{rooms.length} Loaded / {rooms.filter(r => !r.map_coordinates).length} Unplaced</p>
                            </div>
                            <div className="bg-charcoal/5 p-2 rounded-lg border border-charcoal/10">
                                <p className="text-[10px] font-black uppercase text-charcoal/40 mb-0.5">Locations</p>
                                <p className="font-mono text-xs font-bold text-charcoal">{locations.length} Total / {locations.filter(l => !localCoords[l.id]).length} Unplaced</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => { console.log("Manual Sync Triggered"); fetchMapData(); }}
                            className="w-full text-[9px] font-bold uppercase tracking-widest text-tan/60 hover:text-tan text-center py-1 border border-tan/10 rounded border-dashed transition-colors"
                        >
                            Refresh Data & Force Sync
                        </button>
                    </div>
                    
                    {isBindingMode ? (
                        <div className="space-y-3">
                            <select className="w-full bg-cream p-2 rounded border" value={selectedLocationForBinding} onChange={e=>setSelectedLocationForBinding(e.target.value)}>
                                <option value="">Select location...</option>
                                {locations.filter(l => !localCoords[l.id]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <button onClick={addBlock} className="flex-1 bg-tan text-white py-2 rounded text-sm font-bold">Place</button>
                                <button onClick={()=>setIsBindingMode(false)} className="px-3 bg-cream text-charcoal text-sm rounded">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <button onClick={()=>setIsBindingMode(true)} className="w-full flex items-center justify-center gap-2 bg-tan/10 text-tan border border-tan/30 border-dashed py-3 rounded-lg text-sm font-bold hover:bg-tan hover:text-white transition-all"><Plus size={18}/> Place Shelf Block</button>
                            <button onClick={addRoom} className="w-full flex items-center justify-center gap-2 bg-charcoal/5 border py-3 rounded-lg text-sm font-bold hover:bg-charcoal hover:text-white transition-all"><BoxSelect size={18}/> New Structural Room</button>
                            
                            <div className="mt-4 pt-4 border-t border-tan-light/50">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest leading-none">Unplaced Rooms</h4>
                                    {rooms.filter(r => !r.map_coordinates).length > 1 && (
                                        <button onClick={placeAllUnplacedRooms} className="text-[9px] font-black uppercase text-tan hover:text-charcoal bg-tan/5 px-2 py-1 rounded transition-colors">Place All</button>
                                    )}
                                </div>
                                {rooms.filter(r => !r.map_coordinates).map(r => (
                                    <button key={r.docId} onClick={()=>placeExistingRoom(r.docId!)} className="w-full text-left text-xs bg-cream p-2 rounded mb-1 flex justify-between items-center hover:bg-tan/10 group font-bold">
                                        {r.name} <Plus size={12} className="opacity-0 group-hover:opacity-100"/>
                                    </button>
                                ))}
                                {rooms.filter(r => !r.map_coordinates).length === 0 && <p className="text-[10px] italic text-charcoal/30 font-bold border border-dashed border-charcoal/10 p-2 rounded text-center">All rooms are currently on map</p>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div ref={wrapperRef} className="workspace-wrapper flex-1 overflow-auto relative bg-[#f5f5f0] shadow-inner flex items-center justify-center p-10">
                <style>{`
                    .blueprint-grid {
                        background-size: 24px 24px;
                        background-image: linear-gradient(to right, rgba(140,120,100,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(140,120,100,0.1) 1px, transparent 1px);
                    }
                    [data-selected="true"] { outline: 3px solid #c4a484 !important; outline-offset: 2px !important; z-index: 50 !important; }
                `}</style>

                {!loading && (
                    <div className="relative flex-shrink-0 m-auto shadow-2xl bg-white border border-tan-light/30" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
                        <div className="absolute top-0 left-0 blueprint-grid" onClick={handleCanvasClick} style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                            {/* Render Rooms */}
                            {rooms.map(room => {
                                const coords = room.map_coordinates;
                                if (!coords) return null;
                                return (
                                    <Rnd
                                        key={room.docId}
                                        id={`rnd-node-${room.docId}`}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode}
                                        position={{ x: coords.x, y: coords.y }}
                                        size={{ width: coords.width, height: coords.height }}
                                        onDragStart={() => handleGroupDragStart(room.docId!)}
                                        onDrag={(_e, d) => handleGroupDrag(room.docId!, d)}
                                        onDragStop={(_e, d) => handleGroupDragStopStateSync(room.docId!, d)}
                                        onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                            saveSnapshot();
                                            setRooms(prev => prev.map(r => r.docId === room.docId ? { ...r, map_coordinates: { ...coords, x: absoluteSnap(pos.x), y: absoluteSnap(pos.y), width: absoluteSnap(parseInt(ref.style.width, 10)), height: absoluteSnap(parseInt(ref.style.height, 10)) }} : r));
                                        }}
                                        onClickCapture={(e) => handlePointDown(room.docId!, e)}
                                        className={`absolute border-2 border-tan/20 bg-tan/20 transition-all ${isEditMode ? 'cursor-move hover:bg-tan/30' : 'pointer-events-none'}`}
                                    >
                                        <div id={`inner-rnd-${room.docId}`} className="w-full h-full flex flex-col items-center justify-center pointer-events-none">
                                            <span className="font-serif font-bold text-charcoal/40 text-lg text-center px-4 mix-blend-darken">{room.name}</span>
                                            {isEditMode && (
                                                <div className="absolute top-1 right-1 flex gap-1 pointer-events-auto">
                                                    <button onClick={(e) => rotateItem(room.docId!, 'room', coords.rotation || 0, e)} className="bg-white/80 p-1 rounded hover:bg-white"><RotateCw size={12}/></button>
                                                    <button onClick={(e) => removeFromMap(room.docId!, e)} className="bg-red-400 text-white p-1 rounded hover:bg-red-500"><X size={12}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </Rnd>
                                );
                            })}

                            {/* Render Locations */}
                            {locations.map(loc => {
                                const c = localCoords[loc.id];
                                if (!c) return null;
                                return (
                                    <Rnd
                                        key={loc.id}
                                        id={`rnd-node-${loc.id}`}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode && c.display_type !== 'pin'}
                                        position={{ x: c.x, y: c.y }}
                                        size={{ width: c.width, height: c.height }}
                                        onDragStart={() => handleGroupDragStart(loc.id)}
                                        onDrag={(_e, d) => handleGroupDrag(loc.id, d)}
                                        onDragStop={(_e, d) => handleGroupDragStopStateSync(loc.id, d)}
                                        onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                            saveSnapshot();
                                            setLocalCoords(prev => ({ ...prev, [loc.id]: { ...prev[loc.id], x: absoluteSnap(pos.x), y: absoluteSnap(pos.y), width: absoluteSnap(parseInt(ref.style.width, 10)), height: absoluteSnap(parseInt(ref.style.height, 10)) }}));
                                        }}
                                        onClickCapture={(e) => handlePointDown(loc.id, e)}
                                        className={`absolute group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
                                        style={{ zIndex: c.z_index || 10 }}
                                    >
                                        <div id={`inner-rnd-${loc.id}`} className="w-full h-full relative" style={{ transform: `rotate(${c.rotation || 0}deg)` }}>
                                            {c.display_type === 'pin' ? (
                                                <div className="flex flex-col items-center">
                                                    <MapPin size={48} className="text-red-500 drop-shadow-md" fill="white"/>
                                                    <span className="text-[10px] font-bold bg-white/90 border px-1 rounded shadow-sm">{loc.name}</span>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full border-2 border-tan bg-white/90 flex items-center justify-center p-1 text-center">
                                                    <span className="font-serif font-bold text-charcoal text-[9px] uppercase leading-tight">{loc.name}</span>
                                                </div>
                                            )}
                                            {isEditMode && (
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 flex gap-1">
                                                    <button onClick={(e) => rotateItem(loc.id, 'location', c.rotation || 0, e)} className="bg-white border p-1 rounded"><RotateCw size={10}/></button>
                                                    <button onClick={(e) => removeBlock(loc.id, e)} className="bg-red-400 text-white p-1 rounded"><X size={10}/></button>
                                                </div>
                                            )}
                                            {!isEditMode && (
                                                <Link to={`/locations/${loc.id}`} className="absolute inset-0 z-50 rounded bg-tan/0 hover:bg-tan/80 flex items-center justify-center transition-all">
                                                    <span className="text-white text-[10px] font-bold opacity-0 hover:opacity-100 uppercase tracking-widest">View Shelf</span>
                                                </Link>
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
