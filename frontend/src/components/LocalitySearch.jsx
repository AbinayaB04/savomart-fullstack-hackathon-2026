import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Search, MapPin, Loader2, X } from 'lucide-react';

export default function LocalitySearch({ onSelectLocality }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.geocode(query.trim());
        setResults(data.results || []);
        setIsOpen(true);
      } catch (err) {
        console.error('Geocode search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 400); // 400ms debounce to respect Nominatim policy

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    setIsOpen(false);
    setQuery(item.display_name.split(',')[0]);
    if (onSelectLocality) {
      onSelectLocality(item);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search Chennai locality or pincode..."
          className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white/95 backdrop-blur-sm border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple transition"
        />
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
          <Search className="w-4 h-4" />
        </div>
        {loading && (
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-brand-purple">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
        )}
        {!loading && query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[1500] max-h-60 overflow-y-auto divide-y divide-gray-100 text-left">
          {results.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(item)}
              className="w-full px-3.5 py-2.5 flex items-start space-x-2.5 hover:bg-purple-50 transition text-left"
            >
              <MapPin className="w-4 h-4 text-brand-purple flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">
                  {item.display_name.split(',')[0]}
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  {item.display_name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
