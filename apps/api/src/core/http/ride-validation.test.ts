import { describe, expect, it } from 'vitest';
import { createRideSchema, rideHistoryQuerySchema, rideStatusSchema, walletTopupSchema, paymentMethodCreateSchema } from '@heytaksi/shared';
describe('ride contracts',()=>{
  it('accepts valid pickup and destination coordinates',()=>{
    expect(createRideSchema.safeParse({pickup:{latitude:36.81,longitude:34.64,address:'Yenişehir, Mersin'},destination:{latitude:36.78,longitude:34.58,address:'Mezitli, Mersin'},vehicleType:'standard'}).success).toBe(true)
  });
  it('contains the full ride state lifecycle',()=>{
    for(const status of ['searching','driver_assigned','driver_arriving','driver_arrived','started','in_progress','completed','cancelled'])
      expect(rideStatusSchema.safeParse(status).success).toBe(true)
  });
  it('accepts ride history filters',()=>{
    expect(rideHistoryQuerySchema.safeParse({ status: 'upcoming', page: '1', limit: '20' }).success).toBe(true);
    expect(rideHistoryQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  });
});
describe('wallet contracts',()=>{
  it('rejects tiny top-ups and accepts a card token payload',()=>{
    expect(walletTopupSchema.safeParse({ amount: 10 }).success).toBe(false);
    expect(walletTopupSchema.safeParse({ amount: 250 }).success).toBe(true);
    expect(paymentMethodCreateSchema.safeParse({ brand: 'visa', last4: '2086', holderName: 'Demo Yolcu', expMonth: 8, expYear: 2028 }).success).toBe(true);
  });
});
