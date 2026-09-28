import React from 'react';
import { X, Award, ArrowLeftRight } from 'lucide-react';

export default function CompareModal({ reportA, reportB, onClose }) {
  if (!reportA || !reportB) return null;

  const factorsA = reportA.breakdown || [];
  const factorsB = reportB.breakdown || [];

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-gray-200 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-brand-yellow flex items-center justify-center text-brand-purple font-black">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Side-by-Side Area Report Comparison</h2>
              <p className="text-xs text-gray-500">Comparative retail viability and factor analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Head-to-head score comparison */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {/* Report A */}
          <div className="p-5 rounded-2xl bg-purple-50/50 border-2 border-brand-purple space-y-2">
            <span className="text-xs font-bold text-brand-purple uppercase tracking-wider">Area Report A</span>
            <h3 className="text-lg font-extrabold text-gray-900 truncate">{reportA.name}</h3>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-brand-purple">{reportA.score}</span>
              <span className="text-xs font-bold text-gray-500">/ 100</span>
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-white text-brand-purple border border-purple-200">
                {reportA.band}
              </span>
            </div>
            <div className="text-xs text-gray-600">
              Est. Population: <strong>{Number(reportA.area_profile?.est_population || 0).toLocaleString()}</strong>
            </div>
            <div className="text-xs text-gray-600">
              Competitors: <strong>{(reportA.area_profile?.supermarkets || 0) + (reportA.area_profile?.grocery_stores || 0)}</strong>
            </div>
          </div>

          {/* Report B */}
          <div className="p-5 rounded-2xl bg-yellow-50/40 border-2 border-yellow-400 space-y-2">
            <span className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Area Report B</span>
            <h3 className="text-lg font-extrabold text-gray-900 truncate">{reportB.name}</h3>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-gray-900">{reportB.score}</span>
              <span className="text-xs font-bold text-gray-500">/ 100</span>
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-white text-gray-800 border border-gray-200">
                {reportB.band}
              </span>
            </div>
            <div className="text-xs text-gray-600">
              Est. Population: <strong>{Number(reportB.area_profile?.est_population || 0).toLocaleString()}</strong>
            </div>
            <div className="text-xs text-gray-600">
              Competitors: <strong>{(reportB.area_profile?.supermarkets || 0) + (reportB.area_profile?.grocery_stores || 0)}</strong>
            </div>
          </div>
        </div>

        {/* Side-by-side factor bars */}
        <div className="space-y-4 pt-2">
          <h4 className="text-sm font-bold text-gray-900">Factor-by-Factor Breakdown</h4>
          <div className="space-y-3">
            {factorsA.map((fA, idx) => {
              const fB = factorsB.find((b) => b.factor === fA.factor) || {};
              return (
                <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                    <span>{fA.name}</span>
                    <span className="text-gray-500 font-semibold">Weight: {fA.weight}%</span>
                  </div>

                  {/* Dual Comparison Bars */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* A bar */}
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-600 mb-1">
                        <span>A: {fA.points} pts</span>
                        <span>{fA.raw_value} {fA.unit}</span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-brand-purple h-2 rounded-full"
                          style={{ width: `${Math.min(100, (fA.normalised || 0) * 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* B bar */}
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-600 mb-1">
                        <span>B: {fB.points || 0} pts</span>
                        <span>{fB.raw_value || 0} {fB.unit}</span>
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-yellow-500 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (fB.normalised || 0) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
