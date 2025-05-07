'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LocationSearchProps {
  value: string
  onChange: (value: string) => void
  onLocationSelect: (location: { address: string; lat: number; lng: number }) => void
  className?: string
}

interface NominatimResult {
  place_id: number
  licence: string
  osm_type: string
  osm_id: number
  boundingbox: string[]
  lat: string
  lon: string
  display_name: string
  class: string
  type: string
  importance: number
}

// Cache for storing search results
type CacheRecord = {
  results: NominatimResult[];
  timestamp: number;
  query: string;
};

// Create a module-level cache to persist between component instances
const searchCache = new Map<string, CacheRecord>();
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function LocationSearch({ 
  value, 
  onChange, 
  onLocationSelect,
  className 
}: LocationSearchProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  
  // Update internal value when prop changes
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value)
    }
  }, [value, inputValue])
  
  // Handle clicks outside the component to hide results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
        setHighlightedIndex(-1)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clean cached results that are older than the expiry time
  const cleanCache = useCallback(() => {
    const now = Date.now();
    for (const [key, record] of searchCache.entries()) {
      if (now - record.timestamp > CACHE_EXPIRY_MS) {
        searchCache.delete(key);
      }
    }
  }, []);
  
  // Function to get normalized cache key
  const getCacheKey = useCallback((query: string): string => {
    return query.trim().toLowerCase();
  }, []);

  // Memoize the check for showing empty results message
  const showEmptyResults = useMemo(() => {
    return showResults && inputValue.trim().length >= 3 && results.length === 0 && !isSearching;
  }, [showResults, inputValue, results.length, isSearching]);

  // Search for locations using Nominatim API with caching and request cancellation
  const searchLocations = useCallback(async (query: string) => {
    // Don't search if query is too short
    if (!query.trim() || query.length < 3) {
      setResults([])
      setIsSearching(false)
      return
    }
    
    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    const cacheKey = getCacheKey(query);
    
    // Check cache first
    if (searchCache.has(cacheKey)) {
      const cachedData = searchCache.get(cacheKey)!;
      setResults(cachedData.results);
      setShowResults(true);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true)
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=0`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'Dynasty Web App'
          },
          signal
        }
      )
      
      if (!response.ok) {
        throw new Error('Failed to fetch location data')
      }
      
      const data: NominatimResult[] = await response.json()
      
      // Cache the results
      searchCache.set(cacheKey, {
        results: data,
        timestamp: Date.now(),
        query
      });
      
      // Clean old cache entries occasionally
      if (Math.random() < 0.1) { // 10% chance to clean on each request
        cleanCache();
      }
      
      setResults(data)
      setShowResults(true)
    } catch (error) {
      // Only log error if it's not an abort error
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Error searching locations:', error)
      }
      setResults([])
    } finally {
      setIsSearching(false)
      abortControllerRef.current = null;
    }
  }, [getCacheKey, cleanCache])
  
  // Debounce search with useEffect cleanup
  useEffect(() => {
    const timer = setTimeout(() => {
      searchLocations(inputValue)
    }, 300) // Reduced from 500ms to 300ms for better responsiveness
    
    return () => clearTimeout(timer)
  }, [inputValue, searchLocations])
  
  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && resultsContainerRef.current) {
      const highlightedEl = resultsContainerRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex]);
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    onChange(value)
    setHighlightedIndex(-1)
    
    if (value.trim()) {
      setShowResults(true)
    } else {
      setShowResults(false)
    }
  }
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          selectLocation(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowResults(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };
  
  // Handle location selection
  const selectLocation = useCallback((location: NominatimResult) => {
    setInputValue(location.display_name)
    onChange(location.display_name)
    onLocationSelect({
      address: location.display_name,
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon)
    })
    setShowResults(false)
    setHighlightedIndex(-1)
  }, [onChange, onLocationSelect]);
  
  return (
    <div className={cn("relative", className)} ref={searchRef}>
      <div className="flex items-center">
        <MapPin className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search for a location"
          className="border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
          onFocus={() => inputValue.trim().length >= 3 && setShowResults(true)}
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls="location-results"
          aria-activedescendant={highlightedIndex >= 0 ? `location-item-${highlightedIndex}` : undefined}
        />
      </div>
      
      {isSearching && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        </div>
      )}
      
      {showResults && results.length > 0 && (
        <div 
          id="location-results"
          ref={resultsContainerRef}
          className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto"
          role="listbox"
        >
          {results.map((result, index) => (
            <div
              id={`location-item-${index}`}
              key={result.place_id}
              className={cn(
                "px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm",
                highlightedIndex === index && "bg-[#0A5C36]/10"
              )}
              onClick={() => selectLocation(result)}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
              aria-selected={highlightedIndex === index}
            >
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{result.display_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {showEmptyResults && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200 p-4 text-center text-sm text-gray-500">
          No locations found. Try a different search term.
        </div>
      )}
    </div>
  )
} 