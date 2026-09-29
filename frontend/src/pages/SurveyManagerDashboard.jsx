import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ClipboardList,
  Users,
  SplitSquareVertical,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Search,
  CheckSquare,
  Shield,
  Layers,
  ChevronLeft,
  UserCheck,
} from 'lucide-react';
import { LoadingSpinner, ErrorState } from '../components/UIState';

const EXEC_COLORS = {
  usr_se_1: { border: '#782B90', fill: '#782B90', bg: 'bg-purple-100 text-purple-900 border-purple-300' },
  usr_se_2: { border: '#D97706', fill: '#D97706', bg: 'bg-amber-100 text-amber-900 border-amber-300' },
  unassigned: { border: '#94A3B8', fill: '#CBD5E1', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
  submitted: { border: '#10B981', fill: '#10B981', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
};

function getTaskColor(task) {
  if (task.status === 'submitted') return EXEC_COLORS.submitted;
  if (!task.assigned_to) return EXEC_COLORS.unassigned;
  return EXEC_COLORS[task.assigned_to] || { border: '#2563EB', fill: '#3B82F6', bg: 'bg-blue-100 text-blue-900 border-blue-300' };
}

function MapAutoBounds({ tasks }) {
  const map = useMap();
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    const allCoords = [];
    tasks.forEach((t) => {
      if (t.coordinates && t.coordinates.length > 0) {
        t.coordinates.forEach((pt) => allCoords.push(pt));
      }
    });
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [tasks, map]);
  return null;
}

export default function SurveyManagerDashboard() {
  const { currentUser, users } = useAuth();
  const [studies, setStudies] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const executives = users.filter((u) => u.role === 'survey_executive');

  const fetchStudies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStudies();
      setStudies(data);
    } catch (err) {
      console.error('Failed to load studies:', err);
      setError(err.message || 'Failed to load study inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudies();
  }, []);

  const handleSelectStudy = async (studyId) => {
    try {
      setLoadingDetail(true);
      setError(null);
      setSuccessMsg(null);
      const detailed = await api.getStudy(studyId);
      setSelectedStudy(detailed);
    } catch (err) {
      console.error('Failed to load study details:', err);
      setError(err.message || 'Failed to load study details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePlanTasks = async () => {
    if (!selectedStudy) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.planStudy(selectedStudy.id);
      setSelectedStudy(res.study);
      setSuccessMsg(res.message);
      fetchStudies();
    } catch (err) {
      console.error('Failed to plan tasks:', err);
      setError(err.message || 'Failed to propose task grid cells.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    if (!selectedStudy) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.autoAssignStudy(selectedStudy.id);
      setSelectedStudy(res.study);
      setSuccessMsg(res.message);
      fetchStudies();
    } catch (err) {
      console.error('Failed to auto-assign:', err);
      setError(err.message || 'Auto-assignment failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTask = async (taskId, assignedTo) => {
    try {
      setError(null);
      await api.assignTask(taskId, assignedTo);
      // Refresh detailed study
      const detailed = await api.getStudy(selectedStudy.id);
      setSelectedStudy(detailed);
      fetchStudies();
    } catch (err) {
      console.error('Failed to assign task:', err);
      setError(err.message || 'Failed to assign task.');
    }
  };

  const handleRollup = async () => {
    if (!selectedStudy) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.rollupStudy(selectedStudy.id);
      setSelectedStudy(res.study);
      setSuccessMsg('Catchment study rolled up successfully! Property re-evaluation triggered.');
      fetchStudies();
    } catch (err) {
      console.error('Failed to rollup study:', err);
      setError(err.message || 'Failed to roll up study.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredStudies = studies.filter((s) => {
    if (filterStatus !== 'ALL' && s.status !== filterStatus.toLowerCase()) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (s.property_title || s.report_name || '').toLowerCase().includes(q);
      const matchId = s.id.toLowerCase().includes(q);
      return matchTitle || matchId;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
              Survey Operations Lead
            </span>
            <span className="text-xs text-gray-500">• Field Catchment Hub</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mt-1">Catchment Survey Management</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
            Operations Manager: <span className="font-bold text-brand-purple">{currentUser?.name}</span>. Review incoming BD study requests, plan non-overlapping 500m grid cell tasks, and balance field workload.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStudies}
            disabled={loading}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition flex items-center space-x-1.5 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Content: Split-and-Assign View vs Inbox View */}
      {selectedStudy ? (
        /* Detailed Split and Assign View */
        <div className="space-y-6 animate-fade-in">
          {/* Back button and study summary header */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                onClick={() => setSelectedStudy(null)}
                className="inline-flex items-center space-x-1.5 text-xs font-bold text-gray-600 hover:text-brand-purple transition self-start"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Study Inbox</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {selectedStudy.reused_from_request_id && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    ⚡ 6-Month Spatial Reuse
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  selectedStudy.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-purple-100 text-brand-purple border border-purple-200'
                }`}>
                  Status: {selectedStudy.status}
                </span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-gray-100">
              <div>
                <span className="text-xs font-bold text-brand-purple uppercase tracking-wider">
                  Target {selectedStudy.target_type}:
                </span>
                <h2 className="text-xl font-black text-gray-900">
                  {selectedStudy.property_title || selectedStudy.report_name || selectedStudy.id}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Requested by <span className="font-semibold text-gray-800">{selectedStudy.requested_by_name}</span> • Radius: {selectedStudy.radius_m}m
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {selectedStudy.status === 'requested' && (!selectedStudy.tasks || selectedStudy.tasks.length === 0) && (
                  <button
                    id="btn-plan-study-tasks"
                    onClick={handlePlanTasks}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-brand-yellow hover:bg-yellow-400 text-brand-purple font-black text-xs rounded-xl shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                    <span>{actionLoading ? 'Splitting...' : 'Plan Tasks (Propose Grid Cells)'}</span>
                  </button>
                )}

                {selectedStudy.tasks && selectedStudy.tasks.length > 0 && selectedStudy.status !== 'completed' && (
                  <button
                    id="btn-auto-assign-tasks"
                    onClick={handleAutoAssign}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-brand-purple hover:bg-brand-purple-dark text-brand-yellow font-black text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Users className="w-4 h-4" />
                    <span>{actionLoading ? 'Balancing...' : 'Auto-Assign to Executives'}</span>
                  </button>
                )}

                {selectedStudy.status !== 'completed' && selectedStudy.submitted_tasks > 0 && (
                  <button
                    id="btn-force-rollup"
                    onClick={handleRollup}
                    disabled={actionLoading}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Roll Up Insights</span>
                  </button>
                )}
              </div>
            </div>

            {/* Reuse Notice */}
            {selectedStudy.reuse_reason && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold">Reuse Justification:</span>
                <span>{selectedStudy.reuse_reason}</span>
              </div>
            )}

            {/* Study Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                <span>Task Completion Progress</span>
                <span className="text-brand-purple">
                  {selectedStudy.submitted_tasks} of {selectedStudy.total_tasks} Tasks Submitted ({selectedStudy.progress_percent}%)
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-purple to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${selectedStudy.progress_percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Two-Column Split-and-Assign Screen */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 cols: Tasks Table and Assignee Reassignment */}
            <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4 max-h-[640px] flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-gray-900 flex items-center space-x-2">
                  <SplitSquareVertical className="w-4 h-4 text-brand-purple" />
                  <span>Survey Micro-Tasks ({selectedStudy.tasks?.length || 0})</span>
                </h3>
                <span className="text-[11px] text-gray-500 font-semibold">Non-overlapping 500m cells</span>
              </div>

              {/* Tasks List */}
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {selectedStudy.tasks && selectedStudy.tasks.length > 0 ? (
                  selectedStudy.tasks.map((task) => {
                    const colorSpec = getTaskColor(task);
                    return (
                      <div
                        key={task.id}
                        className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                          task.status === 'submitted'
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-gray-50/80 border-gray-200 hover:border-brand-purple/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorSpec.fill }} />
                            <span className="text-xs font-bold text-gray-900">Cell #{task.cell_id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-brand-purple font-extrabold">
                              Weight: {task.workload_weight}x
                            </span>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            task.status === 'submitted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {task.status}
                          </span>
                        </div>

                        {/* Assignee Control */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 text-xs">
                          <span className="text-gray-500 font-semibold text-[11px]">Assigned Executive:</span>
                          <select
                            value={task.assigned_to || ''}
                            onChange={(e) => handleAssignTask(task.id, e.target.value)}
                            disabled={task.status === 'submitted'}
                            className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-purple disabled:opacity-60"
                          >
                            <option value="">Unassigned</option>
                            {executives.map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                {ex.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Submitted Summary */}
                        {task.latest_response && (
                          <div className="p-2 bg-white rounded-xl border border-emerald-200 text-[11px] text-emerald-950 space-y-0.5">
                            <div className="font-bold flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Footfall: {task.latest_response.data?.footfall_count_10min || 0} / 10m (~{task.latest_response.data?.peak_hour_estimate || 0} peak/hr)</span>
                            </div>
                            <div className="text-gray-600">
                              Dom. Housing: {task.latest_response.data?.dominant_household_type} • Lane: {task.latest_response.data?.lane_width_ft} ft
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-gray-500 space-y-2">
                    <p>No survey tasks generated yet.</p>
                    <button
                      onClick={handlePlanTasks}
                      className="px-4 py-2 bg-brand-yellow text-brand-purple font-bold rounded-xl text-xs"
                    >
                      Propose Task Grid Cells
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right 7 cols: Interactive Leaflet Map with Task Polygons */}
            <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-gray-900 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-brand-purple" />
                  <span>Catchment Task Spatial Coverage</span>
                </h3>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  {executives.map((ex) => {
                    const c = EXEC_COLORS[ex.id] || { fill: '#3B82F6' };
                    return (
                      <span key={ex.id} className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                        <span>{ex.name}</span>
                      </span>
                    );
                  })}
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Submitted</span>
                  </span>
                </div>
              </div>

              {/* Map Container */}
              <div className="rounded-2xl overflow-hidden border border-gray-200 flex-1 min-h-[460px] relative z-10">
                <MapContainer
                  center={[13.0450, 80.2300]}
                  zoom={12}
                  style={{ height: '100%', width: '100%', minHeight: '460px' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />

                  {selectedStudy.tasks && <MapAutoBounds tasks={selectedStudy.tasks} />}

                  {selectedStudy.tasks?.map((task) => {
                    if (!task.coordinates || task.coordinates.length === 0) return null;
                    const colorSpec = getTaskColor(task);
                    return (
                      <Polygon
                        key={task.id}
                        positions={task.coordinates}
                        pathOptions={{
                          color: colorSpec.border,
                          weight: task.status === 'submitted' ? 3 : 2,
                          fillColor: colorSpec.fill,
                          fillOpacity: task.status === 'submitted' ? 0.5 : 0.28,
                        }}
                      >
                        <Popup>
                          <div className="p-1 space-y-1.5 text-xs font-sans">
                            <div className="font-extrabold text-brand-purple">Task #{task.id}</div>
                            <div><strong>Grid Cell:</strong> #{task.cell_id}</div>
                            <div><strong>Workload Weight:</strong> {task.workload_weight}x</div>
                            <div><strong>Assigned To:</strong> {task.assigned_to_name}</div>
                            <div>
                              <strong>Status:</strong>{' '}
                              <span className="capitalize font-bold text-brand-purple">{task.status}</span>
                            </div>
                            {task.latest_response && (
                              <div className="pt-1 text-[11px] text-emerald-800 border-t border-gray-200">
                                <div>Footfall (10m): {task.latest_response.data?.footfall_count_10min}</div>
                                <div>Peak Hour Est: {task.latest_response.data?.peak_hour_estimate}/hr</div>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Polygon>
                    );
                  })}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Study Inbox View */
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-gray-900 flex items-center space-x-2">
                <ClipboardList className="w-5 h-5 text-brand-purple" />
                <span>Catchment Study Operations Inbox</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Incoming study requests from BD Managers awaiting micro-task planning and assignment.
              </p>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search property or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-purple w-48"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              </div>

              <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                {['ALL', 'REQUESTED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      filterStatus === st ? 'bg-brand-purple text-brand-yellow shadow-xs' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <LoadingSpinner message="Loading study inbox..." />
            </div>
          ) : filteredStudies.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-500 space-y-2">
              <ClipboardList className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="font-semibold text-gray-700">No catchment study requests found.</p>
              <p>When BD Managers request catchment studies for properties or areas, they will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudies.map((study) => (
                <div
                  key={study.id}
                  onClick={() => handleSelectStudy(study.id)}
                  className="p-5 rounded-2xl border border-gray-200 bg-gray-50/50 hover:bg-white hover:border-brand-purple hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-brand-purple">#{study.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        study.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : study.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : study.status === 'planned'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {study.status}
                      </span>
                    </div>

                    <h3 className="text-sm font-extrabold text-gray-900 group-hover:text-brand-purple transition">
                      {study.property_title || study.report_name || 'Catchment Study'}
                    </h3>

                    <p className="text-xs text-gray-500">
                      Target: <span className="font-bold text-gray-700 capitalize">{study.target_type}</span> • {study.radius_m}m radius
                    </p>

                    {study.reused_from_request_id && (
                      <div className="text-[11px] p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-medium">
                        ⚡ {study.reuse_reason || 'Reused study within 6 months'}
                      </div>
                    )}
                  </div>

                  {/* Progress & Bottom Bar */}
                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-gray-600 font-semibold">
                      <span>Tasks: {study.submitted_tasks} / {study.total_tasks}</span>
                      <span className="text-brand-purple font-bold">{study.progress_percent}%</span>
                    </div>

                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-purple rounded-full"
                        style={{ width: `${study.progress_percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-400">
                        {study.created_at ? new Date(study.created_at).toLocaleDateString() : ''}
                      </span>
                      <span className="text-xs font-bold text-brand-purple group-hover:underline flex items-center space-x-0.5">
                        <span>Open Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
