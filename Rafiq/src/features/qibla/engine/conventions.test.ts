import { describe, expect, it } from 'vitest';
import {
  ACCEL_LOWPASS_TAU_S,
  attitudeHeading,
  createLowPass,
  downFromAccelerometer,
  gravityFromMotion,
  gyroVector,
} from './conventions';

const G = 9.81;

describe('gravityFromMotion', () => {
  it('Android: accelerometer − 2·gravity, less the linear part, is gravity pointing down', () => {
    // Face up, nudged 0.3 m/s² to the right: the accelerometer reads (0.3, 0, +9.81),
    // TYPE_GRAVITY (0, 0, +9.81), TYPE_LINEAR_ACCELERATION (0.3, 0, 0).
    const includingGravity = [0.3 - 0, 0, 9.81 - 2 * G] as const;
    expect(gravityFromMotion(includingGravity, [0.3, 0, 0])).toEqual([0, 0, -G]);
  });
  it('iOS: (user + gravity)·G less user·G is gravity pointing down', () => {
    const user = [0.05, -0.02, 0.1] as const;
    const gravity = [0, 0, -1] as const;
    const includingGravity = [(user[0] + gravity[0]) * G, (user[1] + gravity[1]) * G, (user[2] + gravity[2]) * G] as const;
    const d = gravityFromMotion(includingGravity, [user[0] * G, user[1] * G, user[2] * G]);
    expect(d[0]).toBeCloseTo(0, 9);
    expect(d[1]).toBeCloseTo(0, 9);
    expect(d[2]).toBeCloseTo(-G, 9);
  });
});

describe('downFromAccelerometer', () => {
  it('Android reports the reaction force (up), so it is flipped', () => {
    expect(downFromAccelerometer([0, 0, 1], 'android')).toEqual([-0, -0, -1]);
  });
  it('iOS reports gravity itself (down), so it passes through', () => {
    expect(downFromAccelerometer([0, 0, -1], 'ios')).toEqual([0, 0, -1]);
  });
});

describe('gyroVector', () => {
  it('Android: alpha, beta, gamma are the rates about X, Y, Z', () => {
    expect(gyroVector({ alpha: 1, beta: 2, gamma: 3 }, 'android')).toEqual([1, 2, 3]);
  });
  it('iOS: alpha is about Z and gamma about X', () => {
    expect(gyroVector({ alpha: 1, beta: 2, gamma: 3 }, 'ios')).toEqual([3, 2, 1]);
  });
});

describe('attitudeHeading', () => {
  const D = Math.PI / 180;
  it('Android: alpha is minus the azimuth (recorded flat sample: alpha −159.3°, compass 162°)', () => {
    expect(attitudeHeading(-159.3 * D, 'android')).toBeCloseTo(159.3, 6);
    expect(attitudeHeading(10 * D, 'android')).toBeCloseTo(350, 6);
  });
  it('iOS: yaw 0 has the right edge on north, so the top edge is on west', () => {
    expect(attitudeHeading(0, 'ios')).toBeCloseTo(270, 6);
    expect(attitudeHeading(-90 * D, 'ios')).toBeCloseTo(0, 6);
    expect(attitudeHeading(90 * D, 'ios')).toBeCloseTo(180, 6);
  });
});

describe('createLowPass', () => {
  it('starts on the first sample', () => {
    expect(createLowPass(ACCEL_LOWPASS_TAU_S).push([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
  it('closes about 63% of a step after one time constant', () => {
    const lp = createLowPass(0.3);
    lp.push([0, 0, 0], 0);
    let v = [0, 0, 0] as readonly number[];
    for (let t = 0.01; t <= 0.3001; t += 0.01) v = lp.push([1, 0, 0], t);
    expect(v[0]).toBeGreaterThan(0.58);
    expect(v[0]).toBeLessThan(0.68);
  });
  it('restarts after a long gap', () => {
    const lp = createLowPass(0.3);
    lp.push([0, 0, 0], 0);
    expect(lp.push([1, 0, 0], 10)).toEqual([1, 0, 0]);
  });
});
