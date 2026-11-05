import type { SupplierProduct } from '../types';

export interface SupplierOrderRequest {
  supplierProductId: string;
  quantity: number;
  shipTo: { name: string; address: string };
  reference: string; // our order id
}

export interface SupplierOrderStatus {
  supplierOrderId: string;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
}

/**
 * Every supplier integration (CJ Dropshipping, AliExpress, Spocket, a
 * wholesaler's API, a CSV + email workflow...) implements this interface.
 * The agents only ever talk to suppliers through it.
 */
export interface SupplierAdapter {
  name: string;
  searchProducts(query: string, limit?: number): Promise<SupplierProduct[]>;
  getProduct(id: string): Promise<SupplierProduct | null>;
  placeOrder(req: SupplierOrderRequest): Promise<{ supplierOrderId: string; charged: number }>;
  getOrderStatus(supplierOrderId: string): Promise<SupplierOrderStatus>;
}
