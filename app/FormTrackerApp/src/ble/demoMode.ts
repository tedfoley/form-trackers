import type {FeaturePacket} from './types';

interface DemoPodProfile {
  deviceId: string;
  baseCadence: number;
  cadenceVariation: number;
  baseGCT: number;
  gctVariation: number;
  baseVertOsc: number;
  vertOscVariation: number;
  sinePeriodS: number;
}

const DEMO_PROFILES: DemoPodProfile[] = [
  {
    deviceId: 'demo-left-foot',
    baseCadence: 160,
    cadenceVariation: 4,
    baseGCT: 250,
    gctVariation: 15,
    baseVertOsc: 85,
    vertOscVariation: 10,
    sinePeriodS: 30,
  },
  {
    deviceId: 'demo-right-foot',
    baseCadence: 160,
    cadenceVariation: 4,
    baseGCT: 250,
    gctVariation: 15,
    baseVertOsc: 85,
    vertOscVariation: 10,
    sinePeriodS: 30,
  },
  {
    deviceId: 'demo-waist',
    baseCadence: 160,
    cadenceVariation: 4,
    baseGCT: 250,
    gctVariation: 15,
    baseVertOsc: 70,
    vertOscVariation: 8,
    sinePeriodS: 30,
  },
];

const SAMPLE_RATE_HZ = 10;
const BATTERY_DRAIN_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const BATTERY_START = 85;
const BATTERY_END = 15;

export function startDemoStreaming(
  onPacket: (deviceId: string, packet: FeaturePacket) => void,
  onBattery: (deviceId: string, level: number) => void,
): () => void {
  const startTime = Date.now();
  const ticks: Record<string, number> = {};
  for (const p of DEMO_PROFILES) {
    ticks[p.deviceId] = 0;
  }

  const intervals: ReturnType<typeof setInterval>[] = [];

  for (const profile of DEMO_PROFILES) {
    const interval = setInterval(() => {
      const tick = ticks[profile.deviceId]++;
      const now = Date.now();

      const samplesPerPeriod = SAMPLE_RATE_HZ * profile.sinePeriodS;
      const phase = Math.sin((2.0 * Math.PI * tick) / samplesPerPeriod);

      const cadence = Math.round(
        profile.baseCadence + profile.cadenceVariation * phase,
      );
      const gct = Math.round(profile.baseGCT - profile.gctVariation * phase);
      const vertOsc = Math.round(
        profile.baseVertOsc - profile.vertOscVariation * phase,
      );

      // Stride phase: alternates based on timing
      const stridePeriodMs = Math.round(60000 / cadence);
      const stanceMs = Math.round((stridePeriodMs * 2) / 3);
      const phaseMs = now % stridePeriodMs;
      const stridePhase: 'stance' | 'flight' =
        phaseMs < stanceMs ? 'stance' : 'flight';

      // Battery drain
      const elapsed = now - startTime;
      const drainRatio = Math.min(elapsed / BATTERY_DRAIN_DURATION_MS, 1);
      const battery = Math.round(
        BATTERY_START - (BATTERY_START - BATTERY_END) * drainRatio,
      );

      const packet: FeaturePacket = {
        timestamp: now & 0xffffffff,
        cadence,
        groundContactTime: gct,
        verticalOscillation: vertOsc,
        stridePhase,
        flags: {
          dataValid: false,
          lowBattery: battery <= 15,
          imuError: false,
          timeSynced: true,
        },
      };

      onPacket(profile.deviceId, packet);

      // Update battery every second (every 10th tick)
      if (tick % SAMPLE_RATE_HZ === 0) {
        onBattery(profile.deviceId, battery);
      }
    }, 1000 / SAMPLE_RATE_HZ);

    intervals.push(interval);
  }

  return () => {
    for (const interval of intervals) {
      clearInterval(interval);
    }
  };
}
