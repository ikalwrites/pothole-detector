/**
 * PotholeGuard AI - Core Type Definitions
 * Cross-platform Edge AI Dashcam System
 */

export type RiskLevel = 'safe' | 'warning' | 'critical';

export interface BoundingBox {
  x: number; // normalized [0, 1] or absolute pixels
  y: number;
  width: number;
  height: number;
}

export interface PotholeDetection {
  id: string;
  box: BoundingBox; // Normalized [0..1]
  confidence: number; // 0..1
  pixelWidth: number; // Width in pixels on canvas
  pixelHeight: number;
  distanceMeters: number; // Calculated via focal length equation
  timeToImpactSeconds: number | null; // Calculated based on current vehicle speed
  riskLevel: RiskLevel; // 'warning' (>10m & <=15m or speed-adjusted) or 'critical' (<=10m)
  firstDetectedTimestamp: number;
  lastUpdatedTimestamp: number;
  trackId: number;
}

export type VoiceProfile = 'navigator' | 'emergency';

export interface VoiceConfig {
  profile: VoiceProfile;
  name: string;
  pitch: number;
  rate: number;
  volume: number;
  voiceURI?: string;
  description: string;
}

export interface AudioAlertEvent {
  id: string;
  timestamp: number;
  profile: VoiceProfile;
  message: string;
  distanceMeters: number;
  speedKmh: number;
  riskLevel: RiskLevel;
  triggerReason: string;
}

export interface CameraIntrinsics {
  focalLengthPixels: number; // Focal length in pixels (fx)
  sensorWidthMm: number; // Physical sensor width, e.g. 6.17mm (1/2.3" sensor)
  focalLengthMm: number; // Lens focal length, e.g. 4.0mm
  imageWidth: number;
  imageHeight: number;
  estimatedPotholeRealWidthMeters: number; // Average standard pothole diameter, default ~0.50m
}

export interface TelemetryData {
  fps: number;
  inferenceTimeMs: number;
  vehicleSpeedKmh: number;
  activeHazardsCount: number;
  closestHazardDistanceMeters: number | null;
  stoppingDistanceMeters: number;
  timeToImpactSeconds: number | null;
  isAudioMuted: boolean;
  lightingCondition: 'daylight' | 'overcast' | 'low_light_night';
}

export interface SimulationScenario {
  id: 'scenario_a' | 'scenario_b' | 'scenario_c' | 'custom_video';
  title: string;
  subtitle: string;
  speedKmh: number;
  lighting: 'daylight' | 'overcast' | 'low_light_night';
  description: string;
  expectedBehavior: string;
  roadDefectsCount: number;
  roadType: 'highway' | 'urban' | 'rural_night';
}

export interface TestResult {
  scenarioId: string;
  title: string;
  status: 'passed' | 'failed' | 'running' | 'idle';
  metrics: {
    stoppingDistanceMeters: number;
    detectionDistanceMeters: number;
    reactionBufferSeconds: number;
    audioTriggersCount: number;
    deduplicationBlockedCount: number;
    averageConfidence: number;
    minConfidence: number;
  };
  details: string[];
  passedCriteria: string[];
}
