export type AgentName = 'research' | 'listing' | 'fulfillment';

/** Where a product is sold. 'store' is our own storefront. */
export type ChannelName = 'store' | 'ebay' | 'amazon' | 'walmart' | 'tiktok';

/** A product as offered by a supplier (wholesale side). */
export interface SupplierProduct {
  id: string;
  supplier: string;
  name: string;
  category: string;
  description: string;
  unitCost: number; // USD, what we pay the supplier
  shippingCost: number; // USD, supplier -> customer
  shippingDays: [number, number];
  stock: number;
  rating: number; // supplier listing rating 0-5
  ordersLast30d: number; // sales velocity signal from the supplier platform
  image: string; // emoji placeholder used by the storefront
  images?: string[]; // real photo URLs (required by marketplaces such as eBay)
  gtin?: string; // UPC/EAN barcode (required by Walmart, and Amazon unless exempt)
  weightLb?: number; // shipping weight
}

export type CandidateStatus = 'pending_review' | 'approved' | 'rejected' | 'listed';

/** A product the research agent thinks is worth selling. */
export interface Candidate {
  id: string;
  supplierProductId: string;
  demandScore: number; // 0-100
  rationale: string;
  evidence: string[]; // URLs or notes backing up the demand claim
  status: CandidateStatus;
  createdAt: string;
}

/** A live product in our storefront. */
export interface Listing {
  id: string;
  candidateId: string;
  supplierProductId: string;
  title: string;
  description: string;
  bullets: string[];
  tags: string[];
  price: number;
  cost: number; // unitCost + shippingCost at time of listing
  image: string;
  active: boolean;
  createdAt: string;
  /** Marketplace copies of this listing (eBay etc.). */
  channels?: ChannelListing[];
}

export interface ChannelListing {
  channel: ChannelName;
  externalId: string; // e.g. eBay listing id
  url?: string;
  price: number;
  quantity: number;
  dryRun: boolean; // true = not really on the marketplace
  publishedAt: string;
}

export type OrderStatus =
  | 'paid'
  | 'ordered_from_supplier'
  | 'shipped'
  | 'delivered'
  | 'needs_human'
  | 'cancelled';

export interface Order {
  id: string;
  /** Where the sale happened. Missing on older orders = 'store'. */
  channel?: ChannelName;
  externalOrderId?: string; // marketplace order id
  channelLineItemId?: string;
  trackingPushed?: boolean; // tracking uploaded to the marketplace
  listingId: string;
  quantity: number;
  customer: { name: string; email: string; address: string };
  total: number;
  status: OrderStatus;
  supplierOrderId?: string;
  trackingNumber?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OutboxEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  orderId?: string;
  createdAt: string;
}

export type LogKind = 'info' | 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'web_search' | 'error';

export interface RunLog {
  at: string;
  kind: LogKind;
  message: string;
}

export interface AgentRun {
  id: string;
  agent: AgentName;
  mode: 'live' | 'simulate';
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  logs: RunLog[];
  summary?: string;
}

export interface DB {
  candidates: Candidate[];
  listings: Listing[];
  orders: Order[];
  outbox: OutboxEmail[];
  runs: AgentRun[];
  /** Fake marketplace orders waiting to be imported (dry-run testing only). */
  channelInbox?: { channel: ChannelName; listingId: string; quantity: number; buyer: Order['customer']; createdAt: string }[];
}
