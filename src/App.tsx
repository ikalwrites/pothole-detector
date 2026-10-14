/**
 * PotholeGuard AI - Principal Application Entry
 * App.tsx
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  Camera,
  PlaySquare,
  Sparkles,
  FileCode2,
  Volume2,
  VolumeX,
  Gauge,
  Cpu,
  Car,
} from 'lucide-react';
import { LiveCameraView } from './components/LiveCameraView';
import { SimulationView } from './components/SimulationView';
import { ScenarioEvaluationSuite } from './components/ScenarioEvaluationSuite';
import { ArchitectureAndCodeViewer } from './components/ArchitectureAndCodeViewer';
import { audioAlertService } from './services/AudioService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'camera' | 'simulation' | 'benchmark' | 'code'>('simulation');
  const [vehicleSpeedKmh, setVehicleSpeedKmh] = useState<number>(60);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const toggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    audioAlertService.setMuted(nextState);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Cockpit Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20">
            <ShieldAlert className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                PotholeGuard <span className="text-cyan-400">AI</span>
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                TFLite FP16
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Edge Vision Smart Dashcam Assistant • Dual-Voice Audio Warning Engine
            </p>
          </div>
        </div>

        {/* Center Tabs Navigation */}
        <nav className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <button
            id="nav-tab-simulation"
            onClick={() => setActiveTab('simulation')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'simulation'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlaySquare className="w-3.5 h-3.5" />
            <span>Simulation Mode</span>
          </button>

          <button
            id="nav-tab-camera"
            onClick={() => setActiveTab('camera')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'camera'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Camera</span>
          </button>

          <button
            id="nav-tab-benchmark"
            onClick={() => setActiveTab('benchmark')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'benchmark'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Benchmark Tests</span>
          </button>

          <button
            id="nav-tab-code"
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Source Code & Architecture</span>
            <span className="md:hidden">Code</span>
          </button>
        </nav>

        {/* Quick Global Actions (Speed indicator & Audio Mute) */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono">
            <Car className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">VEHICLE:</span>
            <span className="text-white font-bold">{vehicleSpeedKmh} km/h</span>
          </div>

          <button
            id="global-mute-toggle-btn"
            onClick={toggleMute}
            className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1.5 ${
              isMuted
                ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
            }`}
            title={isMuted ? 'Unmute Audio Voice Alerts' : 'Mute Audio Alerts'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span className="hidden md:inline">{isMuted ? 'Muted' : 'Voice On'}</span>
          </button>
        </div>
      </header>

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {activeTab === 'simulation' && (
          <SimulationView isMuted={isMuted} onToggleMute={toggleMute} />
        )}

        {activeTab === 'camera' && (
          <LiveCameraView
            vehicleSpeedKmh={vehicleSpeedKmh}
            onSpeedChange={setVehicleSpeedKmh}
            isMuted={isMuted}
            onToggleMute={toggleMute}
          />
        )}

        {activeTab === 'benchmark' && <ScenarioEvaluationSuite />}

        {activeTab === 'code' && <ArchitectureAndCodeViewer />}
      </main>

      {/* Bottom Architectural Signature Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span>PotholeGuard AI v1.0.0</span>
          <span>•</span>
          <span>TensorFlow Lite FP16 (YOLOv8 Nano [1, 5, 8400])</span>
          <span>•</span>
          <span>Optical Distance Model: W_real · f / W_pixel</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">Voice A (Navigator &gt;15m)</span>
          <span>•</span>
          <span className="text-red-400">Voice B (Emergency &le;10m)</span>
        </div>
      </footer>
    </div>
  );
}
