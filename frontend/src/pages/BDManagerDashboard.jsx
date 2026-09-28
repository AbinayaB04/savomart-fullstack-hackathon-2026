import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import MapView from '../components/MapView';
import LocalitySearch from '../components/LocalitySearch';
import ReportView from '../components/ReportView';
import ReportsListPage from './ReportsListPage';
import AnalysisProgressModal from '../components/AnalysisProgressModal';
import CompareModal from '../components/CompareModal';
import AssignScoutingModal from '../components/AssignScoutingModal';
import PropertyDetailModal from '../components/PropertyDetailModal';
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
  LayoutGrid,
  Building,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { key: 'scouted', label: 'Scouted', color: 'border-blue-500 bg-blue-50/50' },
  { key: 'under_review', label: 'Under Review', color: 'border-purple-500 bg-purple-50/50' },
  { key: 'proceed', label: 'Proceed', color: 'border-emerald-500 bg-emerald-50/50' },
  { key: 'catchment_study', label: 'Catchment Study', color: 'border-amber-500 bg-amber-50/50' },
  { key: 'approved', label: 'Approved', color: 'border-green-600 bg-green-50/50' },
  { key: 'rejected', label: 'Rejected', color: 'border-red-500 bg-red-50/50' },
  { key: 'on_hold', label: 'On Hold', color: 'border-gray-400 bg-gray-50/50' },
];

const RECOMMENDATION_TAGS = {
  proceed: 'bg-emerald-500 text-white',
  review: 'bg-amber-500 text-white',
  reject: 'bg-red-500 text-white',
};

export default function BDManagerDashboard() {
  const { currentUser } = useAuth();

  // Navigation state: 'map' | 'pipeline' | 'report' | 'reports_list'
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

  // Phase 3: Pipeline Properties & Scouting Assignments
  const [properties, setProperties] = useState([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [selectedPropertyModal, setSelectedPropertyModal] = useState(null);
  const [assignHotspotModalData, setAssignHotspotModalData] = useState(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadProperties = async () => {
    try {
      setLoadingProperties(true);
      const data = await api.getProperties();
      setProperties(data);
    } catch (err) {
      console.error('Failed to load pipeline properties:', err);
    } finally {
      setLoadingProperties(false);
    }
  };

  useEffect(() => {
    loadProperties();
  }, []);

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

  // Phase 3: Trigger Assign Scouting from Hotspot
  const handleAssignScouting = (hotspot) => {
    setAssignHotspotModalData({
      hotspot,
      reportId: activeReport?.id,
      reportName: activeReport?.name,
    });
  };

  // Property modal update callback
  const handlePropertyUpdated = (updatedProp) => {
    setProperties((prev) =>
      prev.map((p) => (p.id === updatedProp.id ? updatedProp : p))
    );
    showToast(`Property "${updatedProp.title}" moved to ${updatedProp.stage}!`);
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
            Area Intelligence & Pipeline Management
          </h1>
        </div>

        {/* View Switcher Tabs (3 Tabs: Map, Pipeline Kanban, Saved Reports) */}
        <div className="flex flex-wrap items-center p-1 bg-gray-100 rounded-xl space-x-1 self-start sm:self-auto text-xs font-bold">
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'map'
                ? 'bg-brand-purple text-brand-yellow shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive Map & Grid</span>
          </button>
          <button
            onClick={() => {
              loadProperties();
              setViewMode('pipeline');
            }}
            className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
              viewMode === 'pipeline'
                ? 'bg-brand-purple text-brand-yellow shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Pipeline Board ({properties.length})</span>
          </button>
          <button
            onClick={() => setViewMode('reports_list')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
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

      {/* VIEW 1: MAP & GRID SELECTION */}
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

              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-3 py-1.5 bg-gray-100 rounded-xl text-gray-700">
                  {selectedCellIds.length} cell{selectedCellIds.length === 1 ? '' : 's'} selected
                </span>

                <button
                  onClick={handleStartAnalysis}
                  disabled={selectedCellIds.length === 0}
                  className="px-4 py-2 bg-brand-purple text-brand-yellow hover:bg-brand-purple-dark text-xs font-extrabold rounded-xl shadow-md transition flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Analyse Selected Area</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Leaflet Map View */}
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-200 overflow-hidden">
            <MapView
              selectedCellIds={selectedCellIds}
              onToggleCell={handleToggleCell}
              flyTarget={flyTarget}
              reportGeom={activeReport?.geom}
              hotspots={activeReport?.hotspots}
            />
          </div>
        </div>
      )}

      {/* VIEW 2: KANBAN PIPELINE BOARD */}
      {viewMode === 'pipeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg font-black text-gray-900">Retail Property Pipeline</h2>
              <p className="text-xs text-gray-500">Track and progress candidate store sites through approval stages</p>
            </div>
            <button
              onClick={loadProperties}
              className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-brand-purple bg-white rounded-xl border border-gray-200 shadow-sm flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProperties ? 'animate-spin' : ''}`} />
              <span>Refresh Pipeline</span>
            </button>
          </div>

          {/* Kanban Columns Horizontal Scroll */}
          <div className="flex space-x-4 overflow-x-auto pb-6 pt-1">
            {PIPELINE_STAGES.map((stage) => {
              const stageProps = properties.filter((p) => p.stage === stage.key);
              return (
                <div
                  key={stage.key}
                  className="w-72 sm:w-80 shrink-0 bg-slate-100/80 rounded-3xl p-3.5 border border-slate-200 flex flex-col max-h-[75vh]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-3 px-1 border-b border-slate-200">
                    <span className="font-extrabold text-xs text-gray-900 uppercase tracking-wider">
                      {stage.label}
                    </span>
                    <span className="w-6 h-6 rounded-full bg-white text-brand-purple font-black text-xs flex items-center justify-center shadow-sm border border-gray-200">
                      {stageProps.length}
                    </span>
                  </div>

                  {/* Property Cards List */}
                  <div className="space-y-3 overflow-y-auto mt-3 pr-1">
                    {stageProps.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-400 italic">No properties in {stage.label}</div>
                    ) : (
                      stageProps.map((prop) => {
                        const evalData = prop.latest_evaluation;
                        const topRisks = evalData?.risks?.slice(0, 2) || [];
                        const primaryPhoto = prop.photos?.[0]?.photo_url;

                        return (
                          <div
                            key={prop.id}
                            onClick={() => setSelectedPropertyModal(prop)}
                            className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm hover:shadow-md hover:border-brand-purple/40 transition cursor-pointer space-y-3"
                          >
                            {/* Card Top: Photo & Title */}
                            <div className="flex items-start space-x-3">
                              {primaryPhoto ? (
                                <img
                                  src={primaryPhoto}
                                  alt={prop.title}
                                  className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-purple-50 text-brand-purple flex items-center justify-center font-bold shrink-0 border border-purple-100">
                                  <Building className="w-6 h-6" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-black text-gray-900 truncate">{prop.title}</h4>
                                <p className="text-[11px] text-gray-500 truncate mt-0.5">{prop.address}</p>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  {prop.area_sqft} sqft • {prop.frontage_ft} ft front
                                </span>
                              </div>
                            </div>

                            {/* Score & Recommendation Banner */}
                            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-sm font-black text-brand-purple">
                                  {evalData ? `${evalData.score}` : 'N/A'}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold">/ 100</span>
                              </div>
                              {evalData && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    RECOMMENDATION_TAGS[evalData.recommendation] || 'bg-gray-600 text-white'
                                  }`}
                                >
                                  {evalData.recommendation}
                                </span>
                              )}
                            </div>

                            {/* Rent vs Benchmark */}
                            {prop.rent_per_sqft && (
                              <div className="text-[11px] font-medium text-gray-600">
                                Rent: <span className="font-bold text-gray-900">₹{prop.rent_per_sqft}/sqft</span>
                              </div>
                            )}

                            {/* Top 2 Risks (30-second decision speed) */}
                            {topRisks.length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-gray-100">
                                {topRisks.map((risk, rIdx) => (
                                  <div
                                    key={rIdx}
                                    className="p-1.5 bg-rose-50 rounded-lg text-[10px] text-rose-800 flex items-start space-x-1 leading-tight"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                                    <span className="truncate">{risk}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: SAVED REPORTS LIST */}
      {viewMode === 'reports_list' && (
        <ReportsListPage
          onSelectReport={handleViewReportDetail}
          onBackToMap={() => setViewMode('map')}
          onCompareReports={(repA, repB) => {
            setCompareReportA(repA);
            setCompareReportB(repB);
            setShowCompareModal(true);
          }}
        />
      )}

      {/* VIEW 4: SINGLE REPORT DETAIL */}
      {viewMode === 'report' && activeReport && (
        <ReportView
          report={activeReport}
          onClose={() => setViewMode('map')}
          onAssignScouting={handleAssignScouting}
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

      {/* Side-by-side Compare Modal */}
      {showCompareModal && (
        <CompareModal
          reportA={compareReportA}
          reportB={compareReportB}
          onClose={() => setShowCompareModal(false)}
        />
      )}

      {/* Hotspot Assignment Modal */}
      {assignHotspotModalData && (
        <AssignScoutingModal
          hotspot={assignHotspotModalData.hotspot}
          reportId={assignHotspotModalData.reportId}
          reportName={assignHotspotModalData.reportName}
          onClose={() => setAssignHotspotModalData(null)}
          onSuccess={(asg) => {
            showToast(`Hotspot #${asg.cell_id} assigned to ${asg.assigned_to_name}!`);
          }}
        />
      )}

      {/* Property Detail Modal */}
      {selectedPropertyModal && (
        <PropertyDetailModal
          property={selectedPropertyModal}
          onClose={() => setSelectedPropertyModal(null)}
          onPropertyUpdated={handlePropertyUpdated}
        />
      )}
    </div>
  );
}
