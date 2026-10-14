/**
 * PotholeGuard AI - Dual-Voice Alert Manager
 * AudioService.ts (Cross-Platform & Web Speech API Engine)
 *
 * Implements:
 * 1. Voice Profile A ("Navigator"): Calm, professional, lower pitch for distant/minor hazards (>15m)
 * 2. Voice Profile B ("Emergency"): Urgent, higher pitch, accelerated speech rate for close/critical hazards (<=10m)
 * 3. Smart Priority Mode: Dynamic switching and preemption based on calculated distance and vehicle speed
 * 4. Deduplication & Audio Cooldown: Prevents overlapping audio or alert spamming on sequential potholes
 */

import { AudioAlertEvent, RiskLevel, VoiceConfig, VoiceProfile } from '../types';

export class AudioAlertService {
  private static instance: AudioAlertService | null = null;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private lastAlertTimestamp: number = 0;
  private lastAlertDistance: number = 999;
  private lastAlertTrackId: number = -1;
  private audioContext: AudioContext | null = null;

  // Deduplication window in milliseconds (prevents rapid-fire repeating alerts)
  private readonly DEDUPLICATION_COOLDOWN_MS = 2800;
  // Distance threshold change to force re-alert on the same hazard
  private readonly CRITICAL_DISTANCE_DELTA = 6.0;

  private listeners: ((event: AudioAlertEvent) => void)[] = [];

  private voiceProfiles: Record<VoiceProfile, VoiceConfig> = {
    navigator: {
      profile: 'navigator',
      name: 'Navigator (Calm Guidance)',
      pitch: 0.92, // Calm, lower pitch
      rate: 1.05, // Normal articulate rate
      volume: 0.9,
      description: 'Used for distant or minor potholes (> 15m away) and advisory road conditions.',
    },
    emergency: {
      profile: 'emergency',
      name: 'Emergency (Urgent Hazard)',
      pitch: 1.35, // High pitch, heightened alert tone
      rate: 1.32, // Rapid, urgent delivery
      volume: 1.0,
      description: 'Triggered when hazard is <= 10m or stopping distance is critically compromised.',
    },
  };

  private constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  public static getInstance(): AudioAlertService {
    if (!AudioAlertService.instance) {
      AudioAlertService.instance = new AudioAlertService();
    }
    return AudioAlertService.instance;
  }

  private loadVoices(): void {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public onAlertTriggered(callback: (event: AudioAlertEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private emitAlert(event: AudioAlertEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Sound synthesis fallback / alert chime
   */
  private playChime(isCritical: boolean): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext && AudioCtx) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      if (!this.audioContext) return;

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = isCritical ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isCritical ? 880 : 587.33, this.audioContext.currentTime); // A5 or D5
      if (isCritical) {
        // Fast dual beep frequency sweep
        osc.frequency.exponentialRampToValueAtTime(1174.66, this.audioContext.currentTime + 0.12);
      }

      gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + (isCritical ? 0.25 : 0.35));

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.35);
    } catch {
      // AudioContext might be blocked until user gesture, graceful degradation
    }
  }

  /**
   * Core Smart Priority Alert Logic
   * @param distanceMeters Calculated distance to pothole
   * @param speedKmh Current vehicle speed in km/h
   * @param trackId Unique ID for the detected pothole instance
   * @returns AlertEvent if triggered, or null if deduplicated/filtered
   */
  public triggerAlert(
    distanceMeters: number,
    speedKmh: number = 50,
    trackId: number = 0
  ): AudioAlertEvent | null {
    if (this.isMuted) return null;

    const now = Date.now();
    const roundedDistance = Math.max(1, Math.round(distanceMeters));

    // Calculate dynamic emergency distance threshold based on speed (stopping distance physics)
    // Reaction distance: d_r = v * t_react (t_react ~ 1.0s)
    // Braking distance: d_b = v^2 / (2 * g * mu) (dry asphalt mu ~ 0.7)
    const speedMs = (speedKmh * 1000) / 3600;
    const requiredStoppingDistance = speedMs * 1.0 + (speedMs * speedMs) / (2 * 9.81 * 0.7);

    // Determine voice profile & risk level
    let selectedProfile: VoiceProfile = 'navigator';
    let riskLevel: RiskLevel = 'warning';
    let message = '';
    let isEmergency = false;
    let triggerReason = '';

    // Smart Priority Evaluation:
    // If distance <= 10m OR distance is less than stopping distance at speeds > 60 km/h:
    if (distanceMeters <= 10 || (speedKmh >= 60 && distanceMeters <= Math.min(30, requiredStoppingDistance * 0.9))) {
      selectedProfile = 'emergency';
      riskLevel = 'critical';
      isEmergency = true;
      triggerReason =
        distanceMeters <= 10
          ? `Proximity critical (${roundedDistance}m <= 10m)`
          : `High speed stopping hazard (${speedKmh} km/h requires ~${Math.round(requiredStoppingDistance)}m)`;
      
      if (distanceMeters <= 5) {
        message = 'WARNING! Pothole immediate impact! Brace!';
      } else {
        message = `WARNING! Deep pothole in ${roundedDistance} meters! Slow down!`;
      }
    } else if (distanceMeters <= 25) {
      selectedProfile = 'navigator';
      riskLevel = distanceMeters <= 15 ? 'warning' : 'safe';
      triggerReason = `Advisory proximity (${roundedDistance}m)`;
      message = `Pothole ahead in ${roundedDistance} meters.`;
    } else {
      // Too far away (> 25m), wait until it approaches to avoid premature driver fatigue
      return null;
    }

    // Deduplication & Priority Preemption Check:
    const elapsedSinceLastAlert = now - this.lastAlertTimestamp;
    const isSameTrack = this.lastAlertTrackId === trackId && trackId !== -1;
    const distanceDelta = this.lastAlertDistance - distanceMeters;

    // If an emergency alert arrives while navigator is talking, emergency PREEMPTS immediately
    if (isEmergency && this.isSpeaking && this.synth) {
      // Force cancel lower priority speech
      this.synth.cancel();
      this.isSpeaking = false;
    } else if (isSameTrack && elapsedSinceLastAlert < this.DEDUPLICATION_COOLDOWN_MS && distanceDelta < this.CRITICAL_DISTANCE_DELTA && !isEmergency) {
      // Deduplicate: same pothole within cooldown window
      return null;
    } else if (!isSameTrack && elapsedSinceLastAlert < 1500 && !isEmergency) {
      // Stagger sequential warnings to prevent overlapping speech babble
      return null;
    }

    // Update state tracking
    this.lastAlertTimestamp = now;
    this.lastAlertDistance = distanceMeters;
    this.lastAlertTrackId = trackId;

    // Play chime sound
    this.playChime(isEmergency);

    // Speak with native TTS
    this.speak(message, selectedProfile);

    const alertEvent: AudioAlertEvent = {
      id: `alert-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      profile: selectedProfile,
      message,
      distanceMeters: roundedDistance,
      speedKmh,
      riskLevel,
      triggerReason,
    };

    this.emitAlert(alertEvent);
    return alertEvent;
  }

  private speak(text: string, profile: VoiceProfile): void {
    if (!this.synth || this.isMuted) return;

    try {
      // If currently speaking and new message is emergency, stop previous immediately
      if (profile === 'emergency') {
        this.synth.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const config = this.voiceProfiles[profile];

      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.volume = config.volume;

      // Select suitable voice if available
      if (this.voices.length > 0) {
        if (profile === 'navigator') {
          // Prefer natural, calm English voices
          const calmVoice = this.voices.find(
            (v) =>
              (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Male')))
          );
          if (calmVoice) utterance.voice = calmVoice;
        } else {
          // Prefer assertive, high clear voices
          const urgentVoice = this.voices.find(
            (v) =>
              (v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Victoria') || v.name.includes('Zira') || v.name.includes('Alert')))
          );
          if (urgentVoice) utterance.voice = urgentVoice;
        }
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
      };
      utterance.onend = () => {
        this.isSpeaking = false;
      };
      utterance.onerror = () => {
        this.isSpeaking = false;
      };

      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      this.isSpeaking = false;
    }
  }

  public cancel(): void {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }

  public getVoiceProfiles(): Record<VoiceProfile, VoiceConfig> {
    return this.voiceProfiles;
  }
}

export const audioAlertService = AudioAlertService.getInstance();
