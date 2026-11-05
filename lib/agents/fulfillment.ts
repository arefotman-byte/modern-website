import { shopConfig } from '../config';
import { newId, now, readDb, updateDb } from '../db';
import { supplier } from '../suppliers';
import type { Order, OrderStatus } from '../types';
import type { AgentDefinition, LocalTool } from './runner';

function patchOrder(id: string, patch: Partial<Order>, note?: string) {
  return updateDb((db) => {
    const order = db.orders.find((o) => o.id === id);
    if (!order) throw new Error('No such order');
    Object.assign(order, patch, { updatedAt: now() });
    if (note) order.notes.push(`${now()} ${note}`);
    return order;
  });
}

const listOpenOrders: LocalTool = {
  name: 'list_open_orders',
  description:
    'List orders that still need work: paid (not yet ordered from supplier), ordered_from_supplier, or shipped (awaiting delivery).',
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  async run() {
    const db = readDb();
    return db.orders
      .filter((o) => ['paid', 'ordered_from_supplier', 'shipped'].includes(o.status))
      .map((o) => ({ ...o, listing: db.listings.find((l) => l.id === o.listingId)?.title }));
  },
};

const placeSupplierOrder: LocalTool = {
  name: 'place_supplier_order',
  description: `Buy the item from the supplier and have it shipped directly to the customer. Only for orders with status "paid". Orders costing more than $${shopConfig.maxAutoSpendPerOrder} are refused and must be flagged for a human.`,
  input_schema: {
    type: 'object',
    properties: { order_id: { type: 'string' } },
    required: ['order_id'],
    additionalProperties: false,
  },
  async run({ order_id }: { order_id: string }) {
    const db = readDb();
    const order = db.orders.find((o) => o.id === order_id);
    if (!order) throw new Error('No such order');
    if (order.status !== 'paid') throw new Error(`Order is ${order.status}; only paid orders can be placed`);
    const listing = db.listings.find((l) => l.id === order.listingId);
    if (!listing) throw new Error('Listing not found');
    const estimated = listing.cost * order.quantity;
    if (estimated > shopConfig.maxAutoSpendPerOrder)
      throw new Error(`Estimated supplier cost $${estimated} exceeds auto-spend limit; flag for human`);

    const result = await supplier().placeOrder({
      supplierProductId: listing.supplierProductId,
      quantity: order.quantity,
      shipTo: { name: order.customer.name, address: order.customer.address },
      reference: order.id,
    });
    patchOrder(
      order.id,
      { status: 'ordered_from_supplier', supplierOrderId: result.supplierOrderId },
      `Supplier order ${result.supplierOrderId} placed, charged $${result.charged}`,
    );
    return result;
  },
};

const syncSupplierStatus: LocalTool = {
  name: 'sync_supplier_status',
  description:
    'Fetch the latest supplier status and tracking number for an order already placed with the supplier, and update our order. Returns whether the status changed.',
  input_schema: {
    type: 'object',
    properties: { order_id: { type: 'string' } },
    required: ['order_id'],
    additionalProperties: false,
  },
  async run({ order_id }: { order_id: string }) {
    const order = readDb().orders.find((o) => o.id === order_id);
    if (!order?.supplierOrderId) throw new Error('Order has no supplier order yet');
    const s = await supplier().getOrderStatus(order.supplierOrderId);
    const map: Record<string, OrderStatus> = {
      processing: 'ordered_from_supplier',
      shipped: 'shipped',
      delivered: 'delivered',
      cancelled: 'needs_human',
    };
    const next = map[s.status];
    const changed = next !== order.status;
    if (changed)
      patchOrder(order.id, { status: next, trackingNumber: s.trackingNumber ?? order.trackingNumber }, `Supplier status: ${s.status}`);
    return { previous: order.status, current: next, changed, trackingNumber: s.trackingNumber };
  },
};

const emailCustomer: LocalTool = {
  name: 'email_customer',
  description:
    'Send the customer an email about their order (confirmation, shipped with tracking, delivered). Send each kind of update only once per order.',
  input_schema: {
    type: 'object',
    properties: {
      order_id: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['order_id', 'subject', 'body'],
    additionalProperties: false,
  },
  async run({ order_id, subject, body }: { order_id: string; subject: string; body: string }) {
    // Stub transport: writes to the outbox shown in the admin dashboard.
    // Replace with Resend/SendGrid/SES/Gmail to actually deliver.
    return updateDb((db) => {
      const order = db.orders.find((o) => o.id === order_id);
      if (!order) throw new Error('No such order');
      if (db.outbox.some((e) => e.orderId === order_id && e.subject === subject))
        throw new Error('An email with this subject was already sent for this order');
      db.outbox.unshift({ id: newId('mail'), to: order.customer.email, subject, body, orderId: order_id, createdAt: now() });
      return { sent: true };
    });
  },
};

const flagForHuman: LocalTool = {
  name: 'flag_for_human',
  description: 'Escalate an order to the shop owner when something is wrong (stock, cost, address, supplier error).',
  input_schema: {
    type: 'object',
    properties: { order_id: { type: 'string' }, reason: { type: 'string' } },
    required: ['order_id', 'reason'],
    additionalProperties: false,
  },
  async run({ order_id, reason }: { order_id: string; reason: string }) {
    patchOrder(order_id, { status: 'needs_human' }, `Flagged: ${reason}`);
    return { flagged: true };
  },
};

export const fulfillmentAgent = (): AgentDefinition => ({
  name: 'fulfillment',
  effort: 'low',
  system: `You are the fulfillment agent for ${shopConfig.shopName}. We dropship: the supplier ships directly to the customer.

For every open order:
- status "paid": place_supplier_order, then email the customer an order confirmation (expected delivery 7-14 days).
- status "ordered_from_supplier" or "shipped": sync_supplier_status. If it becomes "shipped", email the tracking number. If it becomes "delivered", send a short thank-you.
- If a tool fails in a way you cannot fix (stock, spend limit, supplier error), flag_for_human with a clear reason.

Emails: short, friendly, signed "${shopConfig.shopName}". Never invent tracking numbers or dates. Finish with a one-line summary.`,
  task: 'Process all open orders.',
  tools: [listOpenOrders, placeSupplierOrder, syncSupplierStatus, emailCustomer, flagForHuman],

  async simulate({ call }) {
    const orders = (await call('list_open_orders', {})) as (Order & { listing?: string })[];
    let actions = 0;
    for (const o of orders) {
      const first = o.customer.name.split(' ')[0];
      if (o.status === 'paid') {
        try {
          await call('place_supplier_order', { order_id: o.id });
          await call('email_customer', {
            order_id: o.id,
            subject: `Order ${o.id} confirmed`,
            body: `Hi ${first},\n\nThanks for your order of ${o.listing}! It ships within a few days and usually arrives in 7-14 days.\n\n— ${shopConfig.shopName}`,
          });
        } catch (err) {
          await call('flag_for_human', { order_id: o.id, reason: err instanceof Error ? err.message : String(err) });
        }
        actions++;
        continue;
      }
      const s = (await call('sync_supplier_status', { order_id: o.id })) as { current: string; changed: boolean; trackingNumber?: string };
      if (!s.changed) continue;
      actions++;
      if (s.current === 'shipped')
        await call('email_customer', {
          order_id: o.id,
          subject: `Order ${o.id} has shipped`,
          body: `Hi ${first},\n\nYour ${o.listing} is on the way. Tracking number: ${s.trackingNumber}.\n\n— ${shopConfig.shopName}`,
        });
      if (s.current === 'delivered')
        await call('email_customer', {
          order_id: o.id,
          subject: `Order ${o.id} delivered`,
          body: `Hi ${first},\n\nYour order was delivered. Enjoy it, and reply to this email if anything is wrong.\n\n— ${shopConfig.shopName}`,
        });
    }
    return `Processed ${orders.length} open order(s), ${actions} update(s).`;
  },
});
