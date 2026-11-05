import { mockSupplier } from './mock';
import type { SupplierAdapter } from './types';

const adapters: Record<string, SupplierAdapter> = {
  mock: mockSupplier,
  // cj: cjDropshippingAdapter,   <- implement SupplierAdapter and register here
};

export function supplier(): SupplierAdapter {
  const name = process.env.SUPPLIER || 'mock';
  const adapter = adapters[name];
  if (!adapter) throw new Error(`Unknown SUPPLIER "${name}". Registered: ${Object.keys(adapters).join(', ')}`);
  return adapter;
}
