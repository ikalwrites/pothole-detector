/**
 * PotholeGuard AI - Heads-Up Display (HUD) Component
 * CameraHUD.tsx
 *
 * Renders:
 * - Color-coded bounding boxes: Yellow for Warning (>10m & <=18m), Red for Critical Danger (<=10m or emergency TTI)
 * - Dynamic distance counters in meters overlaid on top of each bounding box
 * - Time-To-Impact (TTI) and detection confidence tags
 * - Horizon line and dashcam trajectory guide
 * - Critical flash alert banner when in collision range
 */

import React, { useEffect, useRef } from 'react';
import { PotholeDetection, RiskLevel } from '../types';
import { AlertTriangle, ShieldAlert, Volume2 } from 'lucide-react';

interface CameraHUDProps {
  detections: PotholeDetection[];
  width: number;
  height: number;
  vehicleSpeedKmh: number;
  isMuted: boolean;
  activeAlertMessage: string | null;
  activeAlertRisk: RiskLevel | null;
  activeVoiceProfile: 'navigator' | 'emergency' | null;
}

export const CameraHUD: React.FC<CameraHUDProps> = ({
  detections,
  width,
  height,
  vehicleSpeedKmh,
  isMuted,
  activeAlertMessage,
  activeAlertRisk,
  activeVoiceProfile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous overlay
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Optical Horizon Line & Trajectory Guidelines
    const horizonY = height * 0.44;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.stroke();

    // Dashcam focal crosshair at center horizon
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    const cx = width / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 15, horizonY);
    ctx.lineTo(cx + 15, horizonY);
    ctx.moveTo(cx, horizonY - 15);
    ctx.lineTo(cx, horizonY + 15);
    ctx.stroke();

    // Vehicle Lane Trajectory (Predictive Path)
    const laneBottomLeft = width * 0.22;
    const laneBottomRight = width * 0.78;
    const pathGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    pathGrad.addColorStop(0, 'rgba(56, 189, 248, 0.02)');
    pathGrad.addColorStop(1, 'rgba(56, 189, 248, 0.15)');

    ctx.fillStyle = pathGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 12, horizonY);
    ctx.lineTo(cx + 12, horizonY);
    ctx.lineTo(laneBottomRight, height);
    ctx.lineTo(laneBottomLeft, height);
    ctx.closePath();
    ctx.fill();

    // Outer trajectory edges
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cx - 12, horizonY);
    ctx.lineTo(laneBottomLeft, height);
    ctx.moveTo(cx + 12, horizonY);
    ctx.lineTo(laneBottomRight, height);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Bounding Boxes and Distance Overlay for Detected Potholes
    for (const pothole of detections) {
      const isCritical = pothole.riskLevel === 'critical';
      const isWarning = pothole.riskLevel === 'warning';

      const boxX = pothole.box.x * width;
      const boxY = pothole.box.y * height;
      const boxW = Math.max(20, pothole.box.width * width);
      const boxH = Math.max(14, pothole.box.height * height);

      // Color selection
      const primaryColor = isCritical ? '#ef4444' : isWarning ? '#eab308' : '#22c55e';
      const glowColor = isCritical ? 'rgba(239, 68, 68, 0.35)' : 'rgba(234, 179, 8, 0.25)';

      ctx.save();

      // Soft highlight fill inside bounding box
      ctx.fillStyle = glowColor;
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Border rectangle
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = isCritical ? 3.5 : 2.5;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Corner target brackets (HUD aesthetic)
      const bracketLen = Math.min(16, boxW * 0.3);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(boxX, boxY + bracketLen);
      ctx.lineTo(boxX, boxY);
      ctx.lineTo(boxX + bracketLen, boxY);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(boxX + boxW - bracketLen, boxY);
      ctx.lineTo(boxX + boxW, boxY);
      ctx.lineTo(boxX + boxW, boxY + bracketLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(boxX, boxY + boxH - bracketLen);
      ctx.lineTo(boxX, boxY + boxH);
      ctx.lineTo(boxX + bracketLen, boxY + boxH);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(boxX + boxW - bracketLen, boxY + boxH);
      ctx.lineTo(boxX + boxW, boxY + boxH);
      ctx.lineTo(boxX + boxW, boxY + boxH - bracketLen);
      ctx.stroke();

      // Target Reticle & Distance Tag
      const badgeText = `${pothole.distanceMeters.toFixed(1)}m`;
      const ttiText = pothole.timeToImpactSeconds !== null ? `TTI: ${pothole.timeToImpactSeconds.toFixed(1)}s` : '';
      const confText = `${Math.round(pothole.confidence * 100)}%`;

      ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif';
      const textMetrics = ctx.measureText(`${badgeText}  ${ttiText}`);
      const tagW = Math.max(90, textMetrics.width + 18);
      const tagH = 24;
      const tagY = Math.max(28, boxY - tagH - 4);

      // Tag background badge
      ctx.fillStyle = isCritical ? '#dc2626' : isWarning ? '#ca8a04' : '#16a34a';
      ctx.beginPath();
      ctx.roundRect(boxX, tagY, tagW, tagH, 4);
      ctx.fill();

      // Tag text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`POTHOLE: ${badgeText}`, boxX + 6, tagY + 16);

      // Sub-label with TTI or confidence below tag
      if (ttiText || confText) {
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        const subInfo = ttiText ? `${ttiText} • ${confText}` : `CONF: ${confText}`;
        ctx.fillText(subInfo, boxX + 2, boxY + boxH + 15);
      }

      ctx.restore();
    }
  }, [detections, width, height, vehicleSpeedKmh]);

  const hasCriticalHazard = detections.some((d) => d.riskLevel === 'critical');
  const closestHazard = detections[0] || null;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* HUD 2D Canvas for High-Performance Vector Graphics */}
      <canvas ref={canvasRef} width={width} height={height} className="w-full h-full block" />

      {/* Critical Warning Flash Banner */}
      {hasCriticalHazard && (
        <div
          id="hud-critical-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-2.5 rounded-xl bg-red-600/95 text-white font-bold tracking-wide shadow-2xl border border-red-400 animate-pulse"
        >
          <ShieldAlert className="w-6 h-6 text-yellow-300 animate-bounce" />
          <div className="text-sm sm:text-base">
            CRITICAL HAZARD AHEAD: {closestHazard ? `${closestHazard.distanceMeters.toFixed(1)}M` : 'IMMEDIATE'}
            {closestHazard?.timeToImpactSeconds && ` (TTI: ${closestHazard.timeToImpactSeconds.toFixed(1)}s)`} — BRAKE NOW!
          </div>
        </div>
      )}

      {/* Navigator Advisory Banner */}
      {!hasCriticalHazard && activeAlertMessage && activeAlertRisk === 'warning' && (
        <div
          id="hud-warning-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2 rounded-xl bg-amber-600/90 text-white font-medium text-sm shadow-xl border border-amber-400"
        >
          <AlertTriangle className="w-5 h-5 text-amber-200" />
          <span>{activeAlertMessage}</span>
        </div>
      )}

      {/* Bottom HUD Telemetry Strip */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-slate-200 font-mono">
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>OPTICAL DISTANCE ESTIMATOR: ACTIVE</span>
          <span className="text-slate-400">|</span>
          <span>f: 720px</span>
          <span className="text-slate-400">|</span>
          <span>W_real: 0.55m</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-lg">
          <Volume2 className={`w-3.5 h-3.5 ${isMuted ? 'text-slate-500' : 'text-cyan-400'}`} />
          <span>TTS: {isMuted ? 'MUTED' : activeVoiceProfile ? activeVoiceProfile.toUpperCase() : 'STANDBY'}</span>
        </div>
      </div>
    </div>
  );
};
