/**
 * PotholeGuard AI - Simulation Engine & Synthetic Dashcam Streamer
 * SimulationEngine.ts
 *
 * Implements:
 * 1. Procedural Dashcam Perspective Video Stream Generator:
 *    - Renders realistic road asphalt, perspective horizon, moving lane dashes, roadside barriers
 *    - Simulates dynamic potholes moving towards camera with quadratic perspective scaling
 *    - Real-time environmental lighting models (Daylight, Overcast, Low-Light Night with headlight cones)
 * 2. Custom Driving MP4 video loader with frame capture
 * 3. Synthetic CV Detector that feeds frames into DetectionProcessor with noise, jitter, and low-light contrast drop
 */

import { RawTensorDetection } from './DetectionProcessor';
import { SimulationScenario } from '../types';

export interface SimulatedPothole {
  id: number;
  laneOffset: number; // -0.5 to 0.5 (lateral lane position)
  zDistance: number; // meters from vehicle (e.g. 50m down to 0m)
  realDiameter: number; // standard ~0.55m
  severity: 'minor' | 'moderate' | 'deep';
  crackDensity: number;
}

export class SimulationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scenario: SimulationScenario;
  private speedKmh: number = 50;
  private simulatedPotholes: SimulatedPothole[] = [];
  private animationFrameId: number | null = null;
  private lastTick: number = 0;
  private distanceTraveledMeters: number = 0;
  private isRunning: boolean = false;
  private customVideoElement: HTMLVideoElement | null = null;
  private isUsingCustomVideo: boolean = false;

  // Listeners for generated detections
  private onDetectionsGenerated: ((detections: RawTensorDetection[]) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, initialScenario: SimulationScenario) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from simulation canvas');
    this.ctx = ctx;
    this.scenario = initialScenario;
    this.speedKmh = initialScenario.speedKmh;
    this.initScenarioPotholes();
  }

  public setScenario(scenario: SimulationScenario): void {
    this.scenario = scenario;
    this.speedKmh = scenario.speedKmh;
    this.isUsingCustomVideo = false;
    this.initScenarioPotholes();
  }

  public setSpeedKmh(speed: number): void {
    this.speedKmh = Math.max(0, Math.min(140, speed));
  }

  public getSpeedKmh(): number {
    return this.speedKmh;
  }

  public setDetectionsCallback(cb: (detections: RawTensorDetection[]) => void): void {
    this.onDetectionsGenerated = cb;
  }

  /**
   * Load user-provided custom MP4 video file
   */
  public loadCustomVideo(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;

        video.onloadeddata = () => {
          this.customVideoElement = video;
          this.isUsingCustomVideo = true;
          video.play().catch(console.warn);
          resolve();
        };

        video.onerror = (e) => {
          reject(new Error(`Failed to load video file: ${e}`));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public clearCustomVideo(): void {
    if (this.customVideoElement) {
      this.customVideoElement.pause();
      this.customVideoElement.src = '';
      this.customVideoElement = null;
    }
    this.isUsingCustomVideo = false;
    this.initScenarioPotholes();
  }

  private initScenarioPotholes(): void {
    this.simulatedPotholes = [];
    const now = Date.now();

    if (this.scenario.id === 'scenario_a') {
      // Highway: Single deep pothole at 45m approaching quickly
      this.simulatedPotholes = [
        {
          id: 101,
          laneOffset: 0.05, // direct in vehicle trajectory
          zDistance: 48,
          realDiameter: 0.65,
          severity: 'deep',
          crackDensity: 0.9,
        },
      ];
    } else if (this.scenario.id === 'scenario_b') {
      // Urban: Multiple sequential road defects spaced 6-12m apart
      this.simulatedPotholes = [
        {
          id: 201,
          laneOffset: -0.12,
          zDistance: 16,
          realDiameter: 0.45,
          severity: 'moderate',
          crackDensity: 0.7,
        },
        {
          id: 202,
          laneOffset: 0.15,
          zDistance: 28,
          realDiameter: 0.58,
          severity: 'deep',
          crackDensity: 0.85,
        },
        {
          id: 203,
          laneOffset: -0.05,
          zDistance: 42,
          realDiameter: 0.48,
          severity: 'minor',
          crackDensity: 0.6,
        },
      ];
    } else if (this.scenario.id === 'scenario_c') {
      // Night Low-Light: Potholes with lower visual contrast
      this.simulatedPotholes = [
        {
          id: 301,
          laneOffset: 0.02,
          zDistance: 32,
          realDiameter: 0.6,
          severity: 'deep',
          crackDensity: 0.9,
        },
        {
          id: 302,
          laneOffset: -0.22,
          zDistance: 50,
          realDiameter: 0.52,
          severity: 'moderate',
          crackDensity: 0.7,
        },
      ];
    } else {
      // Default / continuous drive
      this.simulatedPotholes = [
        {
          id: 401,
          laneOffset: 0.0,
          zDistance: 35,
          realDiameter: 0.55,
          severity: 'deep',
          crackDensity: 0.8,
        },
      ];
    }
    this.distanceTraveledMeters = 0;
    this.lastTick = now;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTick = performance.now();
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (): void => {
    if (!this.isRunning) return;
    const now = performance.now();
    const dtSeconds = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    this.update(dtSeconds);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(dtSeconds: number): void {
    const speedMs = (this.speedKmh * 1000) / 3600;
    const deltaDistance = speedMs * dtSeconds;
    this.distanceTraveledMeters += deltaDistance;

    if (!this.isUsingCustomVideo) {
      // Move each pothole closer
      for (const p of this.simulatedPotholes) {
        p.zDistance -= deltaDistance;

        // Respawn loop for continuous evaluation
        if (p.zDistance < 1.5) {
          p.zDistance = 55 + Math.random() * 15;
          p.laneOffset = (Math.random() - 0.5) * 0.45;
        }
      }
    }
  }

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    if (this.isUsingCustomVideo && this.customVideoElement) {
      // Render uploaded MP4 feed
      ctx.drawImage(this.customVideoElement, 0, 0, w, h);
      this.generateSimulatedDetectionsFromVideo(w, h);
      return;
    }

    // Procedural Road Rendering with Atmospheric Perspective
    const horizonY = h * 0.44;
    const isNight = this.scenario.lighting === 'low_light_night';
    const isOvercast = this.scenario.lighting === 'overcast';

    // 1. Sky & Horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    if (isNight) {
      skyGrad.addColorStop(0, '#05070d');
      skyGrad.addColorStop(1, '#0e1626');
    } else if (isOvercast) {
      skyGrad.addColorStop(0, '#4b5563');
      skyGrad.addColorStop(1, '#9ca3af');
    } else {
      skyGrad.addColorStop(0, '#1e3a8a');
      skyGrad.addColorStop(0.7, '#60a5fa');
      skyGrad.addColorStop(1, '#bfdbfe');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Distant mountain silhouette / cityscape
    ctx.fillStyle = isNight ? '#0b111e' : isOvercast ? '#374151' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w * 0.15, horizonY - 14);
    ctx.lineTo(w * 0.35, horizonY - 26);
    ctx.lineTo(w * 0.55, horizonY - 12);
    ctx.lineTo(w * 0.78, horizonY - 22);
    ctx.lineTo(w, horizonY - 10);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // 2. Asphalt Road Base
    const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    if (isNight) {
      roadGrad.addColorStop(0, '#0d1117');
      roadGrad.addColorStop(1, '#161b22');
    } else {
      roadGrad.addColorStop(0, '#334155');
      roadGrad.addColorStop(1, '#1e293b');
    }
    ctx.fillStyle = roadGrad;

    // Road trapezoid (wide bottom, narrow horizon)
    const roadTopWidth = w * 0.16;
    const roadBottomWidth = w * 0.94;
    const roadCenterX = w * 0.5;

    ctx.beginPath();
    ctx.moveTo(roadCenterX - roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadBottomWidth / 2, h);
    ctx.lineTo(roadCenterX - roadBottomWidth / 2, h);
    ctx.closePath();
    ctx.fill();

    // Road shoulders / grass verge
    ctx.fillStyle = isNight ? '#090d14' : '#14532d'; // dark green or black
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(roadCenterX - roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX - roadBottomWidth / 2, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w, horizonY);
    ctx.lineTo(roadCenterX + roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadBottomWidth / 2, h);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Road edge guardlines (white continuous lines)
    ctx.strokeStyle = isNight ? '#475569' : '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadCenterX - roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX - roadBottomWidth / 2, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(roadCenterX + roadTopWidth / 2, horizonY);
    ctx.lineTo(roadCenterX + roadBottomWidth / 2, h);
    ctx.stroke();

    // 3. Center Lane Dashed Lines with perspective scroll
    const dashOffset = (this.distanceTraveledMeters * 3) % 40;
    const numDashes = 14;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fbbf24'; // Yellow center dashes

    for (let i = 0; i < numDashes; i++) {
      // Normalized depth t from 0 (horizon) to 1 (near car)
      const rawT = (i + dashOffset / 40) / numDashes;
      if (rawT < 0.05 || rawT > 0.98) continue;
      const t = Math.pow(rawT, 2.2); // Non-linear perspective spacing
      const tNext = Math.pow(Math.min(0.99, rawT + 0.035), 2.2);

      const y1 = horizonY + t * (h - horizonY);
      const y2 = horizonY + tNext * (h - horizonY);

      ctx.beginPath();
      ctx.moveTo(roadCenterX, y1);
      ctx.lineTo(roadCenterX, y2);
      ctx.stroke();
    }

    // 4. Night Mode Headlight Illumination Cone
    if (isNight) {
      const headlightGrad = ctx.createRadialGradient(
        roadCenterX,
        h * 0.9,
        30,
        roadCenterX,
        h * 0.65,
        w * 0.55
      );
      headlightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
      headlightGrad.addColorStop(0.6, 'rgba(254, 240, 138, 0.12)');
      headlightGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

      ctx.fillStyle = headlightGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // 5. Draw Dynamic Potholes & Synthesize CV Detections
    const activeDetections: RawTensorDetection[] = [];

    for (const pothole of this.simulatedPotholes) {
      if (pothole.zDistance <= 1.0 || pothole.zDistance > 60.0) continue;

      // Perspective projection
      // Focal length in pixel math:
      const f = 720.0;
      // Pixel width of pothole: W_px = (W_real * f) / z
      const potholePixelWidth = (pothole.realDiameter * f) / pothole.zDistance;
      const potholePixelHeight = potholePixelWidth * 0.48; // Flattened ellipse in perspective

      // Vertical position on road based on distance (closer = lower on screen)
      // Perspective equation: y = horizonY + (cameraHeight * f) / z
      const cameraHeight = 1.35; // 1.35 meters dashcam mounting height
      const centerY = horizonY + (cameraHeight * f) / pothole.zDistance;

      if (centerY > h + 50 || centerY < horizonY) continue;

      // Lateral X coordinate on lane
      const roadWidthAtZ = (3.7 * f) / pothole.zDistance; // 3.7m standard lane width
      const centerX = roadCenterX + pothole.laneOffset * roadWidthAtZ;

      // Draw realistic asphalt pothole crater on the road canvas
      ctx.save();
      ctx.translate(centerX, centerY);

      // Deep shadow crater
      ctx.beginPath();
      ctx.ellipse(0, 0, potholePixelWidth / 2, potholePixelHeight / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = isNight ? '#05070a' : '#0f172a';
      ctx.fill();

      // Inner depth core
      ctx.beginPath();
      ctx.ellipse(
        -potholePixelWidth * 0.05,
        potholePixelHeight * 0.08,
        potholePixelWidth * 0.38,
        potholePixelHeight * 0.35,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#020617';
      ctx.fill();

      // Jagged asphalt edge rim
      ctx.strokeStyle = isNight ? '#1e293b' : '#64748b';
      ctx.lineWidth = Math.max(1, potholePixelWidth * 0.04);
      ctx.stroke();

      ctx.restore();

      // Synthesize CV Detection Bounding Box (simulating YOLOv8 output with real-world noise)
      // Under night lighting, low contrast reduces detection confidence
      let confidence = 0.88 - (pothole.zDistance / 60) * 0.25;
      if (isNight) {
        // Scenario C validation: confidence drops in low-light outside headlight beam
        const distFromHeadlight = Math.abs(pothole.laneOffset);
        confidence = Math.max(0.38, confidence - 0.22 - distFromHeadlight * 0.3);
      } else if (isOvercast) {
        confidence = Math.max(0.48, confidence - 0.06);
      }

      // Add subtle sensor jitter (±1.5px)
      const jitterX = (Math.random() - 0.5) * 3;
      const jitterY = (Math.random() - 0.5) * 2;

      const x1 = Math.max(0, (centerX - potholePixelWidth / 2 + jitterX) / w);
      const y1 = Math.max(0, (centerY - potholePixelHeight / 2 + jitterY) / h);
      const x2 = Math.min(1, (centerX + potholePixelWidth / 2 + jitterX) / w);
      const y2 = Math.min(1, (centerY + potholePixelHeight / 2 + jitterY) / h);

      activeDetections.push({
        x1,
        y1,
        x2,
        y2,
        score: Number(confidence.toFixed(3)),
        classId: 0,
      });
    }

    // Pass synthetic detections to subscriber
    if (this.onDetectionsGenerated) {
      this.onDetectionsGenerated(activeDetections);
    }
  }

  /**
   * Video feed detection generator for uploaded MP4 files
   */
  private generateSimulatedDetectionsFromVideo(w: number, h: number): void {
    // Generate simulated road scan across bottom half of video frame
    const time = performance.now() / 1000;
    const scanPhase = (time * 0.8) % 1.0;
    const distance = 45 * (1 - scanPhase) + 5;

    const potholeWidth = (0.55 * 720) / distance;
    const potholeHeight = potholeWidth * 0.5;

    const centerX = w * 0.52 + Math.sin(time * 0.5) * (w * 0.08);
    const centerY = h * 0.46 + (1.35 * 720) / distance;

    if (centerY < h * 0.95 && this.onDetectionsGenerated) {
      this.onDetectionsGenerated([
        {
          x1: Math.max(0, (centerX - potholeWidth / 2) / w),
          y1: Math.max(0, (centerY - potholeHeight / 2) / h),
          x2: Math.min(1, (centerX + potholeWidth / 2) / w),
          y2: Math.min(1, (centerY + potholeHeight / 2) / h),
          score: 0.82,
          classId: 0,
        },
      ]);
    }
  }
}
