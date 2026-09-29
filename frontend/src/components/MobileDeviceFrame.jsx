import React, { useState } from 'react';
import { Smartphone, Maximize2, Minimize2, Wifi, Battery, Signal } from 'lucide-react';

export default function MobileDeviceFrame({ children, title = 'Field Executive Mobile App' }) {
  const [showPhoneFrame, setShowPhoneFrame] = useState(true);

  return (
    <div className="w-full flex flex-col items-center py-2 sm:py-4">
      {/* Top Helper Bar for Desktop Users */}
      <div className="w-full max-w-md flex items-center justify-between px-3 py-1.5 mb-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm text-xs">
        <div className="flex items-center space-x-2 text-slate-700 font-bold">
          <Smartphone className="w-4 h-4 text-brand-purple" />
          <span className="hidden sm:inline">{title}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-yellow text-brand-purple">
            390 × 844 px
          </span>
        </div>

        {/* Toggle between Phone Frame and Expanded View */}
        <button
          onClick={() => setShowPhoneFrame(!showPhoneFrame)}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-purple-100 text-brand-purple font-extrabold text-[11px] transition shadow-xs"
          title="Toggle between phone mockup and full width"
        >
          {showPhoneFrame ? (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Width</span>
            </>
          ) : (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Phone Mockup</span>
            </>
          )}
        </button>
      </div>

      {/* Conditionally Render Realistic iPhone Chassis or Edge-to-Edge */}
      {showPhoneFrame ? (
        <div className="relative w-full max-w-[390px] mx-auto">
          {/* Realistic iPhone Titanium Frame */}
          <div className="w-full bg-slate-950 rounded-[50px] p-[10px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] ring-1 ring-slate-800">
            {/* Glossy bezel ring */}
            <div className="w-full bg-slate-900 rounded-[42px] overflow-hidden flex flex-col relative border border-slate-800">
              
              {/* iPhone Status Bar & Dynamic Island */}
              <div className="w-full bg-white pt-2.5 px-6 pb-1 flex items-center justify-between select-none z-20 shrink-0">
                <span className="text-[11px] font-bold text-slate-900 tracking-tight">9:41</span>
                
                {/* Dynamic Island Pill */}
                <div className="w-24 h-5 bg-slate-950 rounded-full flex items-center justify-end px-2 space-x-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800"></div>
                </div>

                {/* Status Icons */}
                <div className="flex items-center space-x-1 text-slate-900">
                  <Signal className="w-3 h-3" />
                  <Wifi className="w-3 h-3" />
                  <Battery className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Scrollable Mobile Screen Content */}
              <div
                className="w-full overflow-y-auto max-h-[760px] min-h-[640px] bg-slate-50 p-3 scrollbar-thin scrollbar-thumb-slate-200"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {children}
              </div>

              {/* Bottom Home Indicator Bar */}
              <div className="w-full bg-slate-50 py-2 flex items-center justify-center shrink-0 border-t border-slate-100">
                <div className="w-32 h-1 bg-slate-400 rounded-full"></div>
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* Edge to Edge View */
        <div className="w-full max-w-2xl mx-auto px-2">
          {children}
        </div>
      )}
    </div>
  );
}
