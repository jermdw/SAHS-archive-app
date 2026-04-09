import React, { useState, useEffect, useRef, Fragment } from 'react';
import { Rnd } from 'react-rnd';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, getDoc, writeBatch, setDoc } from 'firebase/firestore';
import { Plus, MapPin, ZoomIn, ZoomOut, Maximize, Edit3, X, BoxSelect, Maximize2, RotateCw, LayoutGrid } from 'lucide-react';
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
    const [isSnapping] = useState(true);
    const [displayStyle] = useState<'box' | 'pin'>('box');
    const absoluteSnap = (val: number) => isSnapping ? Math.round(val / 12) * 12 : val;

    // Structural Rooms
    const [rooms, setRooms] = useState<Room[]>([]);
    
    // Multi-select and Drag tracking
    const selectedIdsRef = useRef<Set<string>>(new Set());
    const dragStartPosRef = useRef<Record<string, {x: number, y: number}>>({});
    const [, setSelectionTick] = useState(0); // For triggering UI buttons reacting to ref changes
    const [sidebarPos, setSidebarPos] = useState({ x: 32, y: 96 });
    const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
    const [resizingRoomId, setResizingRoomId] = useState<string | null>(null);
    const [activeDimensions, setActiveDimensions] = useState<{ width: number, height: number } | null>(null);

    // History and Undo tracking
    const [, setHistory] = useState<LayoutHistoryState[]>([]);
    
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



    const handleMergeRooms = async () => {
        const selectedArr = Array.from(selectedIdsRef.current);
        const selectedRooms = rooms.filter(r => selectedArr.includes(r.docId || r.id));
        
        if (selectedRooms.length < 2) {
            alert("Please select at least 2 rooms to merge together.");
            return;
        }

        const confirmMsg = `Merge these ${selectedRooms.length} rooms ("${selectedRooms.map(r => r.name).join('", "')}") into ONE single room entity? \n\nThis will permanently: \n1. Reconcile all archive locations into the new room.\n2. Delete redundant room files from your database.`;
        if (!window.confirm(confirmMsg)) return;

        setIsSaving(true);
        saveSnapshot();
        try {
            // Master room (the first one)
            const masterRoom = selectedRooms[0];
            const subRooms = selectedRooms.slice(1);
            
            // Collect all geometries
            const allGeometries: Array<any> = [];
            selectedRooms.forEach(room => {
                if (room.geometries && room.geometries.length > 0) {
                    allGeometries.push(...room.geometries);
                } else if (room.map_coordinates) {
                    allGeometries.push(room.map_coordinates);
                }
            });

            // 1. Update Master Room in Firestore
            await updateDoc(doc(db, 'rooms', masterRoom.docId!), {
                geometries: allGeometries,
                map_coordinates: null // Clear legacy flat coordinates
            });

            // 2. Reconcile Locations: Find all locations pointing to sub-rooms and point them to master room
            const locReconcilePromises: Promise<any>[] = [];
            subRooms.forEach(sub => {
                locations.filter(l => l.room_id === sub.docId).forEach(loc => {
                    locReconcilePromises.push(updateDoc(doc(db, 'locations', loc.docId!), {
                        room_id: masterRoom.docId
                    }));
                });
            });
            await Promise.all(locReconcilePromises);

            // 3. Delete Sub-Rooms from Firestore
            const deletePromises = subRooms.map(sub => deleteDoc(doc(db, 'rooms', sub.docId!)));
            await Promise.all(deletePromises);

            // 4. Update Local State
            setRooms(prev => {
                const filtered = prev.filter(r => !subRooms.some(sub => sub.docId === r.docId));
                return filtered.map(r => r.docId === masterRoom.docId ? { ...r, geometries: allGeometries, map_coordinates: null } : r);
            });

            // Clarify mapping of local locations
            setLocations(prev => prev.map(l => subRooms.some(sub => sub.docId === l.room_id) ? { ...l, room_id: masterRoom.docId } : l));

            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
            alert(`Drafting success! Rooms merged into "${masterRoom.name}".`);
        } catch (error) {
            console.error("Merging failed:", error);
            alert("Failed to merge rooms.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUnmergeRoom = async () => {
        if (!isEditMode || selectedIdsRef.current.size !== 1) return;
        const selectedId = Array.from(selectedIdsRef.current)[0];
        const roomToUnmerge = rooms.find(r => r.id === selectedId || r.docId === selectedId);
        
        if (!roomToUnmerge || !roomToUnmerge.geometries || roomToUnmerge.geometries.length <= 1) return;
        
        if(!window.confirm(`Unmerge "${roomToUnmerge.name}" back into ${roomToUnmerge.geometries.length} separate rooms?`)) return;

        setIsSaving(true);
        saveSnapshot();
        try {
            const mainGeom = roomToUnmerge.geometries[0];
            const extractedGeoms = roomToUnmerge.geometries.slice(1);

            // 1. Restore the main room to basic coords
            await updateDoc(doc(db, 'rooms', roomToUnmerge.docId!), {
                map_coordinates: mainGeom,
                geometries: null
            });

            // 2. Spawn completely independent rooms for the broken off pieces
            const newRooms: Room[] = [];
            for (let i = 0; i < extractedGeoms.length; i++) {
                const geom = extractedGeoms[i];
                const newRoomRef = doc(collection(db, 'rooms'));
                const newData = {
                    id: 'room_ext_' + Date.now() + '_' + i,
                    name: `${roomToUnmerge.name} (Part ${i+2})`,
                    created_at: new Date().toISOString(),
                    map_coordinates: geom
                };
                await setDoc(newRoomRef, newData);
                newRooms.push({ ...newData, docId: newRoomRef.id } as any);
            }

            // 3. Update UI
            setRooms(prev => {
                const updatedMain = prev.map(r => r.docId === roomToUnmerge.docId ? {
                    ...r,
                    map_coordinates: mainGeom,
                    geometries: undefined
                } : r);
                return [...updatedMain, ...newRooms];
            });

            selectedIdsRef.current.clear();
            setSelectionTick(t => t + 1);
            alert("Rooms unmerged successfully. You can now rename and move them independently.");
        } catch (error) {
            console.error("Unmerging failed:", error);
            alert("Failed to unmerge rooms.");
        } finally {
            setIsSaving(false);
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

    const handleItemSelection = (id: string, e: any) => {
        if (!isEditMode) return;
        const isShift = e.shiftKey;
        
        let stateChanged = false;

        // If not shift, clear previous selection...
        if (!isShift) {
            if (selectedIdsRef.current.size > 1 || !selectedIdsRef.current.has(id)) {
                selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
                selectedIdsRef.current.clear();
                stateChanged = true;
            }
        }

        if (selectedIdsRef.current.has(id)) {
            // Only toggle off if shift is held
            if (isShift) {
                selectedIdsRef.current.delete(id);
                setSelectionDOM(id, false);
                stateChanged = true;
            }
        } else {
            selectedIdsRef.current.add(id);
            setSelectionDOM(id, true);
            stateChanged = true;
        }
        
        if (stateChanged) {
            setSelectionTick(t => t + 1);
        }
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.react-draggable') || (e.target as HTMLElement).closest('button')) return;
        selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
        selectedIdsRef.current.clear();
        setSelectionTick(t => t + 1);
    };

    const handleGroupDragStart = (draggedId: string, _draggedIndex?: number, e?: any) => {
        if (!isEditMode) return;

        // Safety: If dragging an unselected item without shift, force it to be the sole selection
        if (!selectedIdsRef.current.has(draggedId) && (!e || !e.shiftKey)) {
            selectedIdsRef.current.forEach(sid => setSelectionDOM(sid, false));
            selectedIdsRef.current.clear();
            selectedIdsRef.current.add(draggedId);
            setSelectionDOM(draggedId, true);
            setSelectionTick(t => t + 1);
        }

        dragStartPosRef.current = {};
        
        // Track start position for EVERY selected item (and internal room geometries)
        selectedIdsRef.current.forEach(id => {
            const room = rooms.find(r => r.id === id || r.docId === id);
            
            if (room) {
                if (room.geometries && room.geometries.length > 0) {
                    room.geometries.forEach((g, gi) => {
                        dragStartPosRef.current[`${id}-geom-${gi}`] = { x: g.x, y: g.y };
                    });
                    // Main ID tracks the first geometry for calculations
                    dragStartPosRef.current[id] = { x: room.geometries[0].x, y: room.geometries[0].y };
                } else if (room.map_coordinates) {
                    dragStartPosRef.current[`${id}-geom-0`] = { x: room.map_coordinates.x, y: room.map_coordinates.y };
                    dragStartPosRef.current[id] = { x: room.map_coordinates.x, y: room.map_coordinates.y };
                }
            } else if (localCoords[id]) {
                dragStartPosRef.current[id] = { x: localCoords[id].x, y: localCoords[id].y };
            }
        });
    };

    const handleGroupDrag = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        const start = draggedIndex !== undefined 
            ? dragStartPosRef.current[`${draggedId}-geom-${draggedIndex}`] 
            : dragStartPosRef.current[draggedId];
        if (!start) return;
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        selectedIdsRef.current.forEach(id => {
            // Handle Room following (DOM Update)
            const roomNode = document.getElementById(`rnd-node-${id}`);
            if (roomNode && dragStartPosRef.current[id]) {
                roomNode.style.transform = `translate(${dragStartPosRef.current[id].x + offsetX}px, ${dragStartPosRef.current[id].y + offsetY}px)`;
            }

            // Handle Merged Room Sub-Geometries (DOM Update)
            const room = rooms.find(r => r.id === id || r.docId === id);
            if (room && room.geometries && room.geometries.length > 1) {
                room.geometries.forEach((_, gi) => {
                    const geomNode = document.getElementById(gi === 0 ? `rnd-node-${id}` : `inner-rnd-${id}-geom-${gi}`);
                    const gStart = dragStartPosRef.current[`${id}-geom-${gi}`];
                    if (geomNode && gStart) {
                        geomNode.style.transform = `translate(${gStart.x + offsetX}px, ${gStart.y + offsetY}px)`;
                    }
                });
            }

            // Handle Location following (DOM Update)
            const locNode = document.getElementById(`rnd-node-${id}`); // Reusing same ID pattern
            if (locNode && !roomNode && dragStartPosRef.current[id]) {
                locNode.style.transform = `translate(${dragStartPosRef.current[id].x + offsetX}px, ${dragStartPosRef.current[id].y + offsetY}px)`;
            }

            // Handle Room Label following
            const labelNode = document.getElementById(`room-label-${id}`);
            if (labelNode && dragStartPosRef.current[id]) {
                labelNode.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }
        });
    };

    const handleGroupDragStopStateSync = (draggedId: string, draggedIndex: number | undefined, d: { x: number, y: number }) => {
        const start = draggedIndex !== undefined 
            ? dragStartPosRef.current[`${draggedId}-geom-${draggedIndex}`] 
            : dragStartPosRef.current[draggedId];
        if (!start) return;
        const offsetX = d.x - start.x;
        const offsetY = d.y - start.y;

        saveSnapshot();

        // Update Rooms (including all internal geometries for merged rooms)
        setRooms(prev => prev.map(r => {
            const id = r.docId || r.id;
            if (selectedIdsRef.current.has(id)) {
                // If it has geometries, update all of them by the offset
                if (r.geometries && r.geometries.length > 0) {
                    return {
                        ...r,
                        geometries: r.geometries.map((gc: any, gi: number) => {
                            const gStart = dragStartPosRef.current[`${id}-geom-${gi}`] || gc;
                            return {
                                ...gc,
                                x: absoluteSnap(gStart.x + offsetX),
                                y: absoluteSnap(gStart.y + offsetY)
                            };
                        })
                    };
                }
                // Legacy single-coords room
                if (r.map_coordinates && dragStartPosRef.current[id]) {
                    return {
                        ...r,
                        map_coordinates: {
                            ...r.map_coordinates,
                            x: absoluteSnap(dragStartPosRef.current[id].x + offsetX),
                            y: absoluteSnap(dragStartPosRef.current[id].y + offsetY)
                        }
                    };
                }
            }
            return r;
        }));

        // Update Locations (Shelves)
        setLocalCoords(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(id => {
                if (selectedIdsRef.current.has(id) && dragStartPosRef.current[id]) {
                    next[id] = {
                        ...next[id],
                        x: absoluteSnap(dragStartPosRef.current[id].x + offsetX),
                        y: absoluteSnap(dragStartPosRef.current[id].y + offsetY)
                    };
                }
            });
            return next;
        });
        
        // Clear drag tracking
        dragStartPosRef.current = {};
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
                <Rnd
                    size={isSidebarMinimized ? { width: 220, height: 48 } : { width: 320, height: 480 }}
                    position={sidebarPos}
                    onDragStop={(_e, d) => setSidebarPos({ x: d.x, y: d.y })}
                    disableDragging={false}
                    enableResizing={!isSidebarMinimized}
                    bounds="parent"
                    className="z-30"
                >
                    <div className={`bg-white rounded-xl shadow-2xl border-2 border-tan overflow-hidden flex flex-col h-full ${isSidebarMinimized ? 'opacity-90' : ''}`}>
                        <div className="bg-tan/5 border-b border-tan-light/30 px-4 py-3 flex justify-between items-center cursor-move shrink-0">
                            <h3 className="font-serif font-bold text-charcoal flex items-center gap-2">
                                <LayoutGrid size={16} className="text-tan"/> Layout Tools
                            </h3>
                            <button onClick={() => setIsSidebarMinimized(!isSidebarMinimized)} className="p-1 hover:bg-tan/10 rounded transition-colors text-tan">
                                {isSidebarMinimized ? <Maximize2 size={16}/> : <X size={16}/>}
                            </button>
                        </div>

                        {!isSidebarMinimized && (
                            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                                {/* Diagnostic Stats */}
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="bg-tan/5 p-2 rounded-lg border border-tan/20">
                                        <p className="text-[10px] font-black uppercase text-tan/60 mb-0.5">Rooms</p>
                                        <p className="font-mono text-xs font-bold text-charcoal">{rooms.length} Loaded</p>
                                    </div>
                                    <div className="bg-charcoal/5 p-2 rounded-lg border border-charcoal/10">
                                        <p className="text-[10px] font-black uppercase text-charcoal/40 mb-0.5">Locations</p>
                                        <p className="font-mono text-xs font-bold text-charcoal">{locations.length} Total</p>
                                    </div>
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
                                        {selectedIdsRef.current.size >= 2 && (
                                            <button onClick={handleMergeRooms} className="w-full flex items-center justify-center gap-2 bg-tan text-white py-3 rounded-lg text-sm font-black uppercase tracking-widest shadow-md hover:bg-charcoal transition-all mb-4 animate-in zoom-in-95">
                                                Merge Selected Rooms
                                            </button>
                                        )}
                                        {(() => {
                                            const sl = selectedIdsRef.current.size === 1 ? rooms.find(r => r.docId === Array.from(selectedIdsRef.current)[0] || r.id === Array.from(selectedIdsRef.current)[0]) : null;
                                            return sl && sl.geometries && sl.geometries.length > 1 ? (
                                                <button onClick={handleUnmergeRoom} className="w-full flex items-center justify-center gap-2 bg-red-800/80 text-white py-3 rounded-lg text-sm font-black uppercase tracking-widest shadow-md hover:bg-red-700 transition-all mb-4 animate-in zoom-in-95">
                                                    Unmerge Block
                                                </button>
                                            ) : null;
                                        })()}
                                        <button onClick={()=>setIsBindingMode(true)} className="w-full flex items-center justify-center gap-2 bg-tan/10 text-tan border border-tan/30 border-dashed py-3 rounded-lg text-sm font-bold hover:bg-tan hover:text-white transition-all"><Plus size={18}/> Place Shelf Block</button>
                                        <button onClick={addRoom} className="w-full flex items-center justify-center gap-2 bg-charcoal/5 border py-3 rounded-lg text-sm font-bold hover:bg-charcoal hover:text-white transition-all"><BoxSelect size={18}/> New Structural Room</button>
                                        
                                        <div className="mt-4 pt-4 border-t border-tan-light/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="text-[10px] font-bold text-charcoal/40 uppercase tracking-widest leading-none">Unplaced Rooms</h4>
                                                {rooms.filter(r => !r.map_coordinates && (!r.geometries || r.geometries.length === 0)).length > 1 && (
                                                    <button onClick={placeAllUnplacedRooms} className="text-[9px] font-black uppercase text-tan hover:text-charcoal bg-tan/5 px-2 py-1 rounded transition-colors">Place All</button>
                                                )}
                                            </div>
                                            {rooms.filter(r => !r.map_coordinates && (!r.geometries || r.geometries.length === 0)).map(r => (
                                                <button key={r.docId} onClick={()=>placeExistingRoom(r.docId!)} className="w-full text-left text-xs bg-cream p-2 rounded mb-1 flex justify-between items-center hover:bg-tan/10 group font-bold">
                                                    {r.name} <Plus size={12} className="opacity-0 group-hover:opacity-100"/>
                                                </button>
                                            ))}
                                            {rooms.filter(r => !r.map_coordinates && (!r.geometries || r.geometries.length === 0)).length === 0 && <p className="text-[10px] italic text-charcoal/30 font-bold border border-dashed border-charcoal/10 p-2 rounded text-center">All rooms are currently on map</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Rnd>
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
                                const geometries = room.geometries || (room.map_coordinates ? [room.map_coordinates] : []);
                                if (geometries.length === 0) return null;

                                // Compute Bounding Box for Centering Label
                                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                geometries.forEach(g => {
                                    minX = Math.min(minX, g.x);
                                    minY = Math.min(minY, g.y);
                                    maxX = Math.max(maxX, g.x + g.width);
                                    maxY = Math.max(maxY, g.y + g.height);
                                });
                                const isSelected = selectedIdsRef.current.has(room.docId!);

                                const renderBox = (c: any, index: number) => (
                                    <Rnd
                                        key={`${room.docId}-box-${index}`}
                                        id={index === 0 ? `rnd-node-${room.docId}` : `inner-rnd-${room.docId}-geom-${index}`}
                                        onMouseDownCapture={(e: any) => handleItemSelection(room.docId!, e)}
                                        className={`absolute ${isEditMode ? 'cursor-move' : 'pointer-events-none'}`}
                                        style={{ 
                                            backgroundColor: 'rgba(210, 180, 140, 0.2)',
                                            border: isSelected ? '2px solid #3b82f6' : '2px solid rgba(139, 115, 85, 0.3)', // Thick 2px structural line
                                            zIndex: isSelected ? 50 : 5
                                        }}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode}
                                        position={{ x: c.x, y: c.y }}
                                        size={{ width: c.width, height: c.height }}
                                        onDragStart={(e: any) => handleGroupDragStart(room.docId!, index, e)}
                                        onDrag={(_e: any, d: any) => handleGroupDrag(room.docId!, index, d)}
                                        onDragStop={(_e: any, d: any) => handleGroupDragStopStateSync(room.docId!, index, d)}
                                        onResizeStart={() => {
                                            setResizingRoomId(`${room.docId}-${index}`);
                                            setActiveDimensions({ width: c.width, height: c.height });
                                        }}
                                        onResize={(_e: any, _dir: any, ref: any) => {
                                            setActiveDimensions({ 
                                                width: parseInt(ref.style.width, 10), 
                                                height: parseInt(ref.style.height, 10) 
                                            });
                                        }}
                                        onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, pos: any) => {
                                            saveSnapshot();
                                            setResizingRoomId(null);
                                            setActiveDimensions(null);
                                            setRooms(prev => prev.map(r => r.docId === room.docId ? {
                                                ...r,
                                                geometries: (r.geometries || (r.map_coordinates ? [r.map_coordinates] : [])).map((gc, gi) => gi === index ? { ...gc, x: pos.x, y: pos.y, width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10) } : gc)
                                            } : r));
                                        }}
                                    >
                                        <div className="w-full h-full relative">
                                            {/* Dimensional Feedback (Center on box being resized) */}
                                            {resizingRoomId === `${room.docId}-${index}` && activeDimensions && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                                                    <div className="bg-charcoal text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-white/20 whitespace-nowrap">
                                                        {(activeDimensions.width / PIXELS_PER_FOOT).toFixed(1)}' x {(activeDimensions.height / PIXELS_PER_FOOT).toFixed(1)}'
                                                    </div>
                                                </div>
                                            )}
                                            {/* Local Controls (Only on first box or selected) */}
                                            {isEditMode && (isSelected || index === 0) && (
                                                <div className="absolute top-1 right-1 flex gap-1 pointer-events-auto z-[60]">
                                                    <button onClick={(e) => rotateItem(room.docId!, 'room', c.rotation || 0, e)} className="bg-white/80 p-1 rounded hover:bg-white shadow-sm border border-tan/10"><RotateCw size={12}/></button>
                                                    <button onClick={(e) => removeFromMap(room.docId!, e)} className="bg-red-400 text-white p-1 rounded hover:bg-red-500 shadow-sm"><X size={12}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </Rnd>
                                );

                                return (
                                    <Fragment key={room.docId}>
                                        {/* Master Wall Layer (Bold Perimeter Outline) */}
                                        <div 
                                            className="absolute pointer-events-none z-10"
                                            style={{ 
                                                left: 0, 
                                                top: 0, 
                                                width: '100%', 
                                                height: '100%',
                                                // Create a bold 3px crisp "Wall" around the combined geometries
                                                filter: isSelected 
                                                    ? 'drop-shadow(3px 0px 0px #3b82f6) drop-shadow(-3px 0px 0px #3b82f6) drop-shadow(0px 3px 0px #3b82f6) drop-shadow(0px -3px 0px #3b82f6)'
                                                    : 'drop-shadow(3px 0px 0px #8b7355) drop-shadow(-3px 0px 0px #8b7355) drop-shadow(0px 3px 0px #8b7355) drop-shadow(0px -3px 0px #8b7355)'
                                            }}
                                        >
                                            {geometries.map((c, i) => (
                                                <div 
                                                    key={`${room.docId}-wall-${i}`} 
                                                    style={{ 
                                                        position: 'absolute', 
                                                        left: c.x, 
                                                        top: c.y, 
                                                        width: c.width, 
                                                        height: c.height,
                                                        backgroundColor: 'rgba(0,0,0,0.01)' // Almost invisible to prevent tinting, but sharp enough for the filter
                                                    }} 
                                                />
                                            ))}
                                        </div>

                                        {/* Unit Interaction Boxes (Invisible, but handle dragging/resizing) */}
                                        {geometries.map((c, i) => renderBox(c, i))}
                                        
                                        {/* Master Room Label (Centered over all boxes) */}
                                        <div 
                                            id={`room-label-${room.docId}`}
                                            className="absolute pointer-events-none flex items-center justify-center text-center z-40 transition-transform duration-75"
                                            style={{ 
                                                left: minX, 
                                                top: minY, 
                                                width: maxX - minX, 
                                                height: maxY - minY 
                                            }}
                                        >
                                            <span 
                                                className={`relative w-full px-2 text-center break-words font-serif font-bold text-charcoal flex flex-col items-center pointer-events-none transform transition-opacity ${isSelected ? 'opacity-100' : 'opacity-85'}`}
                                                style={{ 
                                                    textShadow: '0 0 10px white, 0 0 10px white, 0 0 5px white',
                                                    fontSize: 'min(20px, max(14px, 3vw))',
                                                    lineHeight: '1.1'
                                                }}
                                            >
                                                {room.name}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 h-[3px] w-12 bg-tan/60 shrink-0"></div>
                                            </span>
                                        </div>
                                    </Fragment>
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
                                        onMouseDownCapture={(e: any) => handleItemSelection(loc.id, e)}
                                        className={`absolute group ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
                                        scale={scale}
                                        disableDragging={!isEditMode}
                                        enableResizing={isEditMode && c.display_type !== 'pin'}
                                        position={{ x: c.x, y: c.y }}
                                        size={{ width: c.width, height: c.height }}
                                        onDragStart={(e: any) => handleGroupDragStart(loc.id, undefined, e)}
                                        onDrag={(_e, d: any) => handleGroupDrag(loc.id, undefined, d)}
                                        onDragStop={(_e, d: any) => handleGroupDragStopStateSync(loc.id, undefined, d)}
                                        onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                            saveSnapshot();
                                            setLocalCoords(prev => ({ ...prev, [loc.id]: { ...prev[loc.id], x: pos.x, y: pos.y, width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10) }}));
                                        }}
                                        onClickCapture={(e: any) => handleItemSelection(loc.id, e)}
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
                                                    <button onClick={(e: any) => rotateItem(loc.id, 'location', c.rotation || 0, e)} className="bg-white border p-1 rounded"><RotateCw size={10}/></button>
                                                    <button onClick={(e: any) => removeBlock(loc.id, e)} className="bg-red-400 text-white p-1 rounded"><X size={10}/></button>
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
