// MARK: - Enhanced Fingerprint Service for Web
/**
 * Advanced device fingerprinting service that matches mobile app capabilities
 * Provides enterprise-grade device identification and security features
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs';
import CryptoJS from 'crypto-js';

// MARK: - Types
interface BatteryManager {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
}

interface NetworkInformation {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface DeviceFingerprint {
  deviceId: string;
  hardwareFingerprint: string;
  browserFingerprint: string;
  canvas: string;
  webgl: string;
  audio: string;
  screen: ScreenInfo;
  timezone: string;
  language: string;
  platform: string;
  cookiesEnabled: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  cpuClass?: string;
  hardwareConcurrency: number;
  colorDepth: number;
  colorGamut?: string;
  hdr?: boolean;
  math: MathFingerprint;
  webrtc?: WebRTCFingerprint;
  fonts: string[];
  plugins: PluginInfo[];
  touchSupport: TouchInfo;
  battery?: BatteryInfo;
  network?: NetworkInfo;
  confidence: number;
  timestamp: number;
}

export interface ScreenInfo {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
  colorDepth: number;
  pixelDepth: number;
}

export interface MathFingerprint {
  constants: { [key: string]: number };
  functions: { [key: string]: number };
}

export interface WebRTCFingerprint {
  localIPs: string[];
  stunServers: string[];
  candidates: string[];
}

export interface PluginInfo {
  name: string;
  filename: string;
  description: string;
}

export interface TouchInfo {
  maxTouchPoints: number;
  touchEvent: boolean;
  touchStart: boolean;
}

export interface BatteryInfo {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
}

export interface NetworkInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface TrustedDevice {
  deviceId: string;
  fingerprint: string;
  firstSeen: number;
  lastSeen: number;
  location?: string;
  userAgent: string;
  trusted: boolean;
  riskScore: number;
}

// MARK: - Enhanced Fingerprint Service Implementation
export class EnhancedFingerprintService {
  private fpPromise: ReturnType<typeof FingerprintJS.load> | null = null;
  private trustedDevices: Map<string, TrustedDevice> = new Map();
  
  constructor() {
    this.initializeFingerprinting();
  }

  // MARK: - Initialization
  private async initializeFingerprinting(): Promise<void> {
    try {
      this.fpPromise = FingerprintJS.load();
      
      console.log('[EnhancedFingerprint] Service initialized');
    } catch (error) {
      console.error('[EnhancedFingerprint] Initialization failed:', error);
      throw new Error('Failed to initialize fingerprinting service');
    }
  }

  // MARK: - Core Fingerprinting
  /**
   * Generate comprehensive device fingerprint
   */
  async generateFingerprint(): Promise<DeviceFingerprint> {
    try {
      if (!this.fpPromise) {
        await this.initializeFingerprinting();
      }

      const fp = await this.fpPromise!;
      const result = await fp.get();

      // Collect additional fingerprinting data
      const [
        canvasFingerprint,
        webglFingerprint,
        audioFingerprint,
        mathFingerprint,
        webrtcFingerprint,
        fontList,
        batteryInfo,
        networkInfo
      ] = await Promise.all([
        this.generateCanvasFingerprint(),
        this.generateWebGLFingerprint(),
        this.generateAudioFingerprint(),
        this.generateMathFingerprint(),
        this.generateWebRTCFingerprint(),
        this.detectFonts(),
        this.getBatteryInfo(),
        this.getNetworkInfo()
      ]);

      const fingerprint: DeviceFingerprint = {
        deviceId: result.visitorId,
        hardwareFingerprint: this.generateHardwareFingerprint(),
        browserFingerprint: this.generateBrowserFingerprint(),
        canvas: canvasFingerprint,
        webgl: webglFingerprint,
        audio: audioFingerprint,
        screen: this.getScreenInfo(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        cookiesEnabled: navigator.cookieEnabled,
        localStorage: this.isStorageSupported('localStorage'),
        sessionStorage: this.isStorageSupported('sessionStorage'),
        indexedDB: this.isStorageSupported('indexedDB'),
        cpuClass: (navigator as Record<string, unknown>).cpuClass as string | undefined,
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        colorDepth: screen.colorDepth,
        colorGamut: this.getColorGamut(),
        hdr: this.supportsHDR(),
        math: mathFingerprint,
        webrtc: webrtcFingerprint,
        fonts: fontList,
        plugins: this.getPluginInfo(),
        touchSupport: this.getTouchInfo(),
        battery: batteryInfo,
        network: networkInfo,
        confidence: result.confidence?.score || 0,
        timestamp: Date.now()
      };

      return fingerprint;

    } catch (error) {
      console.error('[EnhancedFingerprint] Failed to generate fingerprint:', error);
      throw new Error('Failed to generate device fingerprint');
    }
  }

  // MARK: - Canvas Fingerprinting
  private async generateCanvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        return 'canvas-not-supported';
      }

      // Set canvas size
      canvas.width = 280;
      canvas.height = 60;

      // Draw complex patterns for fingerprinting
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      
      ctx.fillStyle = '#069';
      ctx.fillText('Dynasty Web 🔒', 2, 15);
      
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Dynasty Web 🔒', 4, 17);

      // Add gradients and patterns
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, 'red');
      gradient.addColorStop(0.5, 'green');
      gradient.addColorStop(1, 'blue');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 35, canvas.width, 25);

      // Generate hash of canvas data
      const imageData = canvas.toDataURL();
      return CryptoJS.SHA256(imageData).toString();

    } catch (error) {
      console.error('[EnhancedFingerprint] Canvas fingerprinting failed:', error);
      return 'canvas-error';
    }
  }

  // MARK: - WebGL Fingerprinting  
  private async generateWebGLFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      
      if (!gl) {
        return 'webgl-not-supported';
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
      
      const webglData = {
        vendor,
        renderer,
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
      };

      return CryptoJS.SHA256(JSON.stringify(webglData)).toString();

    } catch (error) {
      console.error('[EnhancedFingerprint] WebGL fingerprinting failed:', error);
      return 'webgl-error';
    }
  }

  // MARK: - Audio Fingerprinting
  private async generateAudioFingerprint(): Promise<string> {
    return new Promise((resolve) => {
      try {
        const AudioContextClass = window.AudioContext || (window as Record<string, unknown>).webkitAudioContext as typeof AudioContext;
        const context = new AudioContextClass();
        
        // Create oscillator for audio fingerprinting
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gainNode = context.createGain();
        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);
        
        gainNode.gain.setValueAtTime(0, context.currentTime);
        
        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gainNode);
        gainNode.connect(context.destination);

        scriptProcessor.onaudioprocess = (event) => {
          const samples = event.inputBuffer.getChannelData(0);
          let sum = 0;
          
          for (let i = 0; i < samples.length; i++) {
            sum += Math.abs(samples[i]);
          }
          
          const fingerprint = CryptoJS.SHA256(sum.toString()).toString();
          oscillator.disconnect();
          scriptProcessor.disconnect();
          context.close();
          
          resolve(fingerprint);
        };

        oscillator.start(0);
        
        // Fallback timeout
        setTimeout(() => {
          resolve('audio-timeout');
        }, 1000);

      } catch (error) {
        console.error('[EnhancedFingerprint] Audio fingerprinting failed:', error);
        resolve('audio-error');
      }
    });
  }

  // MARK: - Math Fingerprinting
  private generateMathFingerprint(): MathFingerprint {
    const constants = {
      E: Math.E,
      PI: Math.PI,
      LN2: Math.LN2,
      LN10: Math.LN10,
      LOG2E: Math.LOG2E,
      LOG10E: Math.LOG10E,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2
    };

    const functions = {
      acos: Math.acos(0.123456789),
      acosh: Math.acosh ? Math.acosh(1.234567890) : 0,
      asin: Math.asin(0.123456789),
      asinh: Math.asinh ? Math.asinh(1.234567890) : 0,
      atan: Math.atan(0.123456789),
      atanh: Math.atanh ? Math.atanh(0.123456789) : 0,
      atan2: Math.atan2(1, 2),
      cbrt: Math.cbrt ? Math.cbrt(123456789) : 0,
      cos: Math.cos(1.234567890),
      cosh: Math.cosh ? Math.cosh(1.234567890) : 0,
      exp: Math.exp(1),
      expm1: Math.expm1 ? Math.expm1(1) : 0,
      log: Math.log(1.234567890),
      log1p: Math.log1p ? Math.log1p(1.234567890) : 0,
      log10: Math.log10 ? Math.log10(1.234567890) : 0,
      log2: Math.log2 ? Math.log2(1.234567890) : 0,
      sin: Math.sin(1.234567890),
      sinh: Math.sinh ? Math.sinh(1.234567890) : 0,
      sqrt: Math.sqrt(1.234567890),
      tan: Math.tan(1.234567890),
      tanh: Math.tanh ? Math.tanh(1.234567890) : 0
    };

    return { constants, functions };
  }

  // MARK: - WebRTC Fingerprinting
  private async generateWebRTCFingerprint(): Promise<WebRTCFingerprint | undefined> {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        const candidates: string[] = [];
        const localIPs: string[] = [];

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidates.push(event.candidate.candidate);
            
            const ipMatch = event.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch && !localIPs.includes(ipMatch[1])) {
              localIPs.push(ipMatch[1]);
            }
          }
        };

        // Create data channel to trigger ICE gathering
        pc.createDataChannel('fingerprint');
        
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => resolve(undefined));

        setTimeout(() => {
          pc.close();
          resolve({
            localIPs,
            stunServers: ['stun:stun.l.google.com:19302'],
            candidates
          });
        }, 2000);

      } catch (error) {
        console.error('[EnhancedFingerprint] WebRTC fingerprinting failed:', error);
        resolve(undefined);
      }
    });
  }

  // MARK: - Helper Methods
  private generateHardwareFingerprint(): string {
    const data = {
      cores: navigator.hardwareConcurrency,
      memory: (navigator as Record<string, unknown>).deviceMemory as number || 0,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth
      }
    };

    return CryptoJS.SHA256(JSON.stringify(data)).toString();
  }

  private generateBrowserFingerprint(): string {
    const data = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      buildID: (navigator as Record<string, unknown>).buildID as string || '',
      product: navigator.product,
      productSub: navigator.productSub,
      vendor: navigator.vendor,
      vendorSub: navigator.vendorSub
    };

    return CryptoJS.SHA256(JSON.stringify(data)).toString();
  }

  private getScreenInfo(): ScreenInfo {
    return {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth
    };
  }

  private isStorageSupported(storageType: string): boolean {
    try {
      const storage = (window as Record<string, unknown>)[storageType] as Storage;
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private getColorGamut(): string | undefined {
    if (window.matchMedia) {
      if (window.matchMedia('(color-gamut: p3)').matches) return 'p3';
      if (window.matchMedia('(color-gamut: srgb)').matches) return 'srgb';
      if (window.matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
    }
    return undefined;
  }

  private supportsHDR(): boolean | undefined {
    if (window.matchMedia) {
      return window.matchMedia('(dynamic-range: high)').matches;
    }
    return undefined;
  }

  private async detectFonts(): Promise<string[]> {
    const fonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact', 'Franklin Gothic Medium',
      'Tahoma', 'Geneva', 'Lucida Console', 'Monaco', 'Segoe UI'
    ];

    const detectedFonts: string[] = [];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return detectedFonts;

    // Baseline measurement
    ctx.font = `${testSize} monospace`;
    const baselineWidth = ctx.measureText(testString).width;

    for (const font of fonts) {
      ctx.font = `${testSize} ${font}, monospace`;
      const width = ctx.measureText(testString).width;
      
      if (width !== baselineWidth) {
        detectedFonts.push(font);
      }
    }

    return detectedFonts;
  }

  private getPluginInfo(): PluginInfo[] {
    const plugins: PluginInfo[] = [];
    
    for (let i = 0; i < navigator.plugins.length; i++) {
      const plugin = navigator.plugins[i];
      plugins.push({
        name: plugin.name,
        filename: plugin.filename,
        description: plugin.description
      });
    }

    return plugins;
  }

  private getTouchInfo(): TouchInfo {
    return {
      maxTouchPoints: navigator.maxTouchPoints || 0,
      touchEvent: 'ontouchstart' in window,
      touchStart: 'ontouchstart' in window
    };
  }

  private async getBatteryInfo(): Promise<BatteryInfo | undefined> {
    try {
      const battery = await (navigator as Record<string, unknown>).getBattery?.() as BatteryManager | undefined;
      
      if (battery) {
        return {
          charging: battery.charging,
          level: battery.level,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime
        };
      }
    } catch {
      console.log('[EnhancedFingerprint] Battery API not available');
    }
    
    return undefined;
  }

  private getNetworkInfo(): NetworkInfo | undefined {
    const connection = (navigator as Record<string, unknown>).connection || 
                      (navigator as Record<string, unknown>).mozConnection || 
                      (navigator as Record<string, unknown>).webkitConnection as NetworkInformation | undefined;
    
    if (connection) {
      return {
        effectiveType: connection.effectiveType || 'unknown',
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
        saveData: connection.saveData || false
      };
    }
    
    return undefined;
  }

  // MARK: - Device Trust Management
  /**
   * Analyze device risk and determine trust level
   */
  analyzeDeviceRisk(fingerprint: DeviceFingerprint): number {
    let riskScore = 0;

    // Check for suspicious patterns
    if (fingerprint.canvas === 'canvas-error' || 
        fingerprint.webgl === 'webgl-error') {
      riskScore += 30; // Possible fingerprinting evasion
    }

    if (!fingerprint.cookiesEnabled) {
      riskScore += 10; // Unusual browser configuration
    }

    if (fingerprint.plugins.length === 0) {
      riskScore += 15; // No plugins might indicate headless browser
    }

    if (fingerprint.hardwareConcurrency === 0) {
      riskScore += 20; // Suspicious hardware info
    }

    if (fingerprint.touchSupport.maxTouchPoints === 0 && 
        fingerprint.platform.includes('Mobile')) {
      riskScore += 25; // Mobile platform without touch support
    }

    // WebRTC availability check
    if (!fingerprint.webrtc) {
      riskScore += 15; // WebRTC disabled might indicate privacy tools
    }

    return Math.min(riskScore, 100);
  }

  /**
   * Mark device as trusted
   */
  trustDevice(deviceId: string, fingerprint: DeviceFingerprint): void {
    const trustedDevice: TrustedDevice = {
      deviceId,
      fingerprint: JSON.stringify(fingerprint),
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      userAgent: navigator.userAgent,
      trusted: true,
      riskScore: this.analyzeDeviceRisk(fingerprint)
    };

    this.trustedDevices.set(deviceId, trustedDevice);
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem(
        `dynasty_trusted_device_${deviceId}`, 
        JSON.stringify(trustedDevice)
      );
    } catch {
      console.warn('[EnhancedFingerprint] Failed to persist trusted device');
    }
  }

  /**
   * Check if device is trusted
   */
  isDeviceTrusted(deviceId: string): boolean {
    if (this.trustedDevices.has(deviceId)) {
      return this.trustedDevices.get(deviceId)!.trusted;
    }

    // Check localStorage
    try {
      const stored = localStorage.getItem(`dynasty_trusted_device_${deviceId}`);
      if (stored) {
        const device = JSON.parse(stored) as TrustedDevice;
        this.trustedDevices.set(deviceId, device);
        return device.trusted;
      }
    } catch {
      console.warn('[EnhancedFingerprint] Failed to load trusted device');
    }

    return false;
  }

  // MARK: - Export/Import
  /**
   * Export device fingerprint for sharing or backup
   */
  exportFingerprint(fingerprint: DeviceFingerprint): string {
    return btoa(JSON.stringify(fingerprint));
  }

  /**
   * Import device fingerprint from exported data
   */
  importFingerprint(exportedData: string): DeviceFingerprint {
    return JSON.parse(atob(exportedData));
  }
}

// MARK: - Default Export
const enhancedFingerprintService = new EnhancedFingerprintService();
export default enhancedFingerprintService; 