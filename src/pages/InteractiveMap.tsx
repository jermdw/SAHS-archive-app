import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
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
    group_id?: string;
}

type LayoutHistoryState = {
    rooms: StructuralRoom[];
    localCoords: Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin'}>;
};

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
    const [localCoords, setLocalCoords] = useState<Record<string, {x: number, y: number, width: number, height: number, rotation?: number, z_index?: number, display_type?: 'box' | 'pin'}>>({});

    // For binding unmapped locations
    const [selectedLocationForBinding, setSelectedLocationForBinding] = useState<string>('');
    const [isBindingMode, setIsBindingMode] = useState(false);
    
    // New Feature States
    const [isSnapping, setIsSnapping] = useState(true);
    const [displayStyle, setDisplayStyle] = useState<'box' | 'pin'>('box');
    const absoluteSnap = (val: number) => isSnapping ? Math.round(val / 12) * 12 : val;

    // Structural Rooms
    const [rooms, setRooms] = useState<StructuralRoom[]>([]);
    
    // Multi-select and Drag tracking
    const selectedIdsRef = useRef<Set<string>>(new Set());
    const dragStartPosRef = useRef<Record<string, {x: number, y: number}>>({});
    const [selectionTick, setSelectionTick] = useState(0); // For triggering UI buttons reacting to ref changes

    // History and Undo tracking
    const [history, setHistory] = useState<LayoutHistoryState[]>([]);
    
    // Core helper to save snapshot *before* mutating
    const saveSnapshot = () => {
        setHistory(prev => {
            const next = [...prev, { rooms: JSON.parse(JSON.stringify(rooms)), localCoords: JSON.parse(JSON.stringify(localCoords)) }];
            if (next.length > 30) return next.slice(next.length - 30);
            return next;
        });
    };

    // Keyboard global undo listener
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
                        // Also clear selection UI just in case
                        selectedIdsRef.current.forEach(id => setSelectionDOM(id, false));
                        selectedIdsRef.current.clear();
                    }
                    return next;
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode]);

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'locations'));
            
            // Clean up any accidentally created ghost documents
            snapshot.docs.forEach(d => {
                if (!d.data().name) {
                    deleteDoc(doc(db, 'locations', d.id)).catch(console.error);
                }
            });

            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                docId: doc.id
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
                const loc = locations.find(l => l.id === id);
                if (loc?.docId) {
                    const docRef = doc(db, 'locations', loc.docId); 
                    return setDoc(docRef, { map_coordinates: stripUndefined(coords) }, { merge: true });
                }
                return Promise.resolve();
            });
            
            // If any locations were completely removed from the map during edit, 
            // we should technically nullify them, but to be safe and simple:
            locations.forEach(loc => {
                if (loc.map_coordinates && !localCoords[loc.id] && loc.docId) {
                    promises.push(setDoc(doc(db, 'locations', loc.docId), { map_coordinates: null }, { merge: true }));
                }
            });

            await Promise.all(promises);

            // Save Rooms
            await setDoc(doc(db, 'settings', 'interactive_map'), { rooms: stripUndefined(rooms) }, { merge: true });

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
            alert("Please select a location from the dropdown first to add it to the map.");
            return;
        }
        
        if (localCoords[selectedLocationForBinding]) {
            alert("This location is already on the map!");
            return;
        }

        // Add a default block or pin in the center
        const isPin = displayStyle === 'pin';
        const startX = Math.round((CANVAS_WIDTH / 2 - (isPin ? 24 : 50)) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - (isPin ? 24 : 50)) / 12) * 12;
        
        saveSnapshot();
        setLocalCoords(prev => ({
            ...prev,
            [selectedLocationForBinding]: {
                x: startX,
                y: startY,
                width: isPin ? 60 : Math.round(150 / 12) * 12,
                height: isPin ? 80 : Math.round(100 / 12) * 12,
                display_type: displayStyle
            }
        }));
        setSelectedLocationForBinding('');
        setIsBindingMode(false);
        setDisplayStyle('box');
    };

    const removeBlock = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Remove this location from the map? (This doesn't delete the location from the database, just the floorplan)")) {
            saveSnapshot();
            selectedIdsRef.current.delete(id);
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

        // Snap initial placement precisely to the 12px grid
        const startX = Math.round((CANVAS_WIDTH / 2 - 150) / 12) * 12;
        const startY = Math.round((CANVAS_HEIGHT / 2 - 150) / 12) * 12;
        
        const newRoom: StructuralRoom = {
            id: 'room_' + Date.now(),
            name: roomName,
            x: startX,
            y: startY,
            width: Math.round(15 * PIXELS_PER_FOOT), // 15ft
            height: Math.round(15 * PIXELS_PER_FOOT)
        };

        saveSnapshot();
        setRooms(prev => [...prev, newRoom]);
    };

    const removeRoom = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("Delete this room structure?")) {
            saveSnapshot();
            selectedIdsRef.current.delete(id);
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

            saveSnapshot();
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

        saveSnapshot();
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

        saveSnapshot();
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
            saveSnapshot();
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

    // --- Multi Select / Groupings ---
    const mergeRooms = () => {
        const selectedRooms = rooms.filter(r => selectedIdsRef.current.has(r.id));
        if (selectedRooms.length < 2) return;

        let largest = selectedRooms[0];
        let maxArea = largest.width * largest.height;
        for (let i = 1; i < selectedRooms.length; i++) {
            const area = selectedRooms[i].width * selectedRooms[i].height;
            if (area > maxArea) {
                maxArea = area;
                largest = selectedRooms[i];
            }
        }

        saveSnapshot();
        const newGroupId = largest.id;
        setRooms(prev => prev.map(r => {
            if (selectedIdsRef.current.has(r.id)) {
                return { ...r, group_id: newGroupId };
            }
            return r;
        }));
    };

    const unmergeRooms = () => {
        const hasGrouped = rooms.some(r => selectedIdsRef.current.has(r.id) && r.group_id);
        if (!hasGrouped) return;

        saveSnapshot();
        setRooms(prev => prev.map(r => {
            if (selectedIdsRef.current.has(r.id)) {
                return { ...r, group_id: undefined };
            }
            return r;
        }));
    };

    const setSelectionDOM = (id: string, select: boolean) => {
        const el = document.getElementById(`inner-rnd-${id}`);
        if (!el) return;
        if (select) {
            el.setAttribute('data-selected', 'true');
        } else {
            el.removeAttribute('data-selected');
        }
    };

    const handlePointDown = (id: string, e: React.MouseEvent | React.TouchEvent) => {
        if (!isEditMode) return;
        const isShift = ('shiftKey' in e) ? e.shiftKey : false;
        
        const targetRoom = rooms.find(r => r.id === id);
        const groupElements = targetRoom?.group_id ? rooms.filter(r => r.group_id === targetRoom.group_id) : [{id}];
        const idsToToggle = targetRoom?.group_id ? groupElements.map(r => r.id) : [id];

        if (isShift) {
            const alreadySelected = idsToToggle.every(tid => selectedIdsRef.current.has(tid));
            if (alreadySelected) {
                idsToToggle.forEach(tid => {
                    selectedIdsRef.current.delete(tid);
                    setSelectionDOM(tid, false);
                });
            } else {
                idsToToggle.forEach(tid => {
                    selectedIdsRef.current.add(tid);
                    setSelectionDOM(tid, true);
                });
            }
        } else {
            const alreadySelected = selectedIdsRef.current.has(id);
            if (!alreadySelected) {
                selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
                selectedIdsRef.current.clear();
                idsToToggle.forEach(tid => {
                    selectedIdsRef.current.add(tid);
                    setSelectionDOM(tid, true);
                });
            }
        }
        
        requestAnimationFrame(() => setSelectionTick(t => t + 1));
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // If clicking on an item, resize handle, action bar, or any UI button/form, preserve selection
        if (target.closest('.react-draggable') || target.closest('button') || target.closest('select')) {
            return;
        }

        // Otherwise, clear all active highlights
        selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
        selectedIdsRef.current.clear();
        setSelectionTick(t => t + 1);
    };

    // Make sure selections are cleared when transitioning between edit/view modes
    useEffect(() => {
        if (!isEditMode) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
        }
    }, [isEditMode]);

    // --- Drag and Drop Handlers ---
    const handleGroupDragStart = (draggedId: string) => {
        dragStartPosRef.current = {};
        
        if (!selectedIdsRef.current.has(draggedId)) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            selectedIdsRef.current.add(draggedId);
            setSelectionDOM(draggedId, true);
            
            dragStartPosRef.current[draggedId] = {
                x: rooms.find(r => r.id === draggedId)?.x ?? localCoords[draggedId]?.x ?? 0,
                y: rooms.find(r => r.id === draggedId)?.y ?? localCoords[draggedId]?.y ?? 0
            };
        }

        rooms.forEach(r => {
            if (selectedIdsRef.current.has(r.id)) dragStartPosRef.current[r.id] = { x: r.x, y: r.y };
        });
        Object.entries(localCoords).forEach(([id, coords]) => {
            if (selectedIdsRef.current.has(id)) dragStartPosRef.current[id] = { x: coords.x, y: coords.y };
        });
    };

    const handleGroupDrag = (draggedId: string, d: { x: number, y: number }) => {
        const startPos = dragStartPosRef.current[draggedId];
        if (!startPos) return;

        const offsetX = d.x - startPos.x;
        const offsetY = d.y - startPos.y;

        // Visual only update - no React state to prevent jumpiness
        selectedIdsRef.current.forEach((id: string) => {
            if (id !== draggedId) {
                const el = document.getElementById(`rnd-node-${id}`);
                if (el) {
                    const initPos = dragStartPosRef.current[id];
                    if (initPos) {
                        const newX = initPos.x + offsetX;
                        const newY = initPos.y + offsetY;
                        el.style.transform = `translate(${newX}px, ${newY}px)`;
                    }
                }
            }
        });
    };

    const handleGroupDragStopStateSync = (draggedId: string, d: { x: number, y: number }) => {
        const startPos = dragStartPosRef.current[draggedId];
        if (!startPos) return;

        const offsetX = d.x - startPos.x;
        const offsetY = d.y - startPos.y;

        saveSnapshot();
        // Apply state updates only on drop
        setRooms(prev => prev.map(r => {
            if (selectedIdsRef.current.has(r.id) && dragStartPosRef.current[r.id]) {
                const targetX = dragStartPosRef.current[r.id].x + offsetX;
                const targetY = dragStartPosRef.current[r.id].y + offsetY;
                return {
                    ...r,
                    x: absoluteSnap(targetX),
                    y: absoluteSnap(targetY)
                };
            }
            return r;
        }));

        setLocalCoords(prev => {
            const next = { ...prev };
            let changed = false;
            Object.keys(next).forEach(id => {
                if (selectedIdsRef.current.has(id) && dragStartPosRef.current[id]) {
                    const targetX = dragStartPosRef.current[id].x + offsetX;
                    const targetY = dragStartPosRef.current[id].y + offsetY;
                    next[id] = {
                        ...next[id],
                        x: absoluteSnap(targetX),
                        y: absoluteSnap(targetY)
                    };
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    };
    // ----------------------------

    return (
        <div className="relative flex flex-col h-full animate-in fade-in duration-500 overflow-hidden bg-cream" onClick={handleCanvasClick}>
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
                <Rnd
                    default={{ x: 32, y: 96, width: 320, height: 'auto' }}
                    enableResizing={false}
                    bounds="parent"
                    dragHandleClassName="panel-drag-handle"
                    className="z-30 animate-in fade-in"
                >
                    <div className="bg-white p-4 rounded-xl shadow-lg border border-tan w-full h-full max-h-[80vh] overflow-y-auto pointer-events-auto">
                        <h3 className="panel-drag-handle cursor-move font-serif font-bold text-charcoal mb-3 flex items-center gap-2 pb-2 border-b border-tan-light/50 sticky top-0 bg-white z-10">
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
                            <label className="block text-xs font-bold text-charcoal/60 uppercase tracking-widest mt-4">Display Style</label>
                            <div className="flex gap-2 mb-4 mt-1">
                                <button 
                                    onClick={() => setDisplayStyle('box')}
                                    className={`flex-1 py-1.5 px-3 rounded text-xs font-bold border ${displayStyle === 'box' ? 'bg-tan text-white border-tan' : 'bg-cream text-charcoal border-tan-light/50 hover:bg-white'} transition-colors`}
                                >
                                    Region Box
                                </button>
                                <button 
                                    onClick={() => setDisplayStyle('pin')}
                                    className={`flex-1 py-1.5 px-3 rounded text-xs font-bold border ${displayStyle === 'pin' ? 'bg-tan text-white border-tan' : 'bg-cream text-charcoal border-tan-light/50 hover:bg-white'} transition-colors`}
                                >
                                    Map Pin
                                </button>
                            </div>

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
                                className="w-full flex items-center justify-center gap-2 bg-charcoal/5 border border-charcoal/20 px-4 py-3 rounded-lg text-sm font-bold text-charcoal hover:bg-charcoal hover:text-white transition-colors group mb-2"
                            >
                                <BoxSelect size={18} className="transition-transform group-hover:scale-110" />
                                Add Structural Room
                            </button>

                            {/* Selection Feedback */}
                            {selectionTick > -1 && selectedIdsRef.current.size > 0 && (
                                <div className="flex items-center justify-between bg-tan/5 px-2 py-1.5 rounded-lg border border-tan/10">
                                    <span className="text-[10px] font-bold text-tan uppercase tracking-widest">{selectedIdsRef.current.size} Elements Selected</span>
                                    {history.length >= 0 && (
                                        <span className="text-[10px] text-charcoal/40 font-mono">History: {history.length}</span>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 mt-2">
                            {/* Polygon Room Merge Actions using selectionTick to force re-render */}
                            {selectionTick > -1 && Array.from(selectedIdsRef.current).filter(id => id.startsWith('room_')).length >= 2 && (
                                <button onClick={mergeRooms} className="w-full mb-2 bg-white border-2 border-tan text-tan shadow-sm px-4 py-2 rounded-lg text-sm font-bold hover:bg-tan hover:text-white transition-colors">
                                    Merge {Array.from(selectedIdsRef.current).filter(id => id.startsWith('room_')).length} Rooms
                                </button>
                            )}
                            {selectionTick > -1 && Array.from(selectedIdsRef.current).some(id => rooms.find(r => r.id === id)?.group_id) && (
                                <button onClick={unmergeRooms} className="w-full mb-2 bg-white border-2 border-charcoal/30 text-charcoal/80 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-50 hover:border-red-400 hover:text-red-500 transition-colors">
                                    Unmerge Room Shape
                                </button>
                            )}
                            
                            <label className="flex items-center gap-2 text-sm text-charcoal/80 font-bold mt-2 cursor-pointer p-2 hover:bg-charcoal/5 rounded transition-colors select-none">
                                <input 
                                    type="checkbox" 
                                    checked={isSnapping} 
                                    onChange={(e) => setIsSnapping(e.target.checked)} 
                                    className="rounded border-tan/50 text-tan focus:ring-tan w-4 h-4 cursor-pointer"
                                />
                                <span>Snap to Grid (0.5ft)</span>
                            </label>
                            
                            {isSnapping && (
                                <button
                                    onClick={() => {
                                        saveSnapshot();
                                        const forceSnap = (v: number) => Math.round(v / 12) * 12;
                                        setRooms(prev => prev.map(r => ({ 
                                            ...r, 
                                            x: forceSnap(r.x), 
                                            y: forceSnap(r.y), 
                                            width: forceSnap(r.width), 
                                            height: forceSnap(r.height) 
                                        })));
                                        setLocalCoords(prev => {
                                            const next = {...prev};
                                            Object.keys(next).forEach(k => {
                                                next[k] = { 
                                                    ...next[k], 
                                                    x: forceSnap(next[k].x), 
                                                    y: forceSnap(next[k].y), 
                                                    width: forceSnap(next[k].width), 
                                                    height: forceSnap(next[k].height) 
                                                };
                                            });
                                            return next;
                                        });
                                    }}
                                    className="w-full text-xs font-bold text-tan bg-white border border-tan/30 rounded py-1.5 hover:bg-tan hover:text-white transition-colors mt-1 mb-2"
                                    title="Forces all misaligned elements mathematically perfectly onto the nearest grid lines"
                                >
                                    Auto-Align All Elements to Grid
                                </button>
                            )}
                            </div>
                        </div>
                    )}
                    
                    <p className="text-[10px] text-charcoal/50 mt-4 leading-tight italic">
                        Tip: Drag blocks to move them. Drag the edges or corners to resize them to match the physical scale of the cases or rooms.
                    </p>
                    </div>
                </Rnd>
            )}

            {/* Map Canvas Workspace */}
            <div 
                className="workspace-wrapper flex-1 overflow-auto relative bg-[#f5f5f0] shadow-inner cursor-grab active:cursor-grabbing p-8"
                onClick={handleCanvasClick}
            >
                {/* CSS grid background generator */}
                <style>{`
                    .blueprint-grid {
                        background-size: 24px 24px, 24px 24px, 12px 12px, 12px 12px;
                        background-image: 
                            linear-gradient(to right, rgba(140, 120, 100, 0.15) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(140, 120, 100, 0.15) 1px, transparent 1px),
                            linear-gradient(to right, rgba(140, 120, 100, 0.05) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(140, 120, 100, 0.05) 1px, transparent 1px);
                    }
                    /* Selection Styles based on data attribute */
                    [data-selected="true"].room-box:not(.grouped-room) {
                        box-shadow: 0 0 0 4px rgba(196,164,132,0.6) !important;
                        border-color: rgba(196,164,132,0.6) !important;
                    }
                    [data-selected="true"].room-box {
                        background-color: rgba(215, 205, 185, 1) !important;
                    }
                    [data-selected="true"].grouped-room {
                        box-shadow: 0 0 0 2px rgba(196,164,132,0.4) !important;
                        z-index: 10 !important;
                    }
                    [data-selected="true"].location-box {
                        box-shadow: 0 0 0 4px #c4a484 !important;
                        border-color: #c4a484 !important;
                        background-color: white !important;
                    }
                    [data-selected="true"].location-pin {
                        transform: scale(1.25) !important;
                        filter: drop-shadow(0 0 8px rgba(196,164,132,0.8)) !important;
                    }
                `}</style>

                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-charcoal/40 font-serif text-lg">
                        Processing layout...
                    </div>
                ) : (
                    <div 
                        className="canvas-wrapper relative transition-all ease-out duration-200 flex-shrink-0 m-auto"
                        style={{ 
                            width: CANVAS_WIDTH * scale, 
                            height: CANVAS_HEIGHT * scale
                        }}
                    >
                        <div 
                            className="absolute top-0 left-0 blueprint-grid"
                            onClick={handleCanvasClick}
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
                        <div className="absolute inset-0" style={{ filter: 'drop-shadow(0px 0px 1.5px rgba(110, 95, 80, 0.6))' }}>
                        {rooms.map((room, _idx, allRooms) => {
                            // Precise Geometrical Adjacency for Borders
                            // Only remove a wall's border if it is physically touching another room of the EXACT SAME name in the same group.
                            let borderTop = true, borderBottom = true, borderLeft = true, borderRight = true;
                            if (room.group_id) {
                                allRooms.forEach(other => {
                                    if (other.id !== room.id && other.group_id === room.group_id && other.name === room.name) {
                                        const isIntersectingX = (room.x < other.x + other.width) && (room.x + room.width > other.x);
                                        const isIntersectingY = (room.y < other.y + other.height) && (room.y + room.height > other.y);
                                        
                                        if (isIntersectingX) {
                                            if (Math.abs(room.y - (other.y + other.height)) <= 1) borderTop = false; // Other is directly above
                                            if (Math.abs((room.y + room.height) - other.y) <= 1) borderBottom = false; // Other is directly below
                                        }
                                        if (isIntersectingY) {
                                            if (Math.abs(room.x - (other.x + other.width)) <= 1) borderLeft = false; // Other is directly to left
                                            if (Math.abs((room.x + room.width) - other.x) <= 1) borderRight = false; // Other is directly to right
                                        }
                                    }
                                });
                            }
                            
                            const bc = '1px solid rgba(160, 140, 120, 0.45)';

                            // Is this room the "first" of its name within the group? (Decides whether to draw the text label)
                            const isFirstOfNameInGroup = !room.group_id || !allRooms.some(r => r.group_id === room.group_id && r.name === room.name && r.id < room.id);

                            return (
                                <Rnd
                                    key={room.id}
                                    id={`rnd-node-${room.id}`}
                                    scale={scale}
                                    disableDragging={!isEditMode}
                                    enableResizing={isEditMode}
                                    bounds="parent"
                                    dragGrid={isSnapping ? [12, 12] : undefined}
                                    resizeGrid={isSnapping ? [12, 12] : undefined}
                                    position={{ x: room.x, y: room.y }}
                                    size={{ width: room.width, height: room.height }}
                                    onDragStart={() => {
                                        handleGroupDragStart(room.id);
                                    }}
                                    onMouseDownCapture={(e: any) => handlePointDown(room.id, e)}
                                    onTouchStartCapture={(e: any) => handlePointDown(room.id, e)}
                                    onDrag={(_e, d) => handleGroupDrag(room.id, d)}
                                    onDragStop={(_e, d) => {
                                        handleGroupDragStopStateSync(room.id, d);
                                    }}
                                    onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                        saveSnapshot();
                                        setRooms(prev => prev.map(r => r.id === room.id ? { 
                                            ...r, 
                                            x: absoluteSnap(pos.x), 
                                            y: absoluteSnap(pos.y), 
                                            width: absoluteSnap(parseInt(ref.style.width, 10)), 
                                            height: absoluteSnap(parseInt(ref.style.height, 10)) 
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
                                <div 
                                    id={`inner-rnd-${room.id}`}
                                    className={`room-box w-full h-full flex flex-col transition-transform
                                        ${room.group_id ? 'grouped-room' : ''}
                                        ${isEditMode && !room.group_id ? 'hover:shadow-inner' : ''}
                                `}
                                style={{ 
                                    transform: `rotate(${room.rotation || 0}deg)`, 
                                    transformOrigin: 'center',
                                    backgroundColor: '#E4DFD3',
                                    borderTop: borderTop ? bc : 'none',
                                    borderBottom: borderBottom ? bc : 'none',
                                    borderLeft: borderLeft ? bc : 'none',
                                    borderRight: borderRight ? bc : 'none',
                                    borderRadius: '0px',
                                    pointerEvents: 'none' 
                                }}
                                >
                                    {/* Render Name logic */}
                                    {isFirstOfNameInGroup && (
                                        <div className="flex justify-center items-center w-full h-full pointer-events-none opacity-60 overflow-visible">
                                            <h3 className="font-serif font-bold text-center text-charcoal px-2 text-sm leading-tight drop-shadow-sm bg-white/20 backdrop-blur-[1px] rounded-md">
                                                {room.name}
                                            </h3>
                                        </div>
                                    )}
                                </div>
                                </Rnd>
                            );
                        })}
                        </div>
                        
                        {/* Render all mapped locations */}
                        {locations.map(loc => {
                            const coords = localCoords[loc.id];
                            if (!coords) return null;

                            return (
                                <Rnd
                                    key={loc.id}
                                    id={`rnd-node-${loc.id}`}
                                    scale={scale}
                                    disableDragging={!isEditMode}
                                    enableResizing={isEditMode && coords.display_type !== 'pin'}
                                    bounds="parent"
                                    dragGrid={isSnapping ? [12, 12] : undefined}
                                    resizeGrid={isSnapping ? [12, 12] : undefined}
                                    position={{ x: coords.x, y: coords.y }}
                                    size={{ width: coords.width, height: coords.height }}
                                    onDragStart={() => handleGroupDragStart(loc.id)}
                                    onDrag={(_e, d) => handleGroupDrag(loc.id, d)}
                                    onDragStop={(_e, d) => {
                                        handleGroupDragStopStateSync(loc.id, d);
                                    }}
                                    onResizeStop={(_e, _direction, ref, _delta, position) => {
                                        saveSnapshot();
                                        setLocalCoords(prev => ({
                                            ...prev,
                                            [loc.id]: {
                                                x: absoluteSnap(position.x),
                                                y: absoluteSnap(position.y),
                                                width: absoluteSnap(parseInt(ref.style.width, 10)),
                                                height: absoluteSnap(parseInt(ref.style.height, 10)),
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

                                    {coords.display_type === 'pin' ? (
                                        <div 
                                            onMouseDown={(e) => handlePointDown(loc.id, e)}
                                            onTouchStart={(e) => handlePointDown(loc.id, e)}
                                            className={`relative w-full h-full flex flex-col items-center justify-start transition-all group ${isEditMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
                                        >
                                            <div id={`inner-rnd-${loc.id}`} className={`location-pin relative pt-2 transition-transform`}>
                                                <MapPin size={48} className="text-red-500 fill-white/90 drop-shadow-md" strokeWidth={1.5} />
                                            </div>
                                            <span className="text-[10px] font-bold text-charcoal bg-white/90 border border-charcoal/10 px-1.5 py-0.5 rounded shadow-sm mt-1 max-w-[140px] text-center drop-shadow transition-transform text-balance break-words">
                                                {loc.name}
                                            </span>
                                            
                                            {/* Hover overlay for View Mode */}
                                            {!isEditMode && (
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[120px] flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto mt-4">
                                                    <Link 
                                                        to={`/locations/${loc.id}`}
                                                        className="bg-tan text-white text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full hover:bg-charcoal transition-colors shadow-lg"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        View Shelf
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* Inner Region Box Content (Clipped) */
                                        <div 
                                            id={`inner-rnd-${loc.id}`}
                                            onMouseDown={(e) => handlePointDown(loc.id, e)}
                                            onTouchStart={(e) => handlePointDown(loc.id, e)}
                                            className={`location-box relative w-full h-full border-2 flex flex-col transition-all rounded-[4px]
                                                ${isEditMode ? 'border-tan/60 bg-white/90 group-hover:shadow-md' : 'border-tan/40 bg-white/80 hover:bg-white hover:border-tan hover:shadow-md hover:scale-[1.01]'}
                                        `}
                                        style={{
                                            boxShadow: isEditMode ? '0 0 0 2px rgba(196, 164, 132, 0.3)' : 'none',
                                            transform: `rotate(${coords.rotation || 0}deg)`,
                                            transformOrigin: 'center'
                                        }}>
                                            <div className="flex-1 flex flex-col justify-center items-center p-0.5 text-center h-full w-full overflow-visible z-10 pointer-events-none">
                                                <h4 className="font-serif font-bold text-charcoal w-full leading-[1.05] drop-shadow-sm" 
                                                    style={{ 
                                                        fontSize: `${Math.max(7, Math.min(18, Math.min(coords.width / 4, coords.height / 2.5)))}px`,
                                                        overflow: 'visible',
                                                        wordBreak: 'break-word'
                                                    }}>
                                                    <span className="bg-white/40 backdrop-blur-[1px] rounded-sm px-0.5 inline-block">
                                                        {loc.name}
                                                    </span>
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
                                    )}
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
