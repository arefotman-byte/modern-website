import crypto from 'crypto';
import type { SupplierProduct } from '../types';
import type { SupplierAdapter, SupplierOrderRequest, SupplierOrderStatus } from './types';

/**
 * Demo supplier with a fixed catalog. Orders progress on a timer
 * (processing -> shipped after 20s -> delivered after 60s) so the whole
 * pipeline can be exercised locally.
 */
const catalog: SupplierProduct[] = [
  p('sp_001', 'Portable Neck Fan (Bladeless)', 'Gadgets', 'USB-C rechargeable bladeless neck fan, 3 speeds, 8h battery.', 6.8, 3.2, 92, 18400, 4.6, '🌀'),
  p('sp_002', 'Magnetic Phone Mount for Car Vents', 'Car accessories', 'MagSafe-compatible vent mount with 360° rotation.', 3.1, 2.4, 95, 25100, 4.7, '🧲'),
  p('sp_003', 'Sunset Projection Lamp', 'Home decor', 'Rotating sunset/rainbow projection lamp, 16 colors, remote included.', 7.9, 4.1, 88, 9600, 4.4, '🌅'),
  p('sp_004', 'Posture Corrector Brace', 'Health', 'Adjustable upper-back posture corrector, breathable fabric.', 4.2, 2.8, 140, 13200, 4.2, '🧍'),
  p('sp_005', 'Self-Cleaning Pet Hair Remover Roller', 'Pets', 'Reusable lint/pet hair roller with self-cleaning base.', 2.9, 2.6, 300, 31800, 4.8, '🐾'),
  p('sp_006', 'Mini Portable Blender (USB-C)', 'Kitchen', '380ml personal blender, 6 stainless blades, rechargeable.', 8.4, 4.9, 75, 15800, 4.5, '🥤'),
  p('sp_007', 'LED Strip Lights 10m (App Control)', 'Home decor', 'RGB LED strip with music sync and smartphone app.', 6.1, 3.5, 210, 20400, 4.3, '💡'),
  p('sp_008', 'Ice Roller for Face', 'Beauty', 'Stainless steel cold facial roller for puffiness.', 2.2, 2.1, 400, 22700, 4.6, '🧊'),
  p('sp_009', 'Electric Spin Scrubber', 'Home cleaning', 'Cordless power scrubber with 7 brush heads, extendable handle.', 14.5, 6.8, 60, 11300, 4.5, '🧽'),
  p('sp_010', 'Cloud Slides (Pillow Sandals)', 'Fashion', 'Ultra-soft thick-sole EVA slides, unisex sizes.', 4.6, 3.9, 500, 28900, 4.4, '🩴'),
  p('sp_011', 'Smart Plant Watering Globes (4-pack)', 'Garden', 'Self-watering glass globes, keep plants watered for 2 weeks.', 3.8, 3.3, 120, 4100, 4.1, '🪴'),
  p('sp_012', 'Weighted Jump Rope (Cordless)', 'Fitness', 'Cordless smart jump rope with digital counter.', 5.4, 3.1, 180, 7600, 4.3, '🏋️'),
  p('sp_013', 'Car Seat Gap Filler (2-pack)', 'Car accessories', 'PU leather gap filler with storage pocket.', 3.4, 3.0, 220, 8800, 4.2, '🚗'),
  p('sp_014', 'Massage Gun Mini', 'Health', 'Pocket-size percussion massager, 4 heads, 6 speeds.', 17.9, 5.5, 45, 12600, 4.6, '💆'),
  p('sp_015', 'Galaxy Star Projector', 'Home decor', 'Nebula star projector with bluetooth speaker and timer.', 11.2, 5.2, 70, 14500, 4.5, '🌌'),
  p('sp_016', 'Bamboo Desk Organizer', 'Office', 'Multi-compartment desk organizer with phone stand.', 7.5, 6.9, 90, 2300, 4.0, '🗂️'),
];

function p(
  id: string,
  name: string,
  category: string,
  description: string,
  unitCost: number,
  shippingCost: number,
  stock: number,
  ordersLast30d: number,
  rating: number,
  image: string,
): SupplierProduct {
  return {
    id,
    supplier: 'mock',
    name,
    category,
    description,
    unitCost,
    shippingCost,
    shippingDays: [7, 14],
    stock,
    rating,
    ordersLast30d,
    image,
  };
}

export const mockSupplier: SupplierAdapter = {
  name: 'mock',

  async searchProducts(query, limit = 10) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = catalog
      .map((prod) => {
        const hay = `${prod.name} ${prod.category} ${prod.description}`.toLowerCase();
        const hits = terms.filter((t) => hay.includes(t)).length;
        return { prod, hits };
      })
      .filter((x) => terms.length === 0 || x.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.prod.ordersLast30d - a.prod.ordersLast30d);
    return scored.slice(0, limit).map((x) => x.prod);
  },

  async getProduct(id) {
    return catalog.find((prod) => prod.id === id) ?? null;
  },

  async placeOrder(req: SupplierOrderRequest) {
    const prod = catalog.find((x) => x.id === req.supplierProductId);
    if (!prod) throw new Error(`Unknown supplier product ${req.supplierProductId}`);
    if (prod.stock < req.quantity) throw new Error(`Insufficient stock (${prod.stock} left)`);
    const supplierOrderId = `MOCK-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const charged = round2((prod.unitCost + prod.shippingCost) * req.quantity);
    return { supplierOrderId, charged };
  },

  async getOrderStatus(supplierOrderId): Promise<SupplierOrderStatus> {
    const ts = Number(supplierOrderId.split('-')[1]);
    if (!ts) throw new Error(`Unknown supplier order ${supplierOrderId}`);
    const age = (Date.now() - ts) / 1000;
    const trackingNumber = `TRK${supplierOrderId.slice(-6).toUpperCase()}${String(ts).slice(-4)}`;
    if (age < 20) return { supplierOrderId, status: 'processing' };
    if (age < 60) return { supplierOrderId, status: 'shipped', trackingNumber, carrier: 'USPS' };
    return { supplierOrderId, status: 'delivered', trackingNumber, carrier: 'USPS' };
  },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
