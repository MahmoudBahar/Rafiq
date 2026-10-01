import { describe, expect, it } from 'vitest';
import { DEG } from './angles';
import { poseOf } from './pose';
import { qAxisAngle, qMul, qYaw } from './vec';

// Device→world for a phone whose top points at `heading` (clockwise), raised by `pitch`, rolled by `roll`.
const phone = (heading: number, pitch = 0, roll = 0) =>
  qMul(qMul(qYaw(-heading * DEG), qAxisAngle([1, 0, 0], pitch * DEG)), qAxisAngle([0, 1, 0], roll * DEG));

describe('poseOf', () => {
  it('flat: the top edge heading, any direction', () => {
    for (const h of [0, 45, 90, 136, 180, 271, 359]) expect(poseOf(phone(h)).flat).toBeCloseTo(h, 6);
  });
  it('upright: the camera points where the top pointed, pitch 90', () => {
    const p = poseOf(phone(136, 90));
    expect(p.camera).toBeCloseTo(136, 6);
    expect(p.flat).toBeCloseTo(136, 6); // the top points at the sky: handed over to the camera
    expect(p.pitch).toBeCloseTo(90, 6);
  });
  it('a roll does not move the flat heading', () => {
    expect(poseOf(phone(136, 0, 25)).flat).toBeCloseTo(136, 6);
  });
  it('face down, the top edge still points where it does', () => {
    expect(poseOf(phone(70, 0, 180)).flat).toBeCloseTo(70, 6);
  });
  it('flat, the camera points at the floor: handed over to the top edge', () => {
    expect(poseOf(phone(200)).camera).toBeCloseTo(200, 6);
  });
  it('raising the phone through the hand-over band has no step', () => {
    let prev = poseOf(phone(150, 60, 30)).flat;
    for (let p = 61; p <= 90; p++) {
      const next = poseOf(phone(150, p, 30)).flat;
      const step = Math.abs(((next - prev + 540) % 360) - 180);
      expect(step).toBeLessThan(5);
      prev = next;
    }
  });
});
