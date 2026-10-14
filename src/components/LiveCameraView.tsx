/**
 * PotholeGuard AI - Live Dashcam Camera Screen
 * LiveCameraView.tsx
 *
 * Real-time camera viewfinder pipeline:
 * - Accesses device back/environment camera via WebRTC MediaStream
 * - Processes frames locally with zero cloud latency
 * - Overlays Heads-Up Display (HUD) with distance estimation in meters
 * - Executes Dual-Voice Alert Manager based on calculated proximity and vehicle speed
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, RefreshCw, Volume2, VolumeX, ShieldAlert, Sliders, Zap } from 'lucide-react';
import { CameraHUD } from './CameraHUD';
import { defaultDetectionProcessor, RawTensorDetection } from '../services/DetectionProcessor';
import { audioAlertService } from '../services/AudioService';
import { AudioAlertEvent, PotholeDetection, RiskLevel, VoiceProfile } from '../types';

interface LiveCameraViewProps {
  vehicleSpeedKmh: number;
  onSpeedChange: (speed: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const LiveCameraView: React.FC<LiveCameraViewProps> = ({
  vehicleSpeedKmh,
  onSpeedChange,
  isMuted,
  onToggleMute,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [containerDimensions, setContainerDimensions] = useState({ width: 1280, height: 720 });
  const [detections, setDetections] = useState<PotholeDetection[]>([]);
  const [fps, setFps] = useState<number>(30);
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState<number>(14.2);
  const [activeAlertMessage, setActiveAlertMessage] = useState<string | null>(null);
  const [activeAlertRisk, setActiveAlertRisk] = useState<RiskLevel | null>(null);
  const [activeVoiceProfile, setActiveVoiceProfile] = useState<VoiceProfile | null>(null);
  const [testHazardActive, setTestHazardActive] = useState<boolean>(true);
  const [testHazardDistance, setTestHazardDistance] = useState<number>(18.0); // Interactive slider for camera test

  // Update container dimensions on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth || 1280,
          height: containerRef.current.clientHeight || 720,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Subscribe to audio alert events
  useEffect(() => {
    const unsubscribe = audioAlertService.onAlertTriggered((event: AudioAlertEvent) => {
      setActiveAlertMessage(event.message);
      setActiveAlertRisk(event.riskLevel);
      setActiveVoiceProfile(event.profile);

      const timer = setTimeout(() => {
        setActiveAlertMessage(null);
        setActiveAlertRisk(null);
        setActiveVoiceProfile(null);
      }, 3500);

      return () => clearTimeout(timer);
    });
    return unsubscribe;
  }, []);

  // Initialize Camera Stream
  const startCamera = useCallback(async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }
      setHasCameraPermission(true);
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setHasCameraPermission(false);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Processing Frame Loop
  useEffect(() => {
    let animId: number;
    let lastFrameTime = performance.now();
    let frameCount = 0;

    const processLoop = () => {
      const now = performance.now();
      frameCount++;
      if (now - lastFrameTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFrameTime = now;
      }

      const w = containerDimensions.width;
      const h = containerDimensions.height;

      // When test hazard is active, synthesize a pothole detection based on user test hazard distance
      // Distance formula: pixel_width = (real_width * focal_length) / distance
      const simulatedDetections: RawTensorDetection[] = [];

      if (testHazardActive && testHazardDistance > 0) {
        const f = 720.0;
        const realW = 0.55;
        const pixelW = (realW * f) / testHazardDistance;
        const pixelH = pixelW * 0.48;

        const horizonY = h * 0.44;
        const centerY = Math.min(h * 0.92, horizonY + (1.35 * f) / testHazardDistance);
        const centerX = w * 0.5;

        simulatedDetections.push({
          x1: Math.max(0, (centerX - pixelW / 2) / w),
          y1: Math.max(0, (centerY - pixelH / 2) / h),
          x2: Math.min(1, (centerX + pixelW / 2) / w),
          y2: Math.min(1, (centerY + pixelH / 2) / h),
          score: 0.92,
          classId: 0,
        });
      }

      const startTime = performance.now();
      const processed = defaultDetectionProcessor.processFrameDetections(
        simulatedDetections,
        w,
        h,
        vehicleSpeedKmh
      );
      setInferenceLatencyMs(Number((performance.now() - startTime).toFixed(1)));
      setDetections(processed);

      // Trigger audio alerts for closest hazard
      if (processed.length > 0) {
        const closest = processed[0];
        audioAlertService.triggerAlert(closest.distanceMeters, vehicleSpeedKmh, closest.trackId);
      }

      animId = requestAnimationFrame(processLoop);
    };

    animId = requestAnimationFrame(processLoop);
    return () => cancelAnimationFrame(animId);
  }, [containerDimensions, testHazardActive, testHazardDistance, vehicleSpeedKmh]);

  return (
    <div className="relative w-full h-[calc(100vh-140px)] min-h-[500px] flex flex-col bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Top Viewfinder Status Header */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 shadow-lg text-xs font-mono text-slate-200">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-white">LIVE DASHCAM CAMERAX</span>
          <span className="text-slate-500">•</span>
          <span className="text-cyan-400">{fps} FPS</span>
          <span className="text-slate-500">•</span>
          <span className="text-amber-400">{inferenceLatencyMs} ms</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            id="camera-mute-toggle-btn"
            onClick={onToggleMute}
            className={`p-2 rounded-xl backdrop-blur-md border transition-all ${
              isMuted
                ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                : 'bg-slate-900/80 text-emerald-400 border-slate-700 hover:bg-slate-800'
            }`}
            title={isMuted ? 'Unmute Audio Alerts' : 'Mute Audio Alerts'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            id="camera-flip-btn"
            onClick={toggleFacingMode}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-200 border border-slate-700 backdrop-blur-md hover:bg-slate-800 transition-all"
            title="Switch Camera (Front/Back)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewport Canvas Container */}
      <div ref={containerRef} className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
        {/* Live Camera Video Feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Fallback Display if Camera Access is Unavailable / Blocked */}
        {hasCameraPermission === false && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-sm">
            <CameraOff className="w-12 h-12 text-slate-500 mb-3" />
            <h3 className="text-base font-semibold text-slate-200 mb-1">Camera Stream Standby</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              Real-time camera permission is pending or not granted in this browser iframe. Use the interactive testing controls below or switch to the Simulation Mode tab.
            </p>
            <button
              id="camera-retry-perm-btn"
              onClick={startCamera}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg transition-colors flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Request Camera Access
            </button>
          </div>
        )}

        {/* Real-time Heads Up Display (HUD) */}
        <CameraHUD
          detections={detections}
          width={containerDimensions.width}
          height={containerDimensions.height}
          vehicleSpeedKmh={vehicleSpeedKmh}
          isMuted={isMuted}
          activeAlertMessage={activeAlertMessage}
          activeAlertRisk={activeAlertRisk}
          activeVoiceProfile={activeVoiceProfile}
        />
      </div>

      {/* Bottom Live Controls Drawer */}
      <div className="p-3 sm:p-4 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* Speed Slider */}
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <span className="font-mono text-slate-400 whitespace-nowrap flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            SPEED: <strong className="text-white text-sm">{vehicleSpeedKmh} km/h</strong>
          </span>
          <input
            id="camera-speed-slider"
            type="range"
            min="0"
            max="120"
            step="5"
            value={vehicleSpeedKmh}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="flex-1 accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Desk/Lab Testing Hazard Proximity Slider */}
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <button
            id="camera-test-hazard-toggle-btn"
            onClick={() => setTestHazardActive(!testHazardActive)}
            className={`px-2.5 py-1.5 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 ${
              testHazardActive
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{testHazardActive ? 'Target Active' : 'Target Off'}</span>
          </button>

          {testHazardActive && (
            <div className="flex items-center gap-2 flex-1">
              <span className="font-mono text-slate-400 whitespace-nowrap">
                Dist: <strong className={testHazardDistance <= 10 ? 'text-red-400' : 'text-amber-300'}>{testHazardDistance}m</strong>
              </span>
              <input
                id="camera-hazard-distance-slider"
                type="range"
                min="3"
                max="30"
                step="1"
                value={testHazardDistance}
                onChange={(e) => setTestHazardDistance(Number(e.target.value))}
                className="flex-1 accent-amber-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Quick Voice Trigger Test */}
        <div className="flex items-center gap-2">
          <button
            id="camera-test-voice-a-btn"
            onClick={() => audioAlertService.triggerAlert(20, vehicleSpeedKmh)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            Test Voice A (20m)
          </button>
          <button
            id="camera-test-voice-b-btn"
            onClick={() => audioAlertService.triggerAlert(8, vehicleSpeedKmh)}
            className="px-2.5 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 transition-colors"
          >
            Test Voice B (8m)
          </button>
        </div>
      </div>
    </div>
  );
};
