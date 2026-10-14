/**
 * PotholeGuard AI - System Architecture & Production Code Repository
 * ArchitectureAndCodeViewer.tsx
 *
 * Provides:
 * 1. Visual System Architecture & End-to-End Edge Pipeline diagram
 * 2. Complete Project File Tree
 * 3. Raw, production-ready code viewers for:
 *    - train_and_export_yolov8_tflite.py (Python training, FP16 export, [1, 5, 8400] validation)
 *    - AudioService.kt & AudioService.ts (Dual-voice Android/Web TTS engine)
 *    - DetectionProcessor.kt & DetectionProcessor.ts (Focal length math & NMS)
 *    - CameraActivity.kt & CameraHUD.tsx (CameraX / SurfaceView viewfinder)
 */

import React, { useState } from 'react';
import {
  FileCode,
  Layers,
  Copy,
  Check,
  Download,
  Terminal,
  Cpu,
  Eye,
  Volume2,
  FolderTree,
  ChevronRight,
} from 'lucide-react';
import {
  PYTHON_TRAINING_SCRIPT,
  KOTLIN_AUDIO_SERVICE,
  KOTLIN_DETECTION_PROCESSOR,
  KOTLIN_CAMERA_HUD,
} from '../data/sourceCodeTemplates';

export const ArchitectureAndCodeViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'architecture' | 'python' | 'audio_service' | 'detection_processor' | 'camera_activity' | 'tree'
  >('architecture');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Code Viewer Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            id="arch-tab-architecture"
            onClick={() => setActiveTab('architecture')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'architecture'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Architecture & Pipeline</span>
          </button>

          <button
            id="arch-tab-python"
            onClick={() => setActiveTab('python')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'python'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>train_and_export_yolov8_tflite.py</span>
          </button>

          <button
            id="arch-tab-audio"
            onClick={() => setActiveTab('audio_service')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'audio_service'
                ? 'bg-purple-500 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>AudioService.kt</span>
          </button>

          <button
            id="arch-tab-detection"
            onClick={() => setActiveTab('detection_processor')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'detection_processor'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>DetectionProcessor.kt</span>
          </button>

          <button
            id="arch-tab-camera"
            onClick={() => setActiveTab('camera_activity')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'camera_activity'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>CameraActivity.kt</span>
          </button>

          <button
            id="arch-tab-tree"
            onClick={() => setActiveTab('tree')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'tree'
                ? 'bg-slate-200 text-slate-900 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Project File Tree</span>
          </button>
        </div>
      </div>

      {/* Tab Content Display */}
      {activeTab === 'architecture' && (
        <div className="flex flex-col gap-6">
          {/* Architecture Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Cpu className="w-4 h-4" />
                <span>1. Zero-Cloud Edge CV Pipeline</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Processes CameraX frames directly inside the device NPU via TensorFlow Lite (LiteRT) FP16 quantized weights.
                Output tensor shape is validated at <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-300">[1, 5, 8400]</code>,
                yielding ~11-14ms latency per frame.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Eye className="w-4 h-4" />
                <span>2. Pinhole Distance Estimation</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Applies geometric optical scaling:
                <br />
                <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-300 block my-1 font-mono text-[11px]">
                  Distance = (Real_Width × Focal_Length) / Box_Pixel_Width
                </code>
                Estimates distance up to 60m with Kalman-filtered temporal smoothing and Time-To-Impact (TTI) indexing.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <Volume2 className="w-4 h-4" />
                <span>3. Dual-Voice Alert Engine</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Autonomous voice switching:
                <br />
                <strong className="text-slate-200">• Voice A ("Navigator")</strong>: Calm guidance for hazards &gt;15m.
                <br />
                <strong className="text-red-300">• Voice B ("Emergency")</strong>: High-pitch urgent warning for critical hazards &le;10m or speed-calculated stopping distance hazards.
              </p>
            </div>
          </div>

          {/* End-to-End Pipeline ASCII Schematic */}
          <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800">
            <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
              End-to-End Mobile Dataflow Architecture
            </div>
            <pre className="text-[11px] font-mono text-cyan-300 leading-relaxed overflow-x-auto p-4 bg-slate-900/70 rounded-xl border border-slate-800">
{`+-------------------------------------------------------------------------------------------------------+
|                                    POTHOLEGUARD AI ARCHITECTURE                                      |
+-------------------------------------------------------------------------------------------------------+
 [Dashcam CameraX] ---> [640x640 Bilinear Resize] ---> [TFLite FP16 Interpreter (NPU/NNAPI)]
                                                                  |
                                                                  v
                                              Output Tensor: [1, 5, 8400]
                                              (cx, cy, w, h, confidence)
                                                                  |
                                                                  v
                                                 [Custom NMS (IoU >= 0.45)]
                                                                  |
                                                                  v
                                            [Pinhole Distance Estimation Engine]
                                            D = (W_real * Focal_Length) / W_pixel
                                                                  |
                                                                  +-------------------------+
                                                                  |                         |
                                                                  v                         v
                                                      [Heads-Up Display HUD]      [Dual-Voice Alert Engine]
                                                      - Red Box (<= 10m)          - Check Speed & Stopping Dist
                                                      - Yellow Box (> 10m)        - Voice A (Navigator > 15m)
                                                      - Dynamic Meter Overlay     - Voice B (Emergency <= 10m)
                                                      - Time-to-Impact (TTI)      - Deduplication Filter (2.5s)`}
            </pre>
          </div>
        </div>
      )}

      {/* Code Viewers */}
      {activeTab !== 'architecture' && activeTab !== 'tree' && (
        <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-semibold text-slate-200">
                {activeTab === 'python'
                  ? 'train_and_export_yolov8_tflite.py'
                  : activeTab === 'audio_service'
                  ? 'AudioService.kt (Native Android)'
                  : activeTab === 'detection_processor'
                  ? 'DetectionProcessor.kt (Native Android)'
                  : 'CameraActivity.kt (Native Android)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="code-viewer-copy-btn"
                onClick={() => {
                  const code =
                    activeTab === 'python'
                      ? PYTHON_TRAINING_SCRIPT
                      : activeTab === 'audio_service'
                      ? KOTLIN_AUDIO_SERVICE
                      : activeTab === 'detection_processor'
                      ? KOTLIN_DETECTION_PROCESSOR
                      : KOTLIN_CAMERA_HUD;
                  copyToClipboard(activeTab, code);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                {copiedKey === activeTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === activeTab ? 'Copied' : 'Copy Code'}</span>
              </button>

              <button
                id="code-viewer-download-btn"
                onClick={() => {
                  const filename =
                    activeTab === 'python'
                      ? 'train_and_export_yolov8_tflite.py'
                      : activeTab === 'audio_service'
                      ? 'AudioService.kt'
                      : activeTab === 'detection_processor'
                      ? 'DetectionProcessor.kt'
                      : 'CameraActivity.kt';
                  const code =
                    activeTab === 'python'
                      ? PYTHON_TRAINING_SCRIPT
                      : activeTab === 'audio_service'
                      ? KOTLIN_AUDIO_SERVICE
                      : activeTab === 'detection_processor'
                      ? KOTLIN_DETECTION_PROCESSOR
                      : KOTLIN_CAMERA_HUD;
                  downloadFile(filename, code);
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-xs text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <pre className="p-4 bg-slate-900/70 rounded-xl text-xs font-mono text-slate-200 overflow-x-auto max-h-[580px] leading-relaxed select-text">
            {activeTab === 'python' && PYTHON_TRAINING_SCRIPT}
            {activeTab === 'audio_service' && KOTLIN_AUDIO_SERVICE}
            {activeTab === 'detection_processor' && KOTLIN_DETECTION_PROCESSOR}
            {activeTab === 'camera_activity' && KOTLIN_CAMERA_HUD}
          </pre>
        </div>
      )}

      {/* Project File Tree */}
      {activeTab === 'tree' && (
        <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-cyan-400" />
              Complete Project Directory Structure
            </span>
          </div>

          <pre className="p-4 bg-slate-900/70 rounded-xl text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto">
{`PotholeGuardAI/
├── ml_training/
│   ├── train_and_export_yolov8_tflite.py      # Standalone training & FP16 export pipeline
│   ├── data.yaml                              # Dataset config for pothole annotation paths
│   └── requirements.txt                       # ultralytics, tensorflow, opencv-python
│
├── android/ (Native Android Kotlin App)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml                # Camera & Audio permissions
│   │   ├── assets/
│   │   │   └── yolov8n_pothole_fp16.tflite   # Quantized edge model
│   │   └── java/com/potholeguard/ai/
│   │       ├── audio/
│   │       │   └── AudioService.kt            # Dual-Voice TextToSpeech Engine
│   │       ├── vision/
│   │       │   └── DetectionProcessor.kt      # Pinhole Distance math & NMS
│   │       └── ui/
│   │           └── CameraActivity.kt          # CameraX + SurfaceView HUD
│
└── web_simulation_suite/ (React + TypeScript + Vite)
    ├── src/
    │   ├── types.ts                           # BoundingBox, PotholeDetection, Telemetry types
    │   ├── services/
    │   │   ├── AudioService.ts                # Cross-platform Web Speech API Dual-Voice
    │   │   ├── DetectionProcessor.ts          # Rescaling, NMS & Distance Estimation
    │   │   └── SimulationEngine.ts            # Procedural 3D perspective & MP4 feed parser
    │   ├── components/
    │   │   ├── CameraHUD.tsx                  # Vector HUD overlay with risk boxes & distance tags
    │   │   ├── LiveCameraView.tsx             # Real-time webcam viewfinder & test controls
    │   │   ├── SimulationView.tsx             # Driving simulation harness with telemetry & logs
    │   │   ├── ScenarioEvaluationSuite.tsx    # Automated Benchmark scenarios (A, B, C)
    │   │   └── ArchitectureAndCodeViewer.tsx  # Production code and architecture viewer
    │   ├── data/
    │   │   └── sourceCodeTemplates.ts         # Raw Kotlin & Python source codes
    │   ├── App.tsx                            # Primary unified application
    │   └── main.tsx
    ├── index.html
    └── package.json`}
          </pre>
        </div>
      )}
    </div>
  );
};
