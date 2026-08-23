import { describe, expect, it } from 'vitest';
import {
  driverAvailabilitySchema,
  driverAvailabilityTargetSchema,
  driverAvailabilityTargetsFor,
  driverCancelReasons,
  isDriverDispatchable,
  passengerCancelReasons,
} from '@heytaksi/shared';

describe('driver availability contracts', () => {
  it('accepts the five phase-5 driver states', () => {
    for (const state of ['offline', 'online', 'available', 'on_trip', 'paused'])
      expect(driverAvailabilitySchema.safeParse(state).success).toBe(true);
    expect(driverAvailabilitySchema.safeParse('busy').success).toBe(false);
  });

  it('only lets drivers pick offline, online and paused', () => {
    for (const target of ['offline', 'online', 'paused'])
      expect(driverAvailabilityTargetSchema.safeParse(target).success).toBe(true);
    expect(driverAvailabilityTargetSchema.safeParse('on_trip').success).toBe(false);
    expect(driverAvailabilityTargetSchema.safeParse('available').success).toBe(false);
  });

  it('transitions keep trips atomic and breaks recoverable', () => {
    expect(driverAvailabilityTargetsFor('offline')).toEqual(['online']);
    expect(driverAvailabilityTargetsFor('on_trip')).toEqual([]);
    expect(driverAvailabilityTargetsFor('paused')).toContain('online');
    expect(driverAvailabilityTargetsFor('paused')).toContain('offline');
    expect(driverAvailabilityTargetsFor('available')).toContain('paused');
  });

  it('dispatch is open to online and available drivers only', () => {
    expect(isDriverDispatchable('online')).toBe(true);
    expect(isDriverDispatchable('available')).toBe(true);
    expect(isDriverDispatchable('paused')).toBe(false);
    expect(isDriverDispatchable('on_trip')).toBe(false);
    expect(isDriverDispatchable('offline')).toBe(false);
  });
});

describe('ride cancellation contracts', () => {
  it('keeps passenger and driver reason sets separate', () => {
    expect(passengerCancelReasons).toContain('changed_mind');
    expect(driverCancelReasons).toContain('passenger_no_show');
    expect(driverCancelReasons).not.toContain('changed_mind');
  });
});
