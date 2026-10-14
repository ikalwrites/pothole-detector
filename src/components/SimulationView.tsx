/**
 * PotholeGuard AI - Live Video Simulation Testing Harness
 * SimulationView.tsx
 *
 * Implements:
 * 1. Multi-scenario driving simulation engine (Highway 80 km/h, Urban 30 km/h, Night Low-Light)
 * 2. User MP4 video file loader for real dashcam test footage
 * 3. Real-time telemetry dashboard (FPS, latency, hazards, stopping distance, TTI)
 * 4. Chronological Audio Trigger Log with Voice A / Voice B event breakdowns
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  Volume2,
  VolumeX,
  Gauge,
  Activity,
  AlertOctagon,
  Moon,
  Sun,
  Cloud,
  Layers,
  FileVideo,
  CheckCircle2,
  Trash2,
  Car,
} from 'lucide-react';
import { CameraHUD } from './CameraHUD';
import { SimulationEngine } from '../services/SimulationEngine';
import { defaultDetectionProcessor, RawTensorDetection } from '../services/DetectionProcessor';
import { audioAlertService } from '../services/AudioService';
import { AudioAlertEvent, PotholeDetection, RiskLevel, SimulationScenario, VoiceProfile } from '../types';

export const BUILT_IN_SCENARIOS: SimulationScenario[] = [
  {
    id: 'scenario_a',
    title: 'Scenario A: High Speed Highway',
    subtitle: '80 km/h — Critical stopping distance & Voice B trigger buffer',
    speedKmh: 80,
    lighting: 'daylight',
    description: 'Vehicle traveling at 80 km/h approaching a severe pothole at 48 meters. Stopping distance is ~48m, requiring Emergency Voice B alert well before the 10m proximity threshold.',
    expectedBehavior: 'Emergency Voice B triggers at ~28-30m due to vehicle velocity stopping distance calculation.',
    roadDefectsCount: 1,
    roadType: 'highway',
  },
  {
    id: 'scenario_b',
    title: 'Scenario B: Low Speed Urban',
    subtitle: '30 km/h — Multiple sequential road defects & deduplication',
    speedKmh: 30,
    lighting: 'overcast',
    description: 'City street with 3 consecutive potholes spaced 10-15 meters apart. Tests audio deduplication and priority preemption so voice alerts never stutter or talk over each other.',
    expectedBehavior: 'Navigator Voice A alerts sequentially without overlapping speech; deduplication suppresses duplicate alerts within 2.5s.',
    roadDefectsCount: 3,
    roadType: 'urban',
  },
  {
    id: 'scenario_c',
    title: 'Scenario C: Night / Low-Light Dashcam',
    subtitle: '50 km/h — Reduced contrast & confidence drop under headlights',
    speedKmh: 50,
    lighting: 'low_light_night',
    description: 'Rural asphalt road at night illuminated only by low-beam headlights. Evaluates bounding box confidence scores under low contrast and sensor noise.',
    expectedBehavior: 'Detection confidence lowers from 88% to 50-65%, but remains above 35% threshold to ensure timely warning.',
    roadDefectsCount: 2,
    roadType: 'rural_night',
  },
];

interface SimulationViewProps {
  isMuted: boolean;
  onToggleMute: () => void;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ isMuted, onToggleMute }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario>(BUILT_IN_SCENARIOS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedKmh, setSpeedKmh] = useState<number>(BUILT_IN_SCENARIOS[0].speedKmh);
  const [containerSize, setContainerSize] = useState({ width: 1280, height: 720 });
  const [detections, setDetections] = useState<PotholeDetection[]>([]);
  const [fps, setFps] = useState<number>(30);
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState<number>(11.5);
  const [customVideoFileName, setCustomVideoFileName] = useState<string | null>(null);

  // Audio state
  const [audioLogs, setAudioLogs] = useState<AudioAlertEvent[]>([]);
  const [activeAlertMessage, setActiveAlertMessage] = useState<string | null>(null);
  const [activeAlertRisk, setActiveAlertRisk] = useState<RiskLevel | null>(null);
  const [activeVoiceProfile, setActiveVoiceProfile] = useState<VoiceProfile | null>(null);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth || 1280,
          height: containerRef.current.clientHeight || 720,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Subscribe to Audio Alerts
  useEffect(() => {
    const unsubscribe = audioAlertService.onAlertTriggered((event: AudioAlertEvent) => {
      setActiveAlertMessage(event.message);
      setActiveAlertRisk(event.riskLevel);
      setActiveVoiceProfile(event.profile);
      setAudioLogs((prev) => [event, ...prev].slice(0, 30));

      const timer = setTimeout(() => {
        setActiveAlertMessage(null);
        setActiveAlertRisk(null);
        setActiveVoiceProfile(null);
      }, 3500);

      return () => clearTimeout(timer);
    });
    return unsubscribe;
  }, []);

  // Initialize and attach SimulationEngine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    const engine = new SimulationEngine(canvas, selectedScenario);
    engineRef.current = engine;

    let frameCount = 0;
    let lastTime = performance.now();

    // Attach CV Detection listener
    engine.setDetectionsCallback((rawDetections: RawTensorDetection[]) => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      const startTime = performance.now();
      const processed = defaultDetectionProcessor.processFrameDetections(
        rawDetections,
        canvas.width,
        canvas.height,
        engine.getSpeedKmh()
      );
      setInferenceLatencyMs(Number((performance.now() - startTime).toFixed(1)));
      setDetections(processed);

      // Trigger Audio Alert for closest detected hazard
      if (processed.length > 0) {
        const closest = processed[0];
        audioAlertService.triggerAlert(closest.distanceMeters, engine.getSpeedKmh(), closest.trackId);
      }
    });

    if (isPlaying) {
      engine.start();
    }

    return () => {
      engine.stop();
    };
  }, [containerSize, selectedScenario]);

  // Sync speed changes to engine
  const handleSpeedChange = (newSpeed: number) => {
    setSpeedKmh(newSpeed);
    if (engineRef.current) {
      engineRef.current.setSpeedKmh(newSpeed);
    }
  };

  const handleScenarioChange = (scenario: SimulationScenario) => {
    setSelectedScenario(scenario);
    setSpeedKmh(scenario.speedKmh);
    setCustomVideoFileName(null);
    if (engineRef.current) {
      engineRef.current.clearCustomVideo();
      engineRef.current.setScenario(scenario);
      engineRef.current.setSpeedKmh(scenario.speedKmh);
    }
  };

  const togglePlayback = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
    } else {
      engineRef.current.start();
      setIsPlaying(true);
    }
  };

  const resetSimulation = () => {
    if (engineRef.current) {
      engineRef.current.setScenario(selectedScenario);
      engineRef.current.setSpeedKmh(selectedScenario.speedKmh);
      setSpeedKmh(selectedScenario.speedKmh);
    }
  };

  // Custom Video File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engineRef.current) return;

    try {
      await engineRef.current.loadCustomVideo(file);
      setCustomVideoFileName(file.name);
      setSelectedScenario({
        id: 'custom_video',
        title: `Custom Footage: ${file.name}`,
        subtitle: 'User-provided driving MP4 dashcam stream',
        speedKmh: 60,
        lighting: 'daylight',
        description: 'Analyzing user-provided video frames via detection processor.',
        expectedBehavior: 'Real-time hazard detection on video playback.',
        roadDefectsCount: 1,
        roadType: 'highway',
      });
      setSpeedKmh(60);
      setIsPlaying(true);
      engineRef.current.start();
    } catch (err) {
      alert(`Error loading video: ${err}`);
    }
  };

  // Derived Physics Calculations
  const speedMs = (speedKmh * 1000) / 3600;
  // Stopping distance = Reaction Distance (1s) + Braking Distance (v^2 / (2 * g * mu))
  const stoppingDistanceMeters = Math.round(speedMs * 1.0 + (speedMs * speedMs) / (2 * 9.81 * 0.7));
  const closestHazard = detections[0] || null;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Scenario Selector Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          {BUILT_IN_SCENARIOS.map((scenario) => {
            const isSelected = selectedScenario.id === scenario.id && !customVideoFileName;
            return (
              <button
                key={scenario.id}
                id={`scenario-tab-${scenario.id}`}
                onClick={() => handleScenarioChange(scenario)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
                }`}
              >
                {scenario.lighting === 'low_light_night' ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : scenario.lighting === 'overcast' ? (
                  <Cloud className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
                <span>{scenario.title.split(':')[0]}</span>
                <span className="opacity-75 font-mono text-[11px]">({scenario.speedKmh} km/h)</span>
              </button>
            );
          })}
        </div>

        {/* Custom MP4 Video Loader */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            id="simulation-upload-mp4-btn"
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              customVideoFileName
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{customVideoFileName ? 'MP4 Loaded' : 'Load Dashcam MP4'}</span>
          </button>
        </div>
      </div>

      {/* Active Scenario Context Banner */}
      <div className="px-4 py-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-semibold text-slate-200">{selectedScenario.title}: </span>
          <span className="text-slate-400">{selectedScenario.description}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-300 font-mono">
          <span className="bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
            Expected: {selectedScenario.expectedBehavior}
          </span>
        </div>
      </div>

      {/* Main Simulation Viewfinder and Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Synthetic Road Viewfinder Canvas with HUD */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div
            ref={containerRef}
            className="relative w-full aspect-video min-h-[420px] bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center"
          >
            {/* Simulation Canvas (Procedural 3D perspective / Video playback) */}
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Viewfinder HUD Overlay with Color-coded risk boxes and metric distance tags */}
            <CameraHUD
              detections={detections}
              width={containerSize.width}
              height={containerSize.height}
              vehicleSpeedKmh={speedKmh}
              isMuted={isMuted}
              activeAlertMessage={activeAlertMessage}
              activeAlertRisk={activeAlertRisk}
              activeVoiceProfile={activeVoiceProfile}
            />

            {/* Top-Right Simulation Playback Badge */}
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
              <button
                id="simulation-toggle-play-btn"
                onClick={togglePlayback}
                className="p-2 rounded-xl bg-slate-900/85 backdrop-blur-md text-slate-200 border border-slate-700 hover:bg-slate-800 transition-colors shadow-lg"
                title={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-400" />}
              </button>

              <button
                id="simulation-reset-btn"
                onClick={resetSimulation}
                className="p-2 rounded-xl bg-slate-900/85 backdrop-blur-md text-slate-200 border border-slate-700 hover:bg-slate-800 transition-colors shadow-lg"
                title="Reset Scenario"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                id="simulation-mute-btn"
                onClick={onToggleMute}
                className={`p-2 rounded-xl backdrop-blur-md border transition-colors shadow-lg ${
                  isMuted
                    ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                    : 'bg-slate-900/85 text-emerald-400 border-slate-700 hover:bg-slate-800'
                }`}
                title={isMuted ? 'Unmute Audio Alerts' : 'Mute Audio Alerts'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Simulation Controls Strip */}
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className="font-mono text-slate-300 whitespace-nowrap flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-400" />
                SIMULATED SPEED: <strong className="text-white text-sm">{speedKmh} km/h</strong>
              </span>
              <input
                id="simulation-speed-slider"
                type="range"
                min="0"
                max="120"
                step="5"
                value={speedKmh}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="flex-1 accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Presets:</span>
              {[30, 50, 80, 100].map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleSpeedChange(preset)}
                  className={`px-2 py-1 rounded-md font-mono text-[11px] transition-colors ${
                    speedKmh === preset
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Telemetry Cards & Audio Trigger Logs */}
        <div className="flex flex-col gap-4">
          {/* Telemetry Matrix Card */}
          <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                Real-Time Telemetry
              </span>
              <span className="font-mono text-xs text-emerald-400 font-bold">{fps} FPS</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Closest Hazard Distance */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="text-slate-400 text-[11px]">Closest Hazard</div>
                <div
                  className={`text-xl font-bold font-mono mt-1 ${
                    closestHazard
                      ? closestHazard.riskLevel === 'critical'
                        ? 'text-red-400'
                        : 'text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {closestHazard ? `${closestHazard.distanceMeters.toFixed(1)}m` : 'Clear'}
                </div>
              </div>

              {/* Time to Impact */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="text-slate-400 text-[11px]">Time to Impact</div>
                <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                  {closestHazard?.timeToImpactSeconds !== null && closestHazard?.timeToImpactSeconds !== undefined
                    ? `${closestHazard.timeToImpactSeconds.toFixed(1)}s`
                    : '—'}
                </div>
              </div>

              {/* Stopping Distance Required */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="text-slate-400 text-[11px]">Stopping Distance</div>
                <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
                  ~{stoppingDistanceMeters}m
                </div>
              </div>

              {/* Inference Latency */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="text-slate-400 text-[11px]">Inference Latency</div>
                <div className="text-lg font-bold font-mono text-emerald-300 mt-1">
                  {inferenceLatencyMs} ms
                </div>
              </div>
            </div>

            {/* Distance Safety Status */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
              <span className="text-slate-400">Stopping Margin:</span>
              {closestHazard ? (
                closestHazard.distanceMeters >= stoppingDistanceMeters ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Safe (+{(closestHazard.distanceMeters - stoppingDistanceMeters).toFixed(0)}m buffer)
                  </span>
                ) : (
                  <span className="text-red-400 font-bold flex items-center gap-1 animate-pulse">
                    <AlertOctagon className="w-3.5 h-3.5" />
                    Hazard Alert (-{(stoppingDistanceMeters - closestHazard.distanceMeters).toFixed(0)}m)
                  </span>
                )
              ) : (
                <span className="text-slate-500">No obstacle</span>
              )}
            </div>
          </div>

          {/* Audio Trigger Event Log */}
          <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-3 flex-1 min-h-[260px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Audio Alert Event Log ({audioLogs.length})
                </span>
              </div>
              {audioLogs.length > 0 && (
                <button
                  id="simulation-clear-logs-btn"
                  onClick={() => setAudioLogs([])}
                  className="text-slate-400 hover:text-red-400 transition-colors p-1"
                  title="Clear Log"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-2 pr-1">
              {audioLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No alerts triggered yet. As hazards approach within threshold, Voice A (Navigator) or Voice B (Emergency) alerts will appear here.
                </div>
              ) : (
                audioLogs.map((log) => {
                  const isEmergency = log.profile === 'emergency';
                  return (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1 transition-all ${
                        isEmergency
                          ? 'bg-red-950/40 border-red-500/40 text-red-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isEmergency ? 'bg-red-600 text-white' : 'bg-cyan-600/30 text-cyan-300'
                          }`}
                        >
                          {log.profile === 'emergency' ? 'Voice B (Emergency)' : 'Voice A (Navigator)'}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                        </span>
                      </div>
                      <div className="font-semibold text-xs mt-0.5">"{log.message}"</div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                        <span>Distance: <strong>{log.distanceMeters}m</strong></span>
                        <span>Speed: {log.speedKmh} km/h</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
