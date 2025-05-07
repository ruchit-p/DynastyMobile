"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Map as LeafletMap, Marker, Icon } from "leaflet"
import "leaflet/dist/leaflet.css"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, MapPin } from "lucide-react"

interface LocationPickerProps {
  onLocationSelect: (location: { lat: number; lng: number; address: string }) => void
  defaultLocation?: { lat: number; lng: number; address: string }
  isOpen: boolean
  onClose: () => void
}

interface SearchResult {
  lat: string
  lon: string
  display_name: string
}

// Chicago coordinates as default fallback
const CHICAGO_LOCATION = {
  lat: 41.8781,
  lng: -87.6298
}

// Fix for Leaflet's default icon
const customIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

export default function LocationPicker({ onLocationSelect, defaultLocation, isOpen, onClose }: LocationPickerProps) {
  // Core state
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedLocation, setSelectedLocation] = useState(defaultLocation)
  const [isDraggingPin, setIsDraggingPin] = useState(false)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  
  // Refs
  const mapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragPinRef = useRef<SVGSVGElement>(null)
  
  // Map references - kept in refs to avoid re-renders
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null)

  // ===== CORE MAP FUNCTIONALITY =====

  // Clean up map and marker instances to prevent memory leaks
  const cleanupMap = useCallback(() => {
    if (markerRef.current) {
      try {
        markerRef.current.remove();
      } catch (error) {
        console.error("Error removing marker:", error);
      }
      markerRef.current = null;
    }
    
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch (error) {
        console.error("Error removing map:", error);
      }
      mapInstanceRef.current = null;
    }
  }, []);

  // Update the marker position on the map
  const updateMarker = useCallback((location: { lat: number; lng: number }) => {
    if (!mapInstanceRef.current) return;
    
    const L = window.L; // Use global L that's already loaded
    
    if (markerRef.current) {
      markerRef.current.setLatLng([location.lat, location.lng]);
    } else {
      markerRef.current = L.marker([location.lat, location.lng], { icon: customIcon })
        .addTo(mapInstanceRef.current);
    }
    
    mapInstanceRef.current.setView([location.lat, location.lng], 13);
  }, []);

  // Reverse geocode to get address from coordinates
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      const address = data.display_name;
      setSelectedLocation({ lat, lng, address });
      onLocationSelect({ lat, lng, address });
    } catch (error) {
      console.error("Error reverse geocoding:", error);
    }
  }, [onLocationSelect]);

  // Get user's location or fall back to Chicago
  const getUserLocation = useCallback(() => {
    setIsLoadingLocation(true);
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          if (mapInstanceRef.current) {
            updateMarker(userLocation);
            reverseGeocode(userLocation.lat, userLocation.lng);
          }
          setIsLoadingLocation(false);
        },
        (error) => {
          console.log("Geolocation error or denied:", error);
          // Fall back to Chicago
          if (mapInstanceRef.current) {
            updateMarker(CHICAGO_LOCATION);
            reverseGeocode(CHICAGO_LOCATION.lat, CHICAGO_LOCATION.lng);
          }
          setIsLoadingLocation(false);
        }
      );
    } else {
      // Fall back to Chicago if geolocation is not supported
      if (mapInstanceRef.current) {
        updateMarker(CHICAGO_LOCATION);
        reverseGeocode(CHICAGO_LOCATION.lat, CHICAGO_LOCATION.lng);
      }
      setIsLoadingLocation(false);
    }
  }, [updateMarker, reverseGeocode]);

  // Check location permission status
  useEffect(() => {
    if (!isOpen) return;
    
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        setHasLocationPermission(result.state === "granted");
        
        // Listen for permission changes
        result.addEventListener("change", () => {
          setHasLocationPermission(result.state === "granted");
        });
      });
    }
  }, [isOpen]);

  // Handle clicks outside the component
  useEffect(() => {
    if (!isOpen) return;
    
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node) &&
        !(event.target as Element)?.closest('.leaflet-control') &&
        !(event.target as Element)?.closest('.leaflet-popup')
      ) {
        onClose();
      }
    }
    
    // Delay adding the click handler to avoid immediate closure
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 500);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ===== MAP INITIALIZATION AND CLEANUP =====
  
  // Initialize and manage the Leaflet map
  useEffect(() => {
    if (!isOpen || !mapRef.current) {
      if (!isOpen) {
        cleanupMap();
      }
      return;
    }
    
    // Prevent multiple initializations
    if (mapInstanceRef.current) {
      return;
    }
    
    // Make sure Leaflet is loaded globally just once
    if (!window.L) {
      // Create a script tag to load Leaflet
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      
      script.onload = initializeMap;
      
      document.head.appendChild(script);
      
      // Add Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }
    } else {
      // Leaflet is already loaded, initialize map directly
      initializeMap();
    }
    
    function initializeMap() {
      // Ensure the map ref is still valid
      if (!mapRef.current || !isOpen) return;
      
      // Ensure the container has proper dimensions
      const container = mapRef.current;
      if (container.clientHeight === 0 || container.clientWidth === 0) {
        // Try again in 100ms if the container isn't sized yet
        setTimeout(initializeMap, 100);
        return;
      }
      
      // Create a new Leaflet map
      const L = window.L;
      const initialLocation = defaultLocation || selectedLocation || CHICAGO_LOCATION;
      
      try {
        // Simple, direct initialization with minimal options
        const map = L.map(container, {
          center: [initialLocation.lat, initialLocation.lng],
          zoom: 13,
          attributionControl: true,
          zoomControl: true
        });
        
        // Prevent map interactions from closing the picker
        container.addEventListener('mousedown', e => e.stopPropagation());
        container.addEventListener('touchstart', e => e.stopPropagation());
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Add the initial marker
        markerRef.current = L.marker([initialLocation.lat, initialLocation.lng], { 
          icon: customIcon,
          draggable: true
        }).addTo(map);
        
        // Handle marker drag events
        markerRef.current.on('dragend', function(e) {
          const marker = e.target;
          const position = marker.getLatLng();
          reverseGeocode(position.lat, position.lng);
        });
        
        // Handle map click
        map.on('click', function(e) {
          updateMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });
        
        // Save map reference
        mapInstanceRef.current = map;
        
        // Get user location if needed
        if (hasLocationPermission && !defaultLocation && !selectedLocation) {
          getUserLocation();
        }
        
        // Handle window resize
        const handleResize = () => {
          if (map && document.body.contains(container)) {
            map.invalidateSize();
          }
        };
        
        window.addEventListener('resize', handleResize);
        
        // Ensure the map renders correctly
        setTimeout(() => {
          if (map && document.body.contains(container)) {
            map.invalidateSize();
          }
        }, 300);
        
        // Return cleanup function for this inner effect
        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    }
    
    // Cleanup when the component is unmounted or closed
    return () => {
      if (!isOpen) {
        cleanupMap();
      }
    };
  }, [isOpen, defaultLocation, selectedLocation, hasLocationPermission, getUserLocation, cleanupMap, reverseGeocode, updateMarker]);

  // Update marker when defaultLocation changes
  useEffect(() => {
    if (!defaultLocation || !mapInstanceRef.current) return;
    updateMarker(defaultLocation);
  }, [defaultLocation, updateMarker]);

  // ===== UI INTERACTION HANDLERS =====

  const searchAddress = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.trim())}&limit=5`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Error searching address:", error);
    }
  }

  const handleAddressSelect = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    updateMarker({ lat, lng });
    setSelectedLocation({ lat, lng, address: result.display_name });
    onLocationSelect({ lat, lng, address: result.display_name });
    setSearchResults([]);
    setSearchQuery("");
  }

  const handleDragStart = (e: React.DragEvent) => {
    setIsDraggingPin(true);
    e.dataTransfer.setData("text/plain", "pin");
    if (e.dataTransfer.setDragImage && dragPinRef.current) {
      e.dataTransfer.setDragImage(dragPinRef.current, 15, 30);
    }
  }

  const handleMapDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!mapInstanceRef.current || !mapRef.current) return;
    
    const mapRect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - mapRect.left;
    const y = e.clientY - mapRect.top;
    
    // Convert the drop point to lat/lng coordinates
    const point = mapInstanceRef.current.containerPointToLatLng([x, y]);
    updateMarker({ lat: point.lat, lng: point.lng });
    reverseGeocode(point.lat, point.lng);
    setIsDraggingPin(false);
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchAddress();
    }
  }

  // ===== COMPONENT RENDER =====

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="relative">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Search for a location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
          <Button 
            type="button" 
            variant="outline" 
            onClick={(e) => {
              e.stopPropagation();
              searchAddress();
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          {isLoadingLocation && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-sm rounded-lg flex items-center justify-center z-20">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-md shadow-lg">
                <div className="h-4 w-4 border-2 border-[#0A5C36] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Getting location...</span>
              </div>
            </div>
          )}
          <div
            ref={mapRef}
            className="h-[300px] w-full rounded-lg border"
            style={{ 
              minHeight: "300px", 
              width: "100%", 
              position: "relative", 
              display: "block",
              overflow: "hidden"
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleMapDrop}
            onClick={(e) => e.stopPropagation()}
          />
          
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white border rounded-md shadow-lg max-h-[200px] overflow-y-auto z-20">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddressSelect(result);
                  }}
                >
                  <MapPin className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="text-sm line-clamp-2">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-12 flex flex-col items-center">
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={() => setIsDraggingPin(false)}
            className="cursor-move"
            title="Drag to map"
          >
            <svg
              ref={dragPinRef}
              width="30"
              height="40"
              viewBox="0 0 30 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={`transition-transform ${isDraggingPin ? 'scale-150' : 'hover:scale-110'}`}
            >
              <path
                d="M15 0C6.71573 0 0 6.71573 0 15C0 23.2843 15 40 15 40C15 40 30 23.2843 30 15C30 6.71573 23.2843 0 15 0ZM15 20C12.2386 20 10 17.7614 10 15C10 12.2386 12.2386 10 15 10C17.7614 10 20 12.2386 20 15C20 17.7614 17.7614 20 15 20Z"
                fill="#0A5C36"
              />
            </svg>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">Drag pin to map</p>
        </div>
      </div>

      {selectedLocation && (
        <div className="bg-white rounded-lg border p-3">
          <p className="text-sm text-gray-600 line-clamp-3 hover:line-clamp-none transition-all">
            Selected: {selectedLocation.address}
          </p>
        </div>
      )}
    </div>
  )
}

// Add Leaflet to the Window global for TypeScript
declare global {
  interface Window {
    L: typeof import("leaflet");
  }
} 