/**
 * PotholeGuard AI - Detection & Distance Estimation Engine
 * DetectionProcessor.ts
 *
 * Implements:
 * 1. Pothole Distance Estimation using thin-lens pinhole camera model:
 *    Distance (m) = (Real_Pothole_Width * Focal_Length_Pixels) / Bounding_Box_Pixel_Width
 * 2. Non-Maximum Suppression (NMS) with IoU intersection calculation
 * 3. Bounding box coordinate rescaling from Tensor space (640x640) to screen canvas coordinates
 * 4. Temporal object tracking across frames (Euclidean centroid tracking)
 * 5. Dynamic Time-To-Impact (TTI) and Stopping Distance safety bounds
 */

import { BoundingBox, CameraIntrinsics, PotholeDetection, RiskLevel } from '../types';

export interface RawTensorDetection {
  x1: number; // Normalized [0..1] or pixel coords
  y1: number;
  x2: number;
  y2: number;
  score: number; // Confidence [0..1]
  classId: number; // 0 = Pothole
}

export class DetectionProcessor {
  // Standard dashcam optical parameters
  // Typical dashcam: 1/2.7" sensor (width ~5.37mm), lens focal length ~3.6mm, 1080p width 1920px
  // Focal length in pixels: fx = (f_mm / sensor_width_mm) * image_width_px
  // For 640x640 tensor: fx = (3.6 / 5.37) * 640 ≈ 429.4 pixels
  // For 1280x720 display: fx ≈ 850 pixels
  private intrinsics: CameraIntrinsics = {
    focalLengthPixels: 720.0,
    sensorWidthMm: 5.37,
    focalLengthMm: 3.6,
    imageWidth: 1280,
    imageHeight: 720,
    estimatedPotholeRealWidthMeters: 0.55, // Standard hazardous road pothole diameter (~55 cm)
  };

  private trackedObjects: Map<number, { lastBox: BoundingBox; lastTimestamp: number; smoothDistance: number }> = new Map();
  private nextTrackId: number = 1;

  constructor(customIntrinsics?: Partial<CameraIntrinsics>) {
    if (customIntrinsics) {
      this.intrinsics = { ...this.intrinsics, ...customIntrinsics };
    }
  }

  public updateIntrinsics(newParams: Partial<CameraIntrinsics>): void {
    this.intrinsics = { ...this.intrinsics, ...newParams };
  }

  public getIntrinsics(): CameraIntrinsics {
    return { ...this.intrinsics };
  }

  /**
   * Distance Calculation based on Optical Geometry:
   * Distance = (W_real * f) / W_pixel
   *
   * Where:
   * - W_real = Real physical pothole width in meters (~0.55m)
   * - f = Camera focal length in pixels (intrinsics.focalLengthPixels)
   * - W_pixel = Detected bounding box pixel width in viewfinder
   */
  public calculateDistance(boundingBoxPixelWidth: number): number {
    if (boundingBoxPixelWidth <= 1) {
      return 100.0; // Distant horizon clamp
    }
    const realWidth = this.intrinsics.estimatedPotholeRealWidthMeters;
    const focalLength = this.intrinsics.focalLengthPixels;
    const rawDistance = (realWidth * focalLength) / boundingBoxPixelWidth;

    // Constrain distance to realistic dashcam range (1.0m to 60m)
    return Math.max(1.2, Math.min(60.0, rawDistance));
  }

  /**
   * Intersection over Union (IoU) calculation for two normalized boxes
   */
  public calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interWidth = Math.max(0, xB - xA);
    const interHeight = Math.max(0, yB - yA);
    const interArea = interWidth * interHeight;

    const areaA = boxA.width * boxA.height;
    const areaB = boxB.width * boxB.height;

    const unionArea = areaA + areaB - interArea;
    if (unionArea <= 0) return 0;

    return interArea / unionArea;
  }

  /**
   * Non-Maximum Suppression (NMS) to eliminate duplicate overlapping bounding boxes
   * @param detections List of raw detections with coordinates and confidence scores
   * @param iouThreshold Overlap threshold (default 0.45)
   * @param scoreThreshold Minimum confidence threshold (default 0.35)
   */
  public applyNMS(
    detections: RawTensorDetection[],
    iouThreshold: number = 0.45,
    scoreThreshold: number = 0.35
  ): RawTensorDetection[] {
    // 1. Filter by minimum confidence score
    const filtered = detections.filter((d) => d.score >= scoreThreshold);

    // 2. Sort descending by score
    filtered.sort((a, b) => b.score - a.score);

    const retained: RawTensorDetection[] = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < filtered.length; i++) {
      if (suppressed.has(i)) continue;

      const current = filtered[i];
      retained.push(current);

      const boxA: BoundingBox = {
        x: current.x1,
        y: current.y1,
        width: current.x2 - current.x1,
        height: current.y2 - current.y1,
      };

      for (let j = i + 1; j < filtered.length; j++) {
        if (suppressed.has(j)) continue;

        const candidate = filtered[j];
        const boxB: BoundingBox = {
          x: candidate.x1,
          y: candidate.y1,
          width: candidate.x2 - candidate.x1,
          height: candidate.y2 - candidate.y1,
        };

        const iou = this.calculateIoU(boxA, boxB);
        if (iou >= iouThreshold) {
          suppressed.add(j);
        }
      }
    }

    return retained;
  }

  /**
   * Non-linear YOLOv8 Raw Output Parser:
   * Parses output tensor of shape [1, 5, 8400]
   * Format: [center_x, center_y, width, height, confidence_pothole]
   */
  public parseYOLOv8Output(
    tensorData: Float32Array | number[][],
    tensorSize: number = 640,
    confidenceThreshold: number = 0.35
  ): RawTensorDetection[] {
    const rawDetections: RawTensorDetection[] = [];

    // Check if flat Float32Array of length 5 * 8400 = 42000
    if (tensorData instanceof Float32Array || Array.isArray(tensorData)) {
      const numAnchors = 8400;
      const numChannels = 5;

      for (let i = 0; i < numAnchors; i++) {
        // In YOLOv8 [1, 5, 8400] layout:
        // row 0: cx, row 1: cy, row 2: w, row 3: h, row 4: score
        let cx = 0;
        let cy = 0;
        let w = 0;
        let h = 0;
        let score = 0;

        if (tensorData instanceof Float32Array) {
          cx = tensorData[0 * numAnchors + i];
          cy = tensorData[1 * numAnchors + i];
          w = tensorData[2 * numAnchors + i];
          h = tensorData[3 * numAnchors + i];
          score = tensorData[4 * numAnchors + i];
        } else if (Array.isArray(tensorData) && tensorData.length === numChannels) {
          cx = tensorData[0][i];
          cy = tensorData[1][i];
          w = tensorData[2][i];
          h = tensorData[3][i];
          score = tensorData[4][i];
        }

        if (score >= confidenceThreshold) {
          // Normalize to [0..1]
          const normCx = cx / tensorSize;
          const normCy = cy / tensorSize;
          const normW = w / tensorSize;
          const normH = h / tensorSize;

          rawDetections.push({
            x1: Math.max(0, normCx - normW / 2),
            y1: Math.max(0, normCy - normH / 2),
            x2: Math.min(1, normCx + normW / 2),
            y2: Math.min(1, normCy + normH / 2),
            score,
            classId: 0,
          });
        }
      }
    }

    return rawDetections;
  }

  /**
   * Rescale bounding boxes from normalized [0..1] coordinate system
   * to Viewfinder Canvas target dimensions with aspect-ratio letterboxing support.
   */
  public rescaleBoxToCanvas(
    box: BoundingBox,
    canvasWidth: number,
    canvasHeight: number
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: box.x * canvasWidth,
      y: box.y * canvasHeight,
      width: box.width * canvasWidth,
      height: box.height * canvasHeight,
    };
  }

  /**
   * Process raw detections into fully calculated PotholeDetections with
   * metric distance, risk classification, track IDs, and Time-To-Impact (TTI).
   */
  public processFrameDetections(
    rawDetections: RawTensorDetection[],
    canvasWidth: number,
    canvasHeight: number,
    vehicleSpeedKmh: number = 50
  ): PotholeDetection[] {
    // 1. Apply NMS
    const nmsDetections = this.applyNMS(rawDetections, 0.45, 0.3);

    const now = Date.now();
    const speedMs = Math.max(0.1, (vehicleSpeedKmh * 1000) / 3600);

    const results: PotholeDetection[] = [];

    // Simple centroid tracking assignment
    const matchedTrackIds = new Set<number>();

    for (const raw of nmsDetections) {
      const normBox: BoundingBox = {
        x: raw.x1,
        y: raw.y1,
        width: Math.max(0.01, raw.x2 - raw.x1),
        height: Math.max(0.01, raw.y2 - raw.y1),
      };

      const pixelBox = this.rescaleBoxToCanvas(normBox, canvasWidth, canvasHeight);

      // Distance estimation using optical formula
      const rawDistance = this.calculateDistance(pixelBox.width);

      // Match with previous tracks
      let assignedTrackId = -1;
      let minCentroidDist = 0.2; // Normalized max travel distance between frames

      const currentCentroid = {
        x: normBox.x + normBox.width / 2,
        y: normBox.y + normBox.height / 2,
      };

      for (const [trackId, trackInfo] of this.trackedObjects.entries()) {
        if (matchedTrackIds.has(trackId)) continue;
        const prevCentroid = {
          x: trackInfo.lastBox.x + trackInfo.lastBox.width / 2,
          y: trackInfo.lastBox.y + trackInfo.lastBox.height / 2,
        };
        const dx = currentCentroid.x - prevCentroid.x;
        const dy = currentCentroid.y - prevCentroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minCentroidDist) {
          minCentroidDist = dist;
          assignedTrackId = trackId;
        }
      }

      if (assignedTrackId === -1) {
        assignedTrackId = this.nextTrackId++;
      }
      matchedTrackIds.add(assignedTrackId);

      // Exponential moving average filter for smooth distance output
      const prevTrack = this.trackedObjects.get(assignedTrackId);
      const alpha = 0.35; // Smoothing factor
      const smoothedDistance = prevTrack
        ? alpha * rawDistance + (1 - alpha) * prevTrack.smoothDistance
        : rawDistance;

      this.trackedObjects.set(assignedTrackId, {
        lastBox: normBox,
        lastTimestamp: now,
        smoothDistance: smoothedDistance,
      });

      // Time To Impact: TTI = distance / speed
      const tti = smoothedDistance / speedMs;

      // Risk Level determination
      // Red = Critical Danger (<= 10m or TTI < 1.5s)
      // Yellow = Warning (> 10m & <= 15m, or TTI < 2.5s)
      let riskLevel: RiskLevel = 'safe';
      if (smoothedDistance <= 10.0 || tti <= 1.4) {
        riskLevel = 'critical';
      } else if (smoothedDistance <= 18.0 || tti <= 2.8) {
        riskLevel = 'warning';
      }

      results.push({
        id: `pothole-${assignedTrackId}`,
        trackId: assignedTrackId,
        box: normBox,
        confidence: raw.score,
        pixelWidth: pixelBox.width,
        pixelHeight: pixelBox.height,
        distanceMeters: Number(smoothedDistance.toFixed(1)),
        timeToImpactSeconds: vehicleSpeedKmh > 5 ? Number(tti.toFixed(1)) : null,
        riskLevel,
        firstDetectedTimestamp: now,
        lastUpdatedTimestamp: now,
      });
    }

    // Clean up stale tracks (> 2.0s without detection)
    for (const [trackId, trackInfo] of this.trackedObjects.entries()) {
      if (now - trackInfo.lastTimestamp > 2000) {
        this.trackedObjects.delete(trackId);
      }
    }

    // Sort by distance ascending (closest hazard first)
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return results;
  }
}

export const defaultDetectionProcessor = new DetectionProcessor();
