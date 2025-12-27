"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSearchParams } from 'next/navigation';

// API Configuration - use relative path for Vercel, or env var for local dev
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Fix Leaflet icon issue in Next.js
const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

// Component to handle map events and updates
function MapController({
    onMove,
    center
}: {
    onMove: (lat: number, lon: number) => void,
    center: { lat: number, lon: number }
}) {
    const map = useMap();

    // Update center when prop changes
    useEffect(() => {
        map.setView([center.lat, center.lon], map.getZoom());
    }, [center, map]);

    useMapEvents({
        mousemove: (e) => {
            onMove(e.latlng.lat, e.latlng.lng);
        },
        moveend: () => {
            const c = map.getCenter();
            onMove(c.lat, c.lng);
        }
    });

    return null;
}

export default function MapComponent() {
    const [center, setCenter] = useState({ lat: 37.7749, lon: -122.4194 });
    const [cursorLoc, setCursorLoc] = useState<{ lat: number, lon: number } | null>(null);
    const [address, setAddress] = useState<string>("Hover map to see address");
    const [loading, setLoading] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchError, setSearchError] = useState("");
    const searchParams = useSearchParams();

    // Dark mode state
    const [isDarkMode, setIsDarkMode] = useState(false);

    const [aliases, setAliases] = useState<Array<{ alias: string, lat: number, lon: number }>>([]);

    // Fetch aliases on mount
    useEffect(() => {
        const fetchAliases = async () => {
            try {
                const res = await fetch(`${API_URL}/aliases`);
                if (res.ok) {
                    const data = await res.json();
                    setAliases(data);
                }
            } catch (e) {
                console.error("Failed to fetch aliases", e);
            }
        };
        fetchAliases();
        // Poll every 5 seconds to keep map updated
        const interval = setInterval(fetchAliases, 5000);
        return () => clearInterval(interval);
    }, []);

    const [currentLang, setCurrentLang] = useState<'en' | 'sw' | 'ar' | 'fr' | 'es' | 'de' | 'zh'>('en');

    const fetchAddress = useCallback(async (lat: number, lon: number) => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/encode?lat=${lat}&lon=${lon}&lang=${currentLang}`);
            if (res.ok) {
                const data = await res.json();
                setAddress(data.words);
            }
        } catch (e) {
            setAddress("Error connecting to API");
        } finally {
            setLoading(false);
        }
    }, [currentLang]);

    // Update address when language changes
    useEffect(() => {
        if (cursorLoc) {
            fetchAddress(cursorLoc.lat, cursorLoc.lon);
        }
    }, [currentLang, cursorLoc, fetchAddress]);

    // Handle URL Deep Linking
    useEffect(() => {
        const query = searchParams.get('q') || searchParams.get('address');
        if (query && !loading) {
            setSearchInput(query);
            const performSearch = async () => {
                // 1. Try Locates.me Address
                if (query.includes('.') && query.split('.').length >= 3) {
                    try {
                        const res = await fetch(`${API_URL}/resolve?address=${query}&lang=${currentLang}`);
                        if (res.ok) {
                            const data = await res.json();
                            setCenter({ lat: data.lat, lon: data.lon });
                            setCursorLoc({ lat: data.lat, lon: data.lon });
                            setAddress(data.words);
                            return;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
                // ...
            };
            performSearch();
        }
    }, [searchParams, loading, fetchAddress, currentLang]);

    // Debounce mouse move
    useEffect(() => {
        if (!cursorLoc) return;
        const timer = setTimeout(() => {
            fetchAddress(cursorLoc.lat, cursorLoc.lon);
        }, 100);
        return () => clearTimeout(timer);
    }, [cursorLoc, fetchAddress]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setSearchError("");
        const input = searchInput.trim();
        if (!input) return;

        // 1. Try Locates.me Address (Word.Word...)
        if (input.includes('.') && input.split('.').length >= 3) {
            try {
                const res = await fetch(`${API_URL}/resolve?address=${input}&lang=en`);
                if (res.ok) {
                    const data = await res.json();
                    setCenter({ lat: data.lat, lon: data.lon });
                    setCursorLoc({ lat: data.lat, lon: data.lon }); // Update address display too
                    return;
                }
            } catch (e) {
                console.error(e);
            }
        }

        // 2. Try Lat, Lon
        if (input.includes(',')) {
            const parts = input.split(',');
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    setCenter({ lat, lon });
                    setCursorLoc({ lat, lon });
                    return;
                }
            }
        }

        // 3. Try OSM Nominatim (Place Search)
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);
                    setCenter({ lat, lon });
                    setCursorLoc({ lat, lon });
                    return;
                } else {
                    setSearchError("Location not found");
                }
            }
        } catch (e) {
            setSearchError("Search failed");
        }
    };

    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [claimAlias, setClaimAlias] = useState("");
    const [claimStatus, setClaimStatus] = useState<"idle" | "success" | "error">("idle");
    const [claimMessage, setClaimMessage] = useState("");

    const handleClaim = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cursorLoc) return;

        try {
            const res = await fetch(`${API_URL}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alias: claimAlias,
                    lat: cursorLoc.lat,
                    lon: cursorLoc.lon
                })
            });

            const data = await res.json();

            if (res.ok) {
                setClaimStatus("success");
                setClaimMessage(data.message);
                setAddress(claimAlias); // Update display immediately
                setTimeout(() => {
                    setIsClaimModalOpen(false);
                    setClaimStatus("idle");
                    setClaimAlias("");
                }, 2000);
            } else {
                setClaimStatus("error");
                setClaimMessage(data.detail || "Failed to claim");
            }
        } catch (e) {
            setClaimStatus("error");
            setClaimMessage("Network error");
        }
    };

    const handleCopy = () => {
        if (address && !address.includes("Hover")) {
            navigator.clipboard.writeText(address);
            // Could add a toast here, but for now just visual feedback on the button
            const btn = document.getElementById("copy-btn");
            if (btn) {
                const originalText = btn.innerText;
                btn.innerText = "COPIED!";
                setTimeout(() => btn.innerText = originalText, 2000);
            }
        }
    };

    return (
        <div className="w-full h-screen relative font-sans text-gray-900 overflow-hidden">
            {/* Map Container */}
            <MapContainer
                center={[center.lat, center.lon]}
                zoom={14}
                zoomControl={false}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                {/* Current Location Marker */}
                <Marker position={[center.lat, center.lon]} icon={icon} />

                {/* Claimed Spots Markers */}
                {aliases.map((a, i) => (
                    <Marker
                        key={i}
                        position={[a.lat, a.lon]}
                        icon={L.divIcon({
                            className: 'custom-icon',
                            html: `<div style="background-color: #FBBF24; border: 2px solid black; width: 12px; height: 12px; border-radius: 50%;"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        })}
                    >
                        <Popup>
                            <div className="text-center">
                                <div className="text-xs font-bold text-gray-500 uppercase">SOVEREIGN PLATE</div>
                                <div className="text-lg font-black text-black">{a.alias}</div>
                            </div>
                        </Popup>
                    </Marker>
                ))}

                <MapController
                    center={center}
                    onMove={(lat, lon) => setCursorLoc({ lat, lon })}
                />
            </MapContainer>

            {/* Brand Header */}
            <div className="absolute top-6 left-6 z-[1000] pointer-events-none">
                <h1 className={`text-4xl font-extrabold tracking-tighter drop-shadow-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    Locates<span className={isDarkMode ? 'text-white' : 'text-gray-800'}>.me</span>
                </h1>
                <p className={`text-xs font-medium tracking-widest uppercase mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Sovereign Global Addressing
                </p>
                {/* Claimed Counter Badge */}
                {aliases.length > 0 && (
                    <div className="mt-3 pointer-events-auto">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black text-xs font-bold shadow-lg animate-pulse">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {aliases.length} plates claimed
                        </span>
                    </div>
                )}
            </div>

            {/* Top Right Controls */}
            <div className="absolute top-6 right-6 z-[1000] flex items-center gap-3">
                {/* Dark Mode Toggle */}
                <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`p-3 rounded-xl shadow-lg transition-all ${isDarkMode ? 'bg-gray-800 text-yellow-400' : 'bg-white/90 text-gray-600'} hover:scale-105`}
                    title="Toggle Dark Mode"
                >
                    {isDarkMode ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        </svg>
                    )}
                </button>

                {/* Language Switcher */}
                <div className="relative group">
                    <select
                        value={currentLang}
                        onChange={(e) => setCurrentLang(e.target.value as 'en' | 'sw' | 'ar' | 'fr' | 'es' | 'de' | 'zh')}
                        className={`appearance-none font-bold text-sm py-3 pl-4 pr-10 rounded-xl shadow-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all ${isDarkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white/90 backdrop-blur-md text-gray-800 border-white/50'}`}
                    >
                        <option value="en">🇺🇸 English</option>
                        <option value="fr">🇫🇷 French</option>
                        <option value="es">🇪🇸 Spanish</option>
                        <option value="de">🇩🇪 German</option>
                        <option value="zh">🇨🇳 Chinese</option>
                        <option value="ar">🇪🇬 Arabic</option>
                        <option value="sw">🇰🇪 Swahili</option>
                    </select>
                    <div className={`absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>
            {/* Search Bar - Centered Top */}
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000] w-[90%] max-w-lg">
                <form onSubmit={handleSearch} className={`flex shadow-2xl rounded-2xl overflow-hidden border ring-1 transition-all focus-within:ring-2 focus-within:ring-blue-500/50 ${isDarkMode ? 'border-gray-700 ring-gray-700' : 'border-white/50 ring-black/5'}`}>
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search place, coords, or address..."
                        className={`flex-1 px-6 py-4 backdrop-blur-md placeholder-gray-400 focus:outline-none text-lg ${isDarkMode ? 'bg-gray-800/90 text-white' : 'bg-white/90 text-gray-800'}`}
                    />
                    <button type="submit" className="bg-blue-600 text-white px-6 py-4 font-bold hover:bg-blue-700 transition flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                </form>
                {searchError && (
                    <div className="bg-red-500/90 backdrop-blur text-white text-xs px-4 py-2 rounded-xl mt-2 text-center shadow-lg inline-block mx-auto w-full animate-bounce">
                        {searchError}
                    </div>
                )}
            </div>

            {/* Address Card - Bottom Center */}
            <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-[1000] w-[90%] max-w-md">
                <div className={`backdrop-blur-xl p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border ring-1 transition-all hover:scale-[1.02] ${isDarkMode ? 'bg-gray-900/80 border-gray-700 ring-gray-700' : 'bg-white/80 border-white/50 ring-black/5'}`}>
                    <div className="text-center">
                        <h2 className={`text-xs font-bold uppercase tracking-[0.2em] mb-3 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>Current Location Address</h2>

                        <div className="relative group cursor-pointer" onClick={handleCopy}>
                            <div className={`text-3xl md:text-4xl font-black font-mono leading-tight break-words py-2 ${isDarkMode ? 'text-white' : 'bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700'}`} dir={currentLang === 'ar' ? 'rtl' : 'ltr'}>
                                {loading ? <span className="animate-pulse text-gray-400">Loading...</span> : address}
                            </div>
                            <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl ${isDarkMode ? 'bg-gray-800/80' : 'bg-white/50 backdrop-blur-sm'}`}>
                                <span className={`text-sm font-bold px-3 py-1 rounded-full shadow-sm ${isDarkMode ? 'text-white bg-gray-700' : 'text-gray-800 bg-white'}`}>Click to Copy</span>
                            </div>
                        </div>

                        <div className={`flex items-center justify-center gap-4 mt-4 text-sm font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {cursorLoc && (
                                <>
                                    <span className={`px-2 py-1 rounded-md ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>{cursorLoc.lat.toFixed(5)}</span>
                                    <span className={isDarkMode ? 'text-gray-600' : 'text-gray-300'}>|</span>
                                    <span className={`px-2 py-1 rounded-md ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>{cursorLoc.lon.toFixed(5)}</span>
                                </>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                id="copy-btn"
                                onClick={handleCopy}
                                className={`flex-1 py-3 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-sm ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-900 hover:bg-black text-white'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                COPY
                            </button>
                            <button
                                onClick={() => setIsClaimModalOpen(true)}
                                className="flex-1 py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 text-sm shadow-lg shadow-yellow-500/30"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                CLAIM
                            </button>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-4">
                    <p className={`text-[10px] font-medium inline-block px-3 py-1 rounded-full backdrop-blur-sm ${isDarkMode ? 'text-gray-400 bg-gray-800/50' : 'text-gray-500 bg-white/50'}`}>
                        Powered by H3 • Offline Capable • Sovereign
                    </p>
                </div>
            </div>

            {/* Claim Modal */}
            {isClaimModalOpen && (
                <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-100">
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-black text-gray-900">Mint Your Sovereign Plate</h3>
                            <p className="text-gray-500 text-sm mt-2">
                                Just like a custom number plate, this alias is <b>unique</b> to you.
                                It maps directly to this exact 6.3m² hexagon.
                            </p>
                        </div>

                        <form onSubmit={handleClaim}>
                            <div className="mb-8 flex justify-center">
                                {/* License Plate Visualization */}
                                <div className="bg-yellow-400 border-4 border-black rounded-lg px-6 py-3 shadow-xl transform rotate-1">
                                    <div className="text-xs font-bold text-center uppercase tracking-widest mb-1 border-b-2 border-black/20 pb-1">SOVEREIGN • LOCATES.ME</div>
                                    <div className="text-3xl font-mono font-black text-black uppercase tracking-widest text-center min-w-[200px]">
                                        {claimAlias || "YOUR.TAG"}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Choose Your Unique ID</label>
                                <input
                                    type="text"
                                    value={claimAlias}
                                    onChange={(e) => setClaimAlias(e.target.value.toUpperCase())}
                                    placeholder="e.g. MY.PENTHOUSE.01"
                                    className="w-full px-4 py-3 bg-gray-100 rounded-xl font-mono text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 uppercase text-center tracking-widest"
                                    autoFocus
                                />
                                <p className="text-[10px] text-gray-400 mt-2 text-center">
                                    Allowed: Letters, Numbers, Dots. Minimum 3 characters.
                                </p>
                            </div>

                            {claimStatus === 'error' && (
                                <div className="mb-4 text-red-500 text-sm font-bold text-center bg-red-50 p-2 rounded-lg border border-red-100">
                                    {claimMessage}
                                </div>
                            )}

                            {claimStatus === 'success' && (
                                <div className="mb-4 text-green-600 text-sm font-bold text-center bg-green-50 p-2 rounded-lg border border-green-100">
                                    {claimMessage}
                                </div>
                            )}

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsClaimModalOpen(false)}
                                    className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-black text-yellow-400 font-bold rounded-xl hover:bg-gray-900 transition shadow-lg flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    MINT PLATE
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

