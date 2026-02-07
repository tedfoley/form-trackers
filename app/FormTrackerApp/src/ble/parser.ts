import {Buffer} from 'buffer';
import type {FeaturePacket} from './types';
import {
  CMD_START_STREAMING,
  CMD_STOP_STREAMING,
  CMD_REQUEST_BATTERY,
  CMD_TIME_SYNC,
  DEFAULT_STREAM_RATE_HZ,
} from './constants';

const STRIDE_PHASES: Array<'unknown' | 'stance' | 'flight'> = [
  'unknown',
  'stance',
  'flight',
];

export function parseFeaturePacket(base64Data: string): FeaturePacket {
  const buf = Buffer.from(base64Data, 'base64');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const flagsByte = view.getUint8(11);

  return {
    timestamp: view.getUint32(0, true),
    cadence: view.getUint16(4, true),
    groundContactTime: view.getUint16(6, true),
    verticalOscillation: view.getUint16(8, true),
    stridePhase: STRIDE_PHASES[view.getUint8(10)] ?? 'unknown',
    flags: {
      dataValid: !!(flagsByte & 0x01),
      lowBattery: !!(flagsByte & 0x02),
      imuError: !!(flagsByte & 0x04),
      timeSynced: !!(flagsByte & 0x08),
    },
  };
}

export function parseBatteryLevel(base64Data: string): number {
  const buf = Buffer.from(base64Data, 'base64');
  return buf[0];
}

export function encodeConfigCommand(
  command: typeof CMD_START_STREAMING | typeof CMD_STOP_STREAMING | typeof CMD_REQUEST_BATTERY,
  streamRateHz: number = DEFAULT_STREAM_RATE_HZ,
): string {
  const buf = Buffer.alloc(4);
  buf[0] = command;
  buf[1] = streamRateHz;
  buf[2] = 0x00;
  buf[3] = 0x00;
  return buf.toString('base64');
}

export function encodeTimeSyncCommand(epochMs: number): string {
  const buf = Buffer.alloc(9);
  buf[0] = CMD_TIME_SYNC;
  // Encode uint64 LE — use Math.floor division to avoid 32-bit truncation
  let val = Math.floor(epochMs);
  for (let i = 1; i <= 8; i++) {
    buf[i] = val % 256;
    val = Math.floor(val / 256);
  }
  return buf.toString('base64');
}
