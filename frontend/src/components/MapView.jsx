import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import { LoadingSpinner, ErrorState } from './UIState';
import { Store, MapPin, Layers, Flame, MousePointerClick, CheckSquare } from 'lucide-react';

// Custom Leaflet DivIcon for Savomart Stores
const createStoreIcon = (isMock = false) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: #782B90;
        border: 3px solid #FFF200;
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #FFF200;
        font-weight: 800;
        font-size: 13px;
        position: relative;
      ">
        S
        ${isMock ? '<span style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;background:#f97316;border:1.5px solid white;border-radius:50%;" title="Mock Data"></span>' : ''}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

// Custom Leaflet DivIcon for Hotspots
const createHotspotIcon = (rank = 1, score = 85) => {
  return L.divIcon({
    className: 'custom-hotspot-marker',
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background-color: #FFF200;
        border: 3px solid #782B90;
        box-shadow: 0 4px 12px rgba(120,43,144,0.45);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #782B90;
        font-weight: 900;
        font-size: 12px;
        line-height: 1;
      ">
        <span>#${rank}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
};

const CHENNAI_BOUNDS = [
  [12.80, 80.05],
  [13.25, 80.35],
];

function MapController({ flyTarget, onViewportChange }) {
  const map = useMap();

  useEffect(() => {
    if (!flyTarget) return;
    if (flyTarget.bounds) {
      map.flyToBounds(flyTarget.bounds, { maxZoom: 15, padding: [30, 30] });
    } else if (flyTarget.lat && flyTarget.lon) {
      map.flyTo([flyTarget.lat, flyTarget.lon], flyTarget.zoom || 14);
    }
  }, [flyTarget, map]);

  useMapEvents({
    moveend: () => {
      onViewportChange(map.getBounds(), map.getZoom());
    },
    zoomend: () => {
      onViewportChange(map.getBounds(), map.getZoom());
    },
  });

  return null;
}

export default function MapView({
  center = [13.0450, 80.2300],
  zoom = 12,
  height = '540px',
  interactive = true,
  flyTarget = null,
  selectedCellIds = [],
  onToggleCell = null,
  onSelectMultipleCells = null,
  hotspots = [],
  unionGeometry = null,
  enableGrid = true,
  children,
}) {
  const [stores, setStores] = useState([]);
  const [gridCells, setGridCells] = useState([]);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [error, setError] = useState(null);

  // Fetch stores once on mount
  useEffect(() => {
    async function loadStores() {
      try {
        const data = await api.getStores();
        setStores(data.features || []);
      } catch (err) {
        console.error('Failed to load stores:', err);
      } finally {
        setLoadingStores(false);
      }
    }
    loadStores();
  }, []);

  // Viewport change handler for grid loading
  const handleViewportChange = useCallback(
    async (bounds, newZoom) => {
      setCurrentZoom(newZoom);

      if (!enableGrid || newZoom < 13) {
        setGridCells([]);
        return;
      }

      // Fetch grid cells for current bounding box
      const minLon = bounds.getWest();
      const minLat = bounds.getSouth();
      const maxLon = bounds.getEast();
      const maxLat = bounds.getNorth();
      const bboxStr = `${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`;

      setLoadingGrid(true);
      try {
        const res = await api.getGrid(bboxStr);
        if (res.features) {
          setGridCells(res.features);
        }
      } catch (err) {
        console.error('Failed to load grid cells for viewport:', err);
      } finally {
        setLoadingGrid(false);
      }
    },
    [enableGrid]
  );

  const isCellSelected = (cellId) => selectedCellIds.includes(cellId);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100" style={{ height }}>
      {/* Top Map Indicators & Controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end space-y-2 pointer-events-auto">
        {/* Legend */}
        <div className="bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl shadow-md border border-gray-200 text-xs flex flex-col space-y-1.5">
          <div className="flex items-center space-x-2 font-semibold text-gray-800">
            <div className="w-3.5 h-3.5 rounded-full bg-brand-purple border-2 border-brand-yellow flex items-center justify-center text-[9px] text-brand-yellow font-bold">
              S
            </div>
            <span>Savomart Store</span>
          </div>
          {enableGrid && (
            <div className="flex items-center space-x-2 font-semibold text-gray-800">
              <div className="w-3.5 h-3.5 rounded bg-brand-yellow/80 border border-brand-purple"></div>
              <span>Selected 500m Cell</span>
            </div>
          )}
          {hotspots.length > 0 && (
            <div className="flex items-center space-x-2 font-semibold text-gray-800">
              <div className="w-3.5 h-3.5 rounded-full bg-brand-yellow border-2 border-brand-purple flex items-center justify-center text-[8px] text-brand-purple font-bold">
                #1
              </div>
              <span>Scouting Hotspot</span>
            </div>
          )}
        </div>

        {/* Zoom Guide / Grid Active Badge */}
        {enableGrid && (
          <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-md border border-gray-200 text-xs flex items-center space-x-1.5">
            {currentZoom >= 13 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold text-emerald-800">Grid Selection Active</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600">Zoom in closer (≥13) for 500m grid</span>
              </>
            )}
          </div>
        )}

        {/* Selected Cells Counter */}
        {selectedCellIds.length > 0 && (
          <div className="bg-brand-purple text-white px-3 py-1.5 rounded-xl shadow-md text-xs font-bold flex items-center space-x-1.5 border border-brand-yellow/40">
            <CheckSquare className="w-3.5 h-3.5 text-brand-yellow" />
            <span>{selectedCellIds.length} cell{selectedCellIds.length > 1 ? 's' : ''} selected ({(selectedCellIds.length * 0.25).toFixed(2)} km²)</span>
          </div>
        )}
      </div>

      {/* Chennai Bounding Box Label */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-brand-purple/90 text-white text-[11px] px-3 py-1.5 rounded-lg shadow backdrop-blur-sm pointer-events-none flex items-center space-x-1.5">
        <MapPin className="w-3.5 h-3.5 text-brand-yellow" />
        <span>Chennai Focus Region [12.80°N - 13.25°N, 80.05°E - 80.35°E]</span>
      </div>

      {loadingStores && (
        <div className="absolute inset-0 z-[1000] bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <LoadingSpinner message="Loading Chennai map and stores..." />
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

        <MapController
          flyTarget={flyTarget}
          onViewportChange={handleViewportChange}
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

        {/* Union Geometry of Evaluated Report (if viewing a completed report) */}
        {unionGeometry && unionGeometry.coordinates && (
          <Polygon
            positions={
              unionGeometry.type === 'MultiPolygon'
                ? unionGeometry.coordinates.map((poly) =>
                    poly[0].map(([lon, lat]) => [lat, lon])
                  )
                : unionGeometry.coordinates[0].map(([lon, lat]) => [lat, lon])
            }
            pathOptions={{
              color: '#782B90',
              weight: 3,
              fillColor: '#782B90',
              fillOpacity: 0.25,
            }}
          />
        )}

        {/* Grid Cells (shown when zoom >= 13) */}
        {enableGrid &&
          currentZoom >= 13 &&
          gridCells.map((cell) => {
            const cellId = cell.properties.id;
            const selected = isCellSelected(cellId);
            // GeoJSON coordinates: Polygon -> [[[lon, lat], ...]]
            const ring = cell.geometry.coordinates[0];
            const positions = ring.map(([lon, lat]) => [lat, lon]);

            return (
              <Polygon
                key={cellId}
                positions={positions}
                eventHandlers={{
                  click: () => onToggleCell && onToggleCell(cellId),
                }}
                pathOptions={{
                  color: selected ? '#782B90' : '#782B90',
                  weight: selected ? 2.5 : 0.8,
                  fillColor: selected ? '#FFF200' : '#782B90',
                  fillOpacity: selected ? 0.6 : 0.04,
                  dashArray: selected ? null : '3, 3',
                }}
              >
                <Popup>
                  <div className="text-xs p-1">
                    <span className="font-bold text-brand-purple">Grid Cell #{cellId}</span>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Row {cell.properties.row}, Col {cell.properties.col}
                    </div>
                    <div className="mt-1 font-semibold text-[11px] text-gray-700">
                      {selected ? '✓ Selected for Analysis' : 'Click to Select'}
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* Hotspot Markers */}
        {hotspots.map((hs, idx) => {
          const pos = [hs.centroid[1], hs.centroid[0]]; // [lat, lon]
          return (
            <Marker
              key={hs.cell_id || idx}
              position={pos}
              icon={createHotspotIcon(idx + 1, hs.score)}
            >
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-gray-100">
                    <span className="font-bold text-xs text-brand-purple">
                      Hotspot #{idx + 1} (Score: {hs.score})
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-yellow text-brand-purple">
                      Cell #{hs.cell_id}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{hs.reason}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}

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
              <Popup>
                <div className="p-1 min-w-[200px]">
                  <div className="font-bold text-xs text-brand-purple mb-1">
                    {props.name}
                  </div>
                  <p className="text-[11px] text-gray-600 mb-2 leading-relaxed">
                    {props.address || 'Chennai Operational Facility'}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[10px]">
                    <span className="font-medium text-gray-500">
                      ID: {props.external_id || props.id}
                    </span>
                    {isMock ? (
                      <span className="px-2 py-0.5 rounded font-semibold bg-orange-100 text-orange-700">
                        Mock data
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700">
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
