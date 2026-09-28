import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import { LoadingSpinner, ErrorState } from './UIState';
import { Store, MapPin, Info, Tag } from 'lucide-react';

// Custom Leaflet DivIcon for Savomart Stores (Purple & Yellow branding)
const createStoreIcon = (isMock = false) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background-color: #782B90;
        border: 3px solid #FFF200;
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #FFF200;
        font-weight: 800;
        font-size: 14px;
        position: relative;
      ">
        S
        ${isMock ? '<span style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;background:#f97316;border:1px solid white;border-radius:50%;" title="Mock Data"></span>' : ''}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

// Chennai Focus Bounding Box Coordinates
const CHENNAI_BOUNDS = [
  [12.80, 80.05], // South-West
  [13.25, 80.35], // North-East
];

export default function MapView({
  center = [13.0450, 80.2300],
  zoom = 12,
  height = '500px',
  interactive = true,
  children,
  onCellSelect,
}) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStores = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStores();
      setStores(data.features || []);
    } catch (err) {
      console.error('Failed to load stores on map:', err);
      setError('Could not fetch Savomart stores from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100" style={{ height }}>
      {/* Map Legend Overlay */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm px-3.5 py-2.5 rounded-xl shadow-md border border-gray-200 text-xs flex flex-col space-y-1.5 pointer-events-auto">
        <div className="flex items-center space-x-2 font-semibold text-gray-800">
          <div className="w-3.5 h-3.5 rounded-full bg-brand-purple border-2 border-brand-yellow flex items-center justify-center text-[9px] text-brand-yellow font-bold">S</div>
          <span>Savomart Store</span>
        </div>
        <div className="flex items-center space-x-1.5 text-gray-500 text-[11px] pt-1 border-t border-gray-100">
          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          <span>Orange dot = Mock Data</span>
        </div>
      </div>

      {/* Chennai Focus BBox Indicator */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-brand-purple/90 text-white text-[11px] px-3 py-1.5 rounded-lg shadow backdrop-blur-sm pointer-events-none flex items-center space-x-1.5">
        <MapPin className="w-3.5 h-3.5 text-brand-yellow" />
        <span>Chennai Focus Region [12.80°N - 13.25°N, 80.05°E - 80.35°E]</span>
      </div>

      {loading && (
        <div className="absolute inset-0 z-[1000] bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <LoadingSpinner message="Loading Chennai map and stores..." />
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-11/12 max-w-md">
          <ErrorState message={error} onRetry={loadStores} />
        </div>
      )}

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={interactive}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Chennai Bounding Box Guide */}
        <Rectangle
          bounds={CHENNAI_BOUNDS}
          pathOptions={{
            color: '#782B90',
            weight: 2,
            dashArray: '6, 6',
            fillColor: '#782B90',
            fillOpacity: 0.02,
          }}
        />

        {/* Savomart Store Markers */}
        {stores.map((store) => {
          const coords = store.geometry.coordinates; // [lon, lat]
          const position = [coords[1], coords[0]];
          const props = store.properties;
          const isMock = props.is_mock;

          return (
            <Marker
              key={store.id || props.id || props.external_id}
              position={position}
              icon={createStoreIcon(isMock)}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-gray-100">
                    <span className="font-bold text-sm text-brand-purple">
                      {props.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                    {props.address || 'Chennai Operational Facility'}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                    <span className="font-medium text-gray-500">
                      ID: {props.external_id || props.id}
                    </span>
                    {isMock ? (
                      <span className="px-2 py-0.5 rounded font-semibold bg-orange-100 text-orange-700 text-[10px]">
                        Mock data
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700 text-[10px]">
                        Operational
                      </span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {children}
      </MapContainer>
    </div>
  );
}
