import React from 'react';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';
import { Compass, FileText, CheckSquare, PlusCircle, TrendingUp, Store } from 'lucide-react';

export default function BDManagerDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-brand-purple">
              BD Manager Workspace
            </span>
            <span className="text-xs text-gray-500">• Chennai Operations</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-1">
            Expansion Intelligence & Pipeline
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Welcome back, <span className="font-semibold text-brand-purple">{currentUser?.name}</span>. Evaluate Chennai grid fitness, assign scouting targets, and progress retail sites.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <button className="px-4 py-2 bg-brand-yellow hover:bg-brand-yellow-hover text-brand-purple font-bold text-sm rounded-xl shadow-sm transition flex items-center space-x-2">
            <Compass className="w-4 h-4" />
            <span>Area Fitness Report</span>
          </button>
          <button className="px-4 py-2 bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold text-sm rounded-xl shadow-sm transition flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-brand-yellow" />
            <span>Request Catchment Study</span>
          </button>
        </div>
      </div>

      {/* Main Map View Section */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
              <Store className="w-5 h-5 text-brand-purple" />
              <span>Chennai Store Network & Scouting Grid</span>
            </h2>
            <p className="text-xs text-gray-500">
              Interactive map displaying operational Savomart stores and 500m scouting mesh.
            </p>
          </div>
        </div>

        {/* Map */}
        <MapView height="540px" />
      </div>

      {/* Quick Metrics & Pipeline Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Scouting Hotspots</span>
            <TrendingUp className="w-4 h-4 text-brand-purple" />
          </div>
          <div className="text-2xl font-black text-brand-purple">14 Areas</div>
          <p className="text-xs text-gray-500 mt-1">High fitness clusters identified in South & West Chennai</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pipeline Properties</span>
            <FileText className="w-4 h-4 text-brand-purple" />
          </div>
          <div className="text-2xl font-black text-brand-purple">8 Properties</div>
          <p className="text-xs text-gray-500 mt-1">2 in Technical Diligence, 6 in Initial Evaluation</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Catchment Studies</span>
            <CheckSquare className="w-4 h-4 text-brand-purple" />
          </div>
          <div className="text-2xl font-black text-brand-purple">3 In Progress</div>
          <p className="text-xs text-gray-500 mt-1">Delegated to Survey Operations team</p>
        </div>
      </div>
    </div>
  );
}
