import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Compass,
  MapPin,
  Camera,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Upload,
  PlusCircle,
  List,
  Sparkles,
  Phone,
  User,
  Building,
  DollarSign,
  Car,
  Eye,
  Check,
  ChevronRight,
  Navigation,
} from 'lucide-react';

// Draggable Pin Icon
const pinIcon = new L.DivIcon({
  className: 'custom-pin-icon',
  html: `
    <div style="background-color: #782B90; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 3px solid #FFF200; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
      <div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 14px;">📍</div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

function DraggableLocationMarker({ position, onPositionChange }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      position={position}
      draggable={true}
      icon={pinIcon}
      eventHandlers={{
        dragend(e) {
          const latlng = e.target.getLatLng();
          onPositionChange(latlng.lat, latlng.lng);
        },
      }}
    />
  );
}

export default function BDExecutiveDashboard() {
  const { currentUser } = useAuth();

  // Tab mode: 'assignments' | 'add_property' | 'my_properties'
  const [activeTab, setActiveTab] = useState('assignments');

  // Assignments state
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // My submitted properties state
  const [myProperties, setMyProperties] = useState([]);
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Add Property Wizard State (Step 1 -> 2 -> 3)
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);

  // Form Fields
  const [latitude, setLatitude] = useState(13.0418);
  const [longitude, setLongitude] = useState(80.2341);
  const [address, setAddress] = useState('');
  const [title, setTitle] = useState('');
  const [rentMonthly, setRentMonthly] = useState('');
  const [deposit, setDeposit] = useState('');
  const [areaSqft, setAreaSqft] = useState('');
  const [frontageFt, setFrontageFt] = useState('');
  const [floor, setFloor] = useState('Ground');
  const [parking, setParking] = useState(false);
  const [parkingSlots, setParkingSlots] = useState('0');
  const [roadWidthFt, setRoadWidthFt] = useState('');
  const [visibility, setVisibility] = useState(4);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);

  // Submitting & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  // Duplicate Warning Modal
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  const loadAssignments = async () => {
    try {
      setLoadingAssignments(true);
      const data = await api.getMyScoutAssignments();
      setAssignments(data);
    } catch (err) {
      console.error('Failed to load assignments:', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const loadMyProperties = async () => {
    try {
      setLoadingProperties(true);
      const data = await api.getProperties();
      const mine = data.filter((p) => p.created_by === currentUser?.id);
      setMyProperties(mine);
    } catch (err) {
      console.error('Failed to load properties:', err);
    } finally {
      setLoadingProperties(false);
    }
  };

  useEffect(() => {
    loadAssignments();
    loadMyProperties();
  }, [currentUser]);

  // GPS Locator
  const handleUseGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);
          showToast(`GPS Position Acquired: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`);
        },
        (err) => {
          console.warn('GPS error, using Chennai default:', err.message);
          // Default to central Chennai
          setLatitude(13.0418);
          setLongitude(80.2341);
          showToast('GPS unavailable. Set location to Central Chennai pin.');
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  };

  const handleStartScoutingAssignment = (assignment) => {
    setSelectedAssignmentId(assignment.id);
    if (assignment.latitude && assignment.longitude) {
      setLatitude(assignment.latitude);
      setLongitude(assignment.longitude);
    }
    setAddress(`Near Hotspot #${assignment.cell_id}, Chennai`);
    setTitle(`Savomart Potential Site #${assignment.cell_id}`);
    setActiveTab('add_property');
    setWizardStep(1);
  };

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setPhotos((prev) => [...prev, ...files]);
      const newPreviews = files.map((file) => URL.createObjectURL(file));
      setPhotoPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit property
  const handleSubmitProperty = async (forceOverride = false) => {
    try {
      setSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append('title', title.trim() || 'Chennai Commercial Property');
      formData.append('latitude', latitude);
      formData.append('longitude', longitude);
      formData.append('address', address.trim());
      if (rentMonthly) formData.append('rent_monthly', rentMonthly);
      if (deposit) formData.append('deposit', deposit);
      formData.append('area_sqft', areaSqft);
      formData.append('frontage_ft', frontageFt || '0');
      formData.append('floor', floor);
      formData.append('parking', parking ? 'true' : 'false');
      formData.append('parking_slots', parkingSlots || '0');
      formData.append('road_width_ft', roadWidthFt || '0');
      formData.append('visibility', visibility);
      if (ownerName) formData.append('owner_name', ownerName.trim());
      if (ownerPhone) formData.append('owner_phone', ownerPhone.trim());
      if (notes) formData.append('notes', notes.trim());
      if (selectedAssignmentId) formData.append('scout_assignment_id', selectedAssignmentId);
      if (forceOverride) formData.append('force', 'true');

      // Append photos
      photos.forEach((photo) => {
        formData.append('photos', photo);
      });

      const result = await api.createProperty(formData);

      showToast(`Property "${result.title}" onboarded! Initial Score: ${result.latest_evaluation?.score || 'Processing'}/100`);

      // Reset wizard
      setWizardStep(1);
      setTitle('');
      setAddress('');
      setRentMonthly('');
      setDeposit('');
      setAreaSqft('');
      setFrontageFt('');
      setRoadWidthFt('');
      setParkingSlots('0');
      setParking(false);
      setOwnerName('');
      setOwnerPhone('');
      setNotes('');
      setPhotos([]);
      setPhotoPreviews([]);
      setSelectedAssignmentId(null);
      setDuplicateWarning(null);

      loadAssignments();
      loadMyProperties();
      setActiveTab('my_properties');
    } catch (err) {
      console.error('Submission error:', err);
      if (err.status === 409 && err.data?.detail?.potential_duplicates) {
        setDuplicateWarning(err.data.detail);
      } else {
        setError(err.message || 'Failed to onboard property.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-[2600] bg-brand-purple text-white px-4 py-3 rounded-2xl shadow-2xl border border-brand-yellow/50 flex items-center space-x-2 text-xs sm:text-sm font-bold animate-fade-in">
          <CheckCircle className="w-5 h-5 text-brand-yellow" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Mobile Header */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-brand-purple bg-purple-100 px-2.5 py-0.5 rounded-full">
              BD Executive Workspace
            </span>
            <h1 className="text-xl font-black text-gray-900 mt-1">Field Scouting & Onboarding</h1>
            <p className="text-xs text-gray-500">Capture lane-level retail sites on mobile</p>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-brand-yellow/20 border border-brand-yellow/40 flex items-center justify-center text-brand-purple font-black">
            📍
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-gray-100 rounded-2xl mt-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`py-2 rounded-xl transition flex items-center justify-center space-x-1 ${
              activeTab === 'assignments' ? 'bg-brand-purple text-brand-yellow shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Tasks ({assignments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('add_property')}
            className={`py-2 rounded-xl transition flex items-center justify-center space-x-1 ${
              activeTab === 'add_property' ? 'bg-brand-purple text-brand-yellow shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Site</span>
          </button>
          <button
            onClick={() => setActiveTab('my_properties')}
            className={`py-2 rounded-xl transition flex items-center justify-center space-x-1 ${
              activeTab === 'my_properties' ? 'bg-brand-purple text-brand-yellow shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Sites ({myProperties.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: MY ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-gray-800">Assigned Hotspots to Scout</h2>
            <button onClick={loadAssignments} className="text-xs text-brand-purple font-bold">
              Refresh
            </button>
          </div>

          {loadingAssignments ? (
            <div className="p-8 text-center text-xs text-gray-500">Loading assignments...</div>
          ) : assignments.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">All Caught Up!</h3>
              <p className="text-xs text-gray-500">No pending scouting assignments dispatched by BD Manager.</p>
              <button
                onClick={() => setActiveTab('add_property')}
                className="mt-3 px-4 py-2 bg-brand-purple text-brand-yellow text-xs font-bold rounded-xl"
              >
                + Scout New Property Directly
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((asg) => (
                <div
                  key={asg.id}
                  className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-brand-yellow text-brand-purple">
                          Hotspot #{asg.cell_id}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          asg.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-brand-purple'
                        }`}>
                          {asg.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 mt-1">
                        Target Area: Cell #{asg.cell_id}
                      </h3>
                      <p className="text-xs text-gray-600 mt-0.5">{asg.note || 'Identify suitable commercial storefronts.'}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-brand-purple">
                        Score: {asg.hotspot?.score || 'N/A'}/100
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px] text-gray-500">
                    <span>Assigned by {asg.assigned_by_name}</span>
                    <button
                      onClick={() => handleStartScoutingAssignment(asg)}
                      className="px-3 py-1.5 bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-extrabold text-xs rounded-xl shadow-sm transition flex items-center space-x-1"
                    >
                      <span>Scout This Site</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ADD PROPERTY WIZARD (3 STEPS) */}
      {activeTab === 'add_property' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-200 space-y-5">
          {/* Wizard Step Progress Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                wizardStep === 1 ? 'bg-brand-purple text-brand-yellow' : 'bg-gray-100 text-gray-600'
              }`}>
                1
              </span>
              <span className="text-xs font-bold text-gray-700">Location</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-200"></div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                wizardStep === 2 ? 'bg-brand-purple text-brand-yellow' : 'bg-gray-100 text-gray-600'
              }`}>
                2
              </span>
              <span className="text-xs font-bold text-gray-700">Specs</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-200"></div>
            <div className="flex items-center space-x-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                wizardStep === 3 ? 'bg-brand-purple text-brand-yellow' : 'bg-gray-100 text-gray-600'
              }`}>
                3
              </span>
              <span className="text-xs font-bold text-gray-700">Photos</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: LOCATION */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900">Step 1: Set Site Coordinates</h3>
                  <p className="text-xs text-gray-500">Tap GPS or drag pin on map</p>
                </div>
                <button
                  type="button"
                  onClick={handleUseGPS}
                  className="px-3 py-1.5 bg-brand-yellow text-brand-purple font-extrabold text-xs rounded-xl shadow-sm flex items-center space-x-1.5 hover:bg-yellow-400 transition"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Use My GPS</span>
                </button>
              </div>

              {/* Leaflet Pin Map */}
              <div className="h-56 rounded-2xl overflow-hidden border border-gray-300 relative">
                <MapContainer
                  center={[latitude, longitude]}
                  zoom={15}
                  scrollWheelZoom={false}
                  className="w-full h-full"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <DraggableLocationMarker
                    position={[latitude, longitude]}
                    onPositionChange={(lat, lon) => {
                      setLatitude(lat);
                      setLongitude(lon);
                    }}
                  />
                </MapContainer>
                <div className="absolute bottom-2 left-2 z-[400] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-mono text-gray-700 shadow-sm border border-gray-200">
                  [{latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E]
                </div>
              </div>

              {/* Address input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Street Address & Landmark <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. No. 42, Velachery Main Road, Near Vijayanagar Bus Terminus"
                  className="w-full p-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!address.trim()}
                  onClick={() => setWizardStep(2)}
                  className="px-5 py-2.5 bg-brand-purple text-brand-yellow font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <span>Next: Commercial Specs</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: COMMERCIAL & PHYSICAL SPECS */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Step 2: Commercial & Physical Specs</h3>
                <p className="text-xs text-gray-500">Enter site dimensions, lease terms, and street access</p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Property Title */}
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Property Name / Commercial Complex <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ground Floor, Vijaya Commercial Corner"
                    className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                  />
                </div>

                {/* Area & Frontage */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Carpet Area (sqft) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="100"
                      value={areaSqft}
                      onChange={(e) => setAreaSqft(e.target.value)}
                      placeholder="e.g. 1200"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Road Frontage (ft) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={frontageFt}
                      onChange={(e) => setFrontageFt(e.target.value)}
                      placeholder="e.g. 24"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                </div>

                {/* Rent & Deposit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Monthly Rent (₹) <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={rentMonthly}
                      onChange={(e) => setRentMonthly(e.target.value)}
                      placeholder="e.g. 95000"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Security Deposit (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      placeholder="e.g. 500000"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                </div>

                {/* Road Width & Floor */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Road Width (ft)</label>
                    <input
                      type="number"
                      min="0"
                      value={roadWidthFt}
                      onChange={(e) => setRoadWidthFt(e.target.value)}
                      placeholder="e.g. 35"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Floor Level</label>
                    <select
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple font-medium"
                    >
                      <option value="Ground">Ground Floor</option>
                      <option value="Basement">Basement</option>
                      <option value="1st Floor">1st Floor</option>
                      <option value="2nd Floor">2nd Floor</option>
                    </select>
                  </div>
                </div>

                {/* Parking & Visibility */}
                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Parking Slots</label>
                    <input
                      type="number"
                      min="0"
                      value={parkingSlots}
                      onChange={(e) => setParkingSlots(e.target.value)}
                      placeholder="0"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Visibility (1-5)</label>
                    <div className="flex space-x-1.5 pt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setVisibility(star)}
                          className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center transition ${
                            visibility >= star ? 'bg-brand-yellow text-brand-purple shadow-sm' : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Owner details */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Owner / Broker Name</label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. S. Ramanathan"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Owner Contact Phone</label>
                    <input
                      type="tel"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="+91 98400 12345"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!title.trim() || !areaSqft || !frontageFt}
                  onClick={() => setWizardStep(3)}
                  className="px-5 py-2.5 bg-brand-purple text-brand-yellow font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <span>Next: Photos</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PHOTOS & SUBMIT */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Step 3: Capture Storefront Photos</h3>
                <p className="text-xs text-gray-500">Take pictures of building exterior, frontage, and road approach</p>
              </div>

              {/* Photo Upload Input Button */}
              <div className="p-6 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 text-center space-y-2">
                <Camera className="w-8 h-8 text-brand-purple mx-auto" />
                <div className="text-xs font-bold text-gray-700">Take Photos or Select from Gallery</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                  id="photo-upload-input"
                />
                <label
                  htmlFor="photo-upload-input"
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-purple text-brand-yellow font-bold text-xs rounded-xl cursor-pointer shadow-sm hover:bg-brand-purple-dark transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose / Capture Photos</span>
                </label>
              </div>

              {/* Previews */}
              {photoPreviews.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-700">Selected Photos ({photoPreviews.length})</span>
                  <div className="grid grid-cols-3 gap-2.5">
                    {photoPreviews.map((preview, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border border-gray-200 h-20 group">
                        <img src={preview} alt="Upload Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Review Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1 text-gray-700">
                <div className="font-bold text-gray-900">{title}</div>
                <div>{address}</div>
                <div className="text-gray-500 font-medium">
                  {areaSqft} sqft | {frontageFt} ft frontage | {floor} floor
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitProperty(false)}
                  className="px-6 py-3 bg-brand-yellow hover:bg-yellow-400 text-brand-purple font-black text-xs rounded-xl shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <span>Evaluating Site...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Submit for Auto-Evaluation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: MY SUBMITTED SITES */}
      {activeTab === 'my_properties' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-extrabold text-gray-800">My Scouted Properties</h2>
            <button onClick={loadMyProperties} className="text-xs text-brand-purple font-bold">
              Refresh
            </button>
          </div>

          {loadingProperties ? (
            <div className="p-8 text-center text-xs text-gray-500">Loading properties...</div>
          ) : myProperties.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center space-y-2">
              <Building className="w-10 h-10 text-gray-400 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">No Properties Submitted Yet</h3>
              <p className="text-xs text-gray-500">Onboard a retail site using the Add Site wizard.</p>
              <button
                onClick={() => setActiveTab('add_property')}
                className="mt-3 px-4 py-2 bg-brand-purple text-brand-yellow text-xs font-bold rounded-xl"
              >
                + Add First Property
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myProperties.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-brand-purple">
                        {prop.stage}
                      </span>
                      <h3 className="text-sm font-extrabold text-gray-900 mt-1">{prop.title}</h3>
                      <p className="text-xs text-gray-500">{prop.address}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-brand-purple">
                        {prop.latest_evaluation?.score || 'N/A'}/100
                      </span>
                      <div className="text-[10px] font-bold uppercase text-emerald-600">
                        {prop.latest_evaluation?.recommendation || 'Scouted'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px] text-gray-600">
                    <span>{prop.area_sqft} sqft • {prop.frontage_ft} ft frontage</span>
                    <span className="font-semibold text-brand-purple">
                      {prop.rent_monthly ? `₹${prop.rent_monthly.toLocaleString()}/mo` : 'Rent undisclosed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 409 Duplicate Warning Confirmation Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-[2800] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-amber-600 font-extrabold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Potential Duplicate Detected</span>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              Our spatial deduplication engine identified{' '}
              <span className="font-bold">{duplicateWarning.potential_duplicates?.length}</span> other property submission(s) within 50 meters with similar specs:
            </p>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {duplicateWarning.potential_duplicates?.map((dup) => (
                <div key={dup.id} className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-0.5">
                  <div className="font-bold text-amber-900">{dup.title}</div>
                  <div className="text-[11px] text-amber-700">
                    {dup.distance_meters}m away • {dup.area_sqft} sqft • {dup.address}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 italic">
              Are you sure this is a distinct retail unit (e.g. different floor or separate shop)?
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 rounded-xl"
              >
                Cancel & Review
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmitProperty(true)}
                className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow transition"
              >
                {submitting ? 'Submitting...' : 'Yes, Submit Anyway (Force)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
