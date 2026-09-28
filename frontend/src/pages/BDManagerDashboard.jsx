import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MapView from '../components/MapView';
import LocalitySearch from '../components/LocalitySearch';
import ReportView from '../components/ReportView';
import ReportsListPage from './ReportsListPage';
import AnalysisProgressModal from '../components/AnalysisProgressModal';
import CompareModal from '../components/CompareModal';
import {
  Compass,
  FileText,
  MapPin,
  Trash2,
  Sparkles,
  Layers,
  ArrowLeft,
  Store,
  ChevronRight,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';

export default function BDManagerDashboard() {
  const { currentUser } = useAuth();

  // Navigation state: 'map' | 'report' | 'reports_list'
  const [viewMode, setViewMode] = useState('map');

  // Map & Selection state
  const [selectedCellIds, setSelectedCellIds] = useState([]);
  const [flyTarget, setFlyTarget] = useState(null);
  const [areaNameInput, setAreaNameInput] = useState('');

  // Analysis / Job state
  const [activeReportId, setActiveReportId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Compare state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareReportA, setCompareReportA] = useState(null);
  const [compareReportB, setCompareReportB] = useState(null);

  // Success message toast
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleCell = (cellId) => {
    setSelectedCellIds((prev) =>
      prev.includes(cellId) ? prev.filter((id) => id !== cellId) : [...prev, cellId]
    );
  };

  const handleClearSelection = () => {
    setSelectedCellIds([]);
  };

  const handleLocalitySelect = (locality) => {
    if (locality.boundingbox) {
      // Nominatim boundingbox: [minLat, maxLat, minLon, maxLon]
      const [minLat, maxLat, minLon, maxLon] = locality.boundingbox;
      setFlyTarget({
        bounds: [
          [minLat, minLon],
          [maxLat, maxLon],
        ],
      });
    } else {
      setFlyTarget({
        lat: locality.lat,
        lon: locality.lon,
        zoom: 14,
      });
    }
  };

  const handleStartAnalysis = async () => {
    if (selectedCellIds.length === 0) return;

    try {
      const defaultName = areaNameInput.trim() || `Chennai Area Evaluation (${selectedCellIds.length} Cells)`;
      const res = await api.createReport(selectedCellIds, defaultName);
      setActiveReportId(res.id);
      setShowProgressModal(true);
    } catch (err) {
      console.error('Failed to trigger area analysis:', err);
      showToast('Error initiating area analysis. Please try again.');
    }
  };

  const handleAnalysisComplete = (completedReport) => {
    setShowProgressModal(false);
    setActiveReport(completedReport);
    setViewMode('report');
    showToast(`Report generated with score ${completedReport.score}/100!`);
  };

  const handleViewReportDetail = async (reportId) => {
    try {
      const rep = await api.getReport(reportId);
      setActiveReport(rep);
      setViewMode('report');
    } catch (err) {
      console.error('Failed to load report detail:', err);
      showToast('Could not load report details.');
    }
  };

  const handleAssignScouting = (hotspot) => {
    showToast(
      `Hotspot #${hotspot.cell_id} queued for BD Executive scouting dispatch (wired in next phase).`
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[2500] bg-brand-purple text-white px-4 py-3 rounded-2xl shadow-xl border border-brand-yellow/40 flex items-center space-x-2 text-xs sm:text-sm font-semibold animate-fade-in">
          <CheckCircle className="w-4 h-4 text-brand-yellow" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Header / Sub-Nav */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-brand-purple">
              BD Manager Workspace
            </span>
            <span className="text-xs text-gray-500">• Chennai Retail Expansion</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
            Area Intelligence & Fitness Reporting
          </h1>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 bg-gray-100 rounded-xl space-x-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              viewMode === 'map'
                ? 'bg-brand-purple text-brand-yellow shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive Map & Grid</span>
          </button>
          <button
            onClick={() => setViewMode('reports_list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              viewMode === 'reports_list'
                ? 'bg-brand-purple text-brand-yellow shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Saved Reports</span>
          </button>
        </div>
      </div>

      {/* VIEW: MAP & GRID SELECTION */}
      {viewMode === 'map' && (
        <div className="space-y-4">
          {/* Map Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Locality Search Box */}
            <div className="flex-1">
              <LocalitySearch onSelectLocality={handleLocalitySelect} />
            </div>

            {/* Selection Status & Action Trigger */}
            <div className="flex flex-wrap items-center gap-2.5">
              {selectedCellIds.length > 0 && (
                <>
                  <input
                    type="text"
                    value={areaNameInput}
                    onChange={(e) => setAreaNameInput(e.target.value)}
                    placeholder="Custom report name (optional)..."
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purple w-56"
                  />
                  <button
                    onClick={handleClearSelection}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                    title="Clear selected cells"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={handleStartAnalysis}
                disabled={selectedCellIds.length === 0}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition flex items-center space-x-2 ${
                  selectedCellIds.length > 0
                    ? 'bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple cursor-pointer shadow-md'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {selectedCellIds.length > 0
                    ? `Analyse Selected Area (${selectedCellIds.length} Cells)`
                    : 'Select Cells on Map (Zoom ≥ 13)'}
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Map */}
          <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm">
            <MapView
              height="580px"
              flyTarget={flyTarget}
              enableGrid={true}
              selectedCellIds={selectedCellIds}
              onToggleCell={handleToggleCell}
            />
          </div>
        </div>
      )}

      {/* VIEW: SINGLE REPORT DETAILS */}
      {viewMode === 'report' && activeReport && (
        <div className="space-y-4">
          <button
            onClick={() => setViewMode('map')}
            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Scouting Map</span>
          </button>

          {/* Mini Map showing Report Union Geometry and Hotspots */}
          <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm">
            <div className="text-xs font-bold text-gray-800 mb-2 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-purple" />
              <span>Evaluated Area Geometry & Hotspots</span>
            </div>
            <MapView
              height="280px"
              center={activeReport.hotspots?.[0]?.centroid ? [activeReport.hotspots[0].centroid[1], activeReport.hotspots[0].centroid[0]] : [13.04, 80.23]}
              zoom={13}
              enableGrid={false}
              unionGeometry={activeReport.geometry}
              hotspots={activeReport.hotspots || []}
            />
          </div>

          {/* Full Report Details */}
          <ReportView
            report={activeReport}
            onAssignScouting={handleAssignScouting}
            onCompareClick={() => setViewMode('reports_list')}
          />
        </div>
      )}

      {/* VIEW: REPORTS LIST & COMPARE */}
      {viewMode === 'reports_list' && (
        <ReportsListPage
          onSelectReport={handleViewReportDetail}
          onNewAnalysis={() => setViewMode('map')}
        />
      )}

      {/* Progress Polling Modal */}
      {showProgressModal && (
        <AnalysisProgressModal
          reportId={activeReportId}
          onComplete={handleAnalysisComplete}
          onClose={() => setShowProgressModal(false)}
        />
      )}
    </div>
  );
}
