import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Camera,
  MapPin,
  CheckCircle,
  CheckCircle2,
  Navigation2,
  FilePlus,
  ChevronRight,
  Wifi,
  WifiOff,
  CloudUpload,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  Sparkles,
  ChevronLeft,
  Store,
  Layers,
} from 'lucide-react';
import { LoadingSpinner } from '../components/UIState';

// Helper to generate UUID for idempotent sync
function generateClientUUID() {
  return 'c_uuid_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
}

export default function SurveyExecutiveDashboard() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [error, setError] = useState(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);

  // Network state: can be toggled manually to simulate offline field survey
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const effectiveOnline = isOnline && !simulatedOffline;

  // Form State
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Form fields
  const [footfall10m, setFootfall10m] = useState(65);
  const [peakHourEst, setPeakHourEst] = useState(390);
  const [shopCounts, setShopCounts] = useState({
    grocery: 3,
    general: 2,
    pharmacy: 1,
    restaurant: 2,
    other: 1,
  });
  const [competitors, setCompetitors] = useState([
    { name: 'Reliance Smart Point', type: 'grocery', approx_size: '1800 sqft' },
  ]);
  const [dominantHousehold, setDominantHousehold] = useState('apartments');
  const [laneWidthFt, setLaneWidthFt] = useState(32);
  const [parkingAvailability, setParkingAvailability] = useState('street_only');
  const [streetLighting, setStreetLighting] = useState(true);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([
    'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=60',
  ]);
  const [gpsCoords, setGpsCoords] = useState({ lat: 13.0418, lng: 80.2341 });
  const [clientUUID, setClientUUID] = useState('');

  // Count pending drafts in localStorage
  const [pendingDraftCount, setPendingDraftCount] = useState(0);

  const updatePendingDraftCount = useCallback(() => {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('survey_draft_')) {
        count++;
      }
    }
    setPendingDraftCount(count);
  }, []);

  const fetchMyTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getMyTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load my tasks:', err);
      setError(err.message || 'Failed to fetch assigned tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyTasks();
    updatePendingDraftCount();

    // Geolocation attempt
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsCoords({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          });
        },
        () => {
          // fallback Chennai center
          setGpsCoords({ lat: 13.0418, lng: 80.2341 });
        }
      );
    }

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-trigger sync when returning online
      triggerAutoSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updatePendingDraftCount]);

  // Open Form for Task: loads existing draft or defaults
  const handleOpenTaskForm = (task) => {
    setActiveTask(task);
    setError(null);
    setSyncStatusMsg(null);

    const draftKey = `survey_draft_${task.id}`;
    const savedDraft = localStorage.getItem(draftKey);

    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        setFootfall10m(parsed.footfall_count_10min ?? 65);
        setPeakHourEst(parsed.peak_hour_estimate ?? 390);
        setShopCounts(parsed.shop_counts ?? { grocery: 3, general: 2, pharmacy: 1, restaurant: 2, other: 1 });
        setCompetitors(parsed.competitors ?? []);
        setDominantHousehold(parsed.dominant_household_type ?? 'apartments');
        setLaneWidthFt(parsed.lane_width_ft ?? 32);
        setParkingAvailability(parsed.parking_availability ?? 'street_only');
        setStreetLighting(parsed.street_lighting ?? true);
        setNotes(parsed.notes ?? '');
        setPhotos(parsed.photos ?? []);
        setClientUUID(parsed.client_uuid || generateClientUUID());
        setDraftSavedAt(parsed.saved_at || new Date().toLocaleTimeString());
        return;
      } catch (e) {
        console.error('Failed to parse draft:', e);
      }
    }

    // Default init
    if (task.latest_response && task.status === 'submitted') {
      const respData = task.latest_response.data || {};
      setFootfall10m(respData.footfall_count_10min || 0);
      setPeakHourEst(respData.peak_hour_estimate || 0);
      setShopCounts(respData.shop_counts || {});
      setCompetitors(respData.competitors || []);
      setDominantHousehold(respData.dominant_household_type || 'mixed');
      setLaneWidthFt(respData.lane_width_ft || 30);
      setParkingAvailability(respData.parking_availability || 'street_only');
      setStreetLighting(respData.street_lighting ?? true);
      setNotes(respData.notes || '');
      setPhotos(task.latest_response.photos || []);
      setClientUUID(task.latest_response.client_uuid || generateClientUUID());
      setDraftSavedAt(null);
    } else {
      setFootfall10m(75);
      setPeakHourEst(450);
      setShopCounts({ grocery: 4, general: 2, pharmacy: 1, restaurant: 3, other: 1 });
      setCompetitors([{ name: 'More Retail Supermarket', type: 'supermarket', approx_size: '2200 sqft' }]);
      setDominantHousehold('apartments');
      setLaneWidthFt(34);
      setParkingAvailability('street_only');
      setStreetLighting(true);
      setNotes('High evening pedestrian flow. Moderate grocery delivery scooter traffic.');
      setPhotos(['https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=60']);
      const newUuid = generateClientUUID();
      setClientUUID(newUuid);
      setDraftSavedAt(null);
    }
  };

  // Continuous Autosave on Change
  const saveDraftLocally = useCallback(() => {
    if (!activeTask || activeTask.status === 'submitted') return;

    const draftKey = `survey_draft_${activeTask.id}`;
    const nowTime = new Date().toLocaleTimeString();

    const payload = {
      task_id: activeTask.id,
      client_uuid: clientUUID || generateClientUUID(),
      footfall_count_10min: footfall10m,
      peak_hour_estimate: peakHourEst,
      shop_counts: shopCounts,
      competitors,
      dominant_household_type: dominantHousehold,
      lane_width_ft: laneWidthFt,
      parking_availability: parkingAvailability,
      street_lighting: streetLighting,
      notes,
      photos,
      gps_lat: gpsCoords.lat,
      gps_lng: gpsCoords.lng,
      saved_at: nowTime,
    };

    localStorage.setItem(draftKey, JSON.stringify(payload));
    setDraftSavedAt(nowTime);
    updatePendingDraftCount();
  }, [
    activeTask,
    clientUUID,
    footfall10m,
    peakHourEst,
    shopCounts,
    competitors,
    dominantHousehold,
    laneWidthFt,
    parkingAvailability,
    streetLighting,
    notes,
    photos,
    gpsCoords,
    updatePendingDraftCount,
  ]);

  // Trigger autosave whenever values change
  useEffect(() => {
    if (activeTask && activeTask.status !== 'submitted') {
      saveDraftLocally();
    }
  }, [
    footfall10m,
    peakHourEst,
    shopCounts,
    competitors,
    dominantHousehold,
    laneWidthFt,
    parkingAvailability,
    streetLighting,
    notes,
    saveDraftLocally,
  ]);

  // Sync / Submit Survey
  const handleSyncSubmit = async () => {
    if (!activeTask) return;

    if (!effectiveOnline) {
      // Offline mode: confirm draft is saved
      saveDraftLocally();
      setSyncStatusMsg('Offline: Draft safely saved on device. Will auto-sync when network returns.');
      return;
    }

    try {
      setSyncing(true);
      setError(null);
      setSyncStatusMsg(null);

      const submissionPayload = {
        client_uuid: clientUUID,
        footfall_count_10min: Number(footfall10m),
        peak_hour_estimate: Number(peakHourEst),
        shop_counts: shopCounts,
        competitors,
        dominant_household_type: dominantHousehold,
        lane_width_ft: Number(laneWidthFt),
        parking_availability: parkingAvailability,
        street_lighting: streetLighting,
        notes,
        photos,
        gps_lat: gpsCoords.lat,
        gps_lng: gpsCoords.lng,
        captured_at: new Date().toISOString(),
      };

      const res = await api.submitTaskResponse(activeTask.id, submissionPayload);

      // Clean up local draft
      localStorage.removeItem(`survey_draft_${activeTask.id}`);
      updatePendingDraftCount();
      setDraftSavedAt(null);

      setSyncStatusMsg(
        res.idempotent
          ? 'Idempotent Sync: Submission verified and acknowledged by server.'
          : 'Success: Ground survey submitted to operations lead.'
      );

      // Refresh task list and active task
      await fetchMyTasks();
      setActiveTask(res.task);
    } catch (err) {
      console.error('Submission sync error:', err);
      setError(err.message || 'Sync failed. Draft is retained on device.');
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync function for any queued drafts
  const triggerAutoSync = async () => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('survey_draft_')) {
        try {
          const draft = JSON.parse(localStorage.getItem(key));
          if (draft && draft.task_id) {
            await api.submitTaskResponse(draft.task_id, draft);
            localStorage.removeItem(key);
          }
        } catch (e) {
          console.error('Auto-sync draft failed for key', key, e);
        }
      }
    }
    updatePendingDraftCount();
    fetchMyTasks();
  };

  // Stepper handlers for shop counts
  const updateShopCount = (type, delta) => {
    setShopCounts((prev) => ({
      ...prev,
      [type]: Math.max(0, (prev[type] || 0) + delta),
    }));
  };

  // Add competitor store
  const addCompetitor = () => {
    setCompetitors((prev) => [
      ...prev,
      { name: 'Local Kirana Store', type: 'grocery', approx_size: '800 sqft' },
    ]);
  };

  const removeCompetitor = (idx) => {
    setCompetitors((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full mx-auto space-y-3.5 pb-12">
      {/* Mobile Top Terminal Header */}
      <div className="bg-gradient-to-r from-brand-purple to-brand-purple-dark text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-black text-brand-yellow tracking-wider flex items-center space-x-1">
            <Store className="w-3.5 h-3.5" />
            <span>Survey Executive Terminal</span>
          </span>

          {/* Network State & Offline Simulator */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSimulatedOffline((prev) => !prev)}
              title="Toggle simulated offline mode for field testing"
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center space-x-1 transition ${
                effectiveOnline
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-rose-500/30 text-rose-200 border border-rose-400/50'
              }`}
            >
              {effectiveOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 text-rose-300" />}
              <span>{effectiveOnline ? 'Online' : 'Offline'}</span>
            </button>

            {pendingDraftCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-yellow text-brand-purple">
                {pendingDraftCount} Draft{pendingDraftCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-lg sm:text-xl font-black">{currentUser?.name}</h1>
          <p className="text-[11px] text-purple-200 mt-0.5 flex items-center">
            <MapPin className="w-3.5 h-3.5 mr-1 text-brand-yellow shrink-0" />
            <span>GPS Lat: {gpsCoords.lat}, Lng: {gpsCoords.lng}</span>
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-purple-400/20 text-xs">
          <span className="text-purple-200 text-[11px]">
            Assigned Micro-Tasks: <span className="font-extrabold text-white">{tasks.length}</span>
          </span>
          <button
            onClick={fetchMyTasks}
            disabled={loading}
            className="text-[11px] font-bold text-brand-yellow hover:underline flex items-center space-x-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Tasks</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {syncStatusMsg && (
        <div className="p-3 bg-purple-50 border border-brand-purple/30 rounded-2xl text-xs text-brand-purple font-bold flex items-center space-x-2 animate-fade-in">
          <Sparkles className="w-4 h-4 text-brand-purple shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* Main View: Task Form vs Tasks List */}
      {activeTask ? (
        /* Form View */
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-200 shadow-sm space-y-4 animate-fade-in">
          {/* Form Header */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <button
              onClick={() => setActiveTask(null)}
              className="inline-flex items-center space-x-1 text-xs font-black text-brand-purple hover:text-brand-purple-dark py-1 px-2 rounded-lg bg-purple-50 hover:bg-purple-100 transition active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Tasks</span>
            </button>

            <div className="flex items-center space-x-1.5">
              {draftSavedAt && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Saved ({draftSavedAt})
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                activeTask.status === 'submitted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {activeTask.status}
              </span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] font-black text-brand-purple uppercase tracking-wider block">
              Lane Data Capture Form
            </span>
            <h2 className="text-base font-black text-gray-900 leading-tight">
              Task #{activeTask.id.replace('task_', '')} • Grid Cell #{activeTask.cell_id}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              Target: <span className="font-bold text-gray-800">{activeTask.study_property_title || 'Catchment Survey'}</span>
            </p>
          </div>

          {/* Form Body */}
          <div className="space-y-3.5 text-xs">
            {/* 1. Footfall Count in 10 Minutes */}
            <div className="p-3 bg-purple-50/70 border border-brand-purple/20 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-brand-purple tracking-wider block">Step 1</span>
                  <label className="font-black text-gray-900 text-xs">
                    10-Minute Pedestrian Footfall
                  </label>
                </div>
                <span className="text-[10px] font-bold text-brand-purple bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
                  Street Count
                </span>
              </div>

              {/* Counter Controls: strictly width-bounded with no overflow */}
              <div className="bg-white rounded-xl p-2 border-2 border-brand-purple/30 shadow-xs flex items-center justify-between gap-1">
                {/* Decrement Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFootfall10m((v) => Math.max(0, v - 5))}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center transition active:scale-90"
                    title="-5"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => setFootfall10m((v) => Math.max(0, v - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center transition active:scale-90"
                    title="-1"
                  >
                    -1
                  </button>
                </div>

                {/* Center Number Input */}
                <div className="flex-1 min-w-0 text-center px-1">
                  <input
                    type="number"
                    min="0"
                    value={footfall10m}
                    onChange={(e) => setFootfall10m(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 mx-auto text-center font-black text-2xl text-brand-purple bg-transparent border-b-2 border-brand-purple/30 focus:border-brand-purple focus:outline-none p-0"
                  />
                  <span className="block text-[10px] text-gray-400 font-semibold -mt-0.5">pedestrians / 10m</span>
                </div>

                {/* Increment Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFootfall10m((v) => v + 1)}
                    className="w-8 h-8 rounded-lg bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-black text-xs flex items-center justify-center transition active:scale-90 shadow-xs"
                    title="+1"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => setFootfall10m((v) => v + 5)}
                    className="w-8 h-8 rounded-lg bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-black text-xs flex items-center justify-center transition active:scale-90 shadow-xs"
                    title="+5"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Peak Hour Auto Extrapolator */}
              <div className="bg-white/90 p-2.5 rounded-xl border border-purple-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-gray-800 block">Peak-Hour Estimate:</span>
                  <span className="text-[10px] text-gray-400">1-hr rush volume</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min="0"
                    value={peakHourEst}
                    onChange={(e) => setPeakHourEst(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 text-center font-black text-xs py-1 px-1 bg-slate-50 border border-slate-300 rounded-lg text-emerald-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPeakHourEst(footfall10m * 6)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-brand-purple text-brand-yellow font-extrabold hover:bg-brand-purple-dark transition shadow-xs whitespace-nowrap"
                  >
                    Auto 6× ({footfall10m * 6})
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Shop Count by Retail Category */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Step 2</span>
                  <label className="font-black text-gray-900 text-xs">
                    Shop Count by Retail Category
                  </label>
                </div>
                <span className="text-[10px] text-gray-500 font-semibold">Tally nearby shops</span>
              </div>

              <div className="space-y-1.5">
                {[
                  { key: 'grocery', label: 'Grocery / Kirana' },
                  { key: 'general', label: 'General / Variety' },
                  { key: 'pharmacy', label: 'Pharmacy / Meds' },
                  { key: 'restaurant', label: 'Eateries / Bakeries' },
                  { key: 'other', label: 'Other Commercial' },
                ].map(({ key, label }) => (
                  <div
                    key={key}
                    className="p-2 bg-white rounded-xl border border-gray-200 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <span className="font-bold text-gray-800 text-xs truncate flex-1 min-w-0">{label}</span>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateShopCount(key, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center transition active:scale-90"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-black text-xs text-brand-purple">
                        {shopCounts[key] || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateShopCount(key, 1)}
                        className="w-7 h-7 rounded-lg bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-black flex items-center justify-center transition active:scale-90 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Competitor Stores Observed */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Step 3</span>
                  <label className="font-black text-gray-900 block text-xs">
                    Competitor Stores Seen ({competitors.length})
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addCompetitor}
                  className="text-xs font-bold text-brand-purple hover:underline flex items-center space-x-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Store</span>
                </button>
              </div>

              <div className="space-y-2">
                {competitors.map((comp, idx) => (
                  <div key={idx} className="p-2.5 bg-white rounded-xl border border-gray-200 space-y-2 relative shadow-xs">
                    <button
                      type="button"
                      onClick={() => removeCompetitor(idx)}
                      className="absolute right-2 top-2 p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                      title="Remove competitor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="space-y-1.5 pr-6 text-xs">
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold block">Store Name</span>
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompetitors((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, name: val } : c))
                            );
                          }}
                          className="w-full bg-slate-50 border border-gray-200 rounded-lg p-1.5 font-bold text-xs focus:outline-none focus:border-brand-purple"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-500 font-semibold block">Approx Size</span>
                        <input
                          type="text"
                          value={comp.approx_size}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompetitors((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, approx_size: val } : c))
                            );
                          }}
                          className="w-full bg-slate-50 border border-gray-200 rounded-lg p-1.5 text-xs focus:outline-none focus:border-brand-purple"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Dominant Household Type */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Step 4</span>
                <label className="font-black text-gray-900 block text-xs">
                  Dominant Household Type
                </label>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {[
                  { id: 'apartments', label: 'Apartments' },
                  { id: 'independent', label: 'Independent' },
                  { id: 'mixed', label: 'Mixed Density' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDominantHousehold(id)}
                    className={`py-2 px-1 rounded-xl font-bold border transition text-center text-[11px] ${
                      dominantHousehold === id
                        ? 'bg-brand-purple text-brand-yellow border-brand-purple shadow-xs font-black'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Lane Physical Infrastructure */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Step 5</span>
                <label className="font-black text-gray-900 block text-xs">
                  Lane Physical Infrastructure
                </label>
              </div>

              {/* Lane Width Slider */}
              <div className="bg-white p-2.5 rounded-xl border border-gray-200 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 font-semibold">Lane Width (feet):</span>
                  <span className="font-black text-brand-purple bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">{laneWidthFt} ft</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="80"
                  step="2"
                  value={laneWidthFt}
                  onChange={(e) => setLaneWidthFt(Number(e.target.value))}
                  className="w-full accent-brand-purple cursor-pointer"
                />
              </div>

              {/* Parking Availability */}
              <div className="space-y-1">
                <span className="text-gray-600 font-semibold block text-[11px]">Parking Availability:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'dedicated', label: 'Dedicated' },
                    { id: 'street_only', label: 'Street Only' },
                    { id: 'none', label: 'No Parking' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setParkingAvailability(id)}
                      className={`py-1.5 px-1 rounded-lg text-[11px] font-bold border transition text-center ${
                        parkingAvailability === id
                          ? 'bg-brand-purple text-white border-brand-purple shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Street Lighting Switch */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-gray-700 font-bold text-xs">Street Lighting Operational:</span>
                <button
                  type="button"
                  onClick={() => setStreetLighting((v) => !v)}
                  className={`px-3 py-1 rounded-full text-xs font-black transition ${
                    streetLighting ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {streetLighting ? 'Yes, Lit' : 'No / Dark'}
                </button>
              </div>
            </div>

            {/* 6. Qualitative Notes */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-1.5">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Step 6</span>
                <label className="font-black text-gray-900 block text-xs">
                  Surveyor Observations & Notes
                </label>
              </div>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mention customer rush hours, parking choke points..."
                className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
          </div>

          {/* Sticky Submission & Sync Action */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={saveDraftLocally}
              className="px-3 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 shrink-0"
            >
              Save Draft
            </button>

            <button
              id="btn-sync-survey-response"
              type="button"
              onClick={handleSyncSubmit}
              disabled={syncing}
              className="flex-1 py-2.5 bg-brand-yellow hover:bg-yellow-400 text-brand-purple font-black text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <CloudUpload className={`w-4 h-4 shrink-0 ${syncing ? 'animate-bounce' : ''}`} />
              <span className="truncate">{syncing ? 'Syncing...' : effectiveOnline ? 'Submit / Sync Now' : 'Save for Offline Sync'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Task List View */
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-gray-900 flex items-center space-x-1.5">
              <FilePlus className="w-4 h-4 text-brand-purple" />
              <span>Assigned Micro-Tasks ({tasks.length})</span>
            </h2>
            <span className="text-[11px] text-gray-500 font-semibold">
              {tasks.filter((t) => t.status === 'submitted').length} / {tasks.length} Completed
            </span>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <LoadingSpinner message="Loading assigned tasks..." />
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-2">
              <FilePlus className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="font-semibold text-gray-700">No tasks currently assigned to you.</p>
              <p>When the Survey Manager assigns catchment study cells to your persona, they will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task) => {
                const draftKey = `survey_draft_${task.id}`;
                const hasDraft = localStorage.getItem(draftKey) !== null && task.status !== 'submitted';
                const shortTaskId = task.id.replace('task_', '');

                return (
                  <div
                    key={task.id}
                    onClick={() => handleOpenTaskForm(task)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex flex-col space-y-2 ${
                      task.status === 'submitted'
                        ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                        : hasDraft
                        ? 'bg-purple-50/60 border-brand-purple/40 hover:border-brand-purple shadow-xs'
                        : 'bg-gray-50/80 border-gray-200 hover:border-brand-purple/40 shadow-xs'
                    }`}
                  >
                    {/* Top Row: Task ID & Badges */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-black text-brand-purple truncate">
                          Task #{shortTaskId}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-800 font-bold shrink-0">
                          Cell #{task.cell_id}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        task.status === 'submitted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {task.status}
                      </span>
                    </div>

                    {/* Middle: Title & Workload */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-900 truncate">
                        {task.study_property_title || 'Catchment Lane Survey'}
                      </h3>
                      <p className="text-[10px] text-gray-500 flex items-center space-x-1 mt-0.5">
                        <Navigation2 className="w-3 h-3 text-brand-purple shrink-0" />
                        <span>Workload: {task.workload_weight}x density • Est. 15-20 mins</span>
                      </p>
                    </div>

                    {/* Bottom Action Row: Clear Status & Definite Button */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {hasDraft ? (
                          <span className="text-brand-purple font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-pulse"></span>
                            Draft on device
                          </span>
                        ) : task.status === 'submitted' ? (
                          <span className="text-emerald-700 font-bold">✓ Submitted</span>
                        ) : (
                          <span>Ready for survey</span>
                        )}
                      </span>

                      <button
                        type="button"
                        className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition active:scale-95 flex items-center gap-1 shrink-0 ${
                          task.status === 'submitted'
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : hasDraft
                            ? 'bg-brand-purple text-brand-yellow hover:bg-brand-purple-dark shadow-sm'
                            : 'bg-brand-purple text-white hover:bg-brand-purple-dark shadow-sm'
                        }`}
                      >
                        <span>{task.status === 'submitted' ? 'Review' : hasDraft ? 'Resume' : 'Capture'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
