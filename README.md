# Trendcart: an online shop run by agents

A dropshipping business that sells on its own storefront **and on eBay**. Three Claude-powered agents do the work:

| Agent | What it does | Tools |
|---|---|---|
| **Research** | Searches the web for what is trending, matches trends to the supplier catalog, scores demand and shortlists products | Web search (Anthropic-hosted), `search_supplier_catalog`, `list_existing_products`, `save_candidate` |
| **Listing** | Writes product pages, prices them after each channel's fees, and publishes to the storefront and eBay | `list_approved_candidates`, `publish_listing`, `list_listings_missing_channels`, `find_channel_category`, `publish_to_channel` |
| **Fulfillment** | Imports eBay sales, orders paid items from the supplier (shipped straight to the buyer), uploads tracking to eBay, emails store customers, escalates problems | `import_marketplace_orders`, `list_open_orders`, `place_supplier_order`, `sync_supplier_status`, `email_customer`, `flag_for_human` |

```
web trends ─▶ Research ─▶ [you approve] ─▶ Listing ─┬▶ storefront ─▶ checkout ─┬▶ Fulfillment ─▶ supplier ships ─▶ tracking to eBay / email
                                                    └▶ eBay ──────▶ eBay sale ─┘
```

## Guardrails

The rules live in `lib/config.ts` and are enforced in the tool code, so the model cannot break them:

- **Human approval** before a researched product can be listed (`requireCandidateApproval`).
- **Margin after fees.** Each channel declares its fees (eBay ≈ 13.6% + $0.40, set in `lib/channels/ebay.ts`). A price is rejected unless, after those fees, it earns between `minMargin` and `maxMargin` over landed cost.
- **Small marketplace stock.** Only `marketplaceListQuantity` units are listed on eBay at a time, which limits overselling if the supplier runs out.
- **No demo products on live eBay.** Publishing is refused while the demo supplier is in use and eBay is live.
- **Spend cap.** Supplier orders above `maxAutoSpendPerOrder` are refused and the order is flagged for you.
- **Landed-cost cap** on sourced products, a cap on candidates per run, duplicate-email protection, and only one copy of each agent can run at a time.
- Every agent step (tool calls, results, web searches) is logged in the **Agent control room** (`/admin`).

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to use real agents
npm run dev
```

Open http://localhost:3000/admin and:

1. **Run Research.** Approve the products you like.
2. **Run Listing.** The products appear on the storefront at `/`.
3. **Buy something** on the storefront. The fulfillment agent runs automatically. Run it again after about 20 seconds to see the shipment update and tracking email.

eBay runs in **dry-run** until its credentials are set: listings get fake ids, and the **Simulate eBay sale** button in the Listings section creates a test sale for the fulfillment agent to process.

Without an API key the agents run in **simulate** mode: scripted logic, no web search and no API cost. Use it to try the whole flow.

## Selling on eBay

1. Create a developer app at developer.ebay.com and get a **user refresh token** with the `sell.inventory` and `sell.fulfillment` scopes.
2. In your seller account, opt in to business policies. Create shipping (with a handling time you can meet), payment and return policies, plus an inventory location. Put their ids in `.env.local` (see `.env.example`).
3. Test with `EBAY_ENV=sandbox` first, then switch to `production`.

The eBay connector (`lib/channels/ebay.ts`) uses the Inventory API (inventory item → offer → publish), the Fulfillment API (fetch paid orders, upload tracking) and the Taxonomy API (category suggestions). It hasn't been run against eBay yet, so expect to fix a field or two in the sandbox.

**eBay's dropshipping rules:** eBay allows dropshipping only from a **wholesale supplier or manufacturer**. Buying from another retailer or marketplace (Amazon, Walmart, AliExpress retail listings, other eBay sellers) and shipping to your buyer is prohibited and can get the account suspended. You are responsible for on-time delivery, and long shipping times hurt seller metrics. Prefer suppliers with local warehouses, tracked shipping and blind packaging (no supplier invoice or branding). New eBay accounts also start with selling limits.

**Adding Amazon, Etsy, Walmart, TikTok Shop…:** implement `ChannelAdapter` (`lib/channels/types.ts`) and register it in `lib/channels/index.ts`. The agents pick it up automatically. Each marketplace has its own dropshipping policy, so read it first.

## Going to production

| Piece | Now | Replace with |
|---|---|---|
| Supplier | `lib/suppliers/mock.ts` demo catalog | A real `SupplierAdapter` (e.g. CJ Dropshipping, AliExpress, Spocket, or a wholesaler's API), registered in `lib/suppliers/index.ts` and selected with `SUPPLIER=` |
| Payments | Checkout marks orders paid immediately | Stripe Checkout. Create the order from the payment-succeeded webhook |
| Email | Outbox stored in the DB | Resend, SendGrid, SES… inside `email_customer` |
| Database | `data/db.json` | Postgres or SQLite (`lib/db.ts` is the only file to change) |
| Scheduling | "Run agent" buttons | A cron job calling `POST /api/agents/{research,listing,fulfillment}`, e.g. research daily and fulfillment every 15 minutes |
| Admin access | Open | Set `ADMIN_PASSWORD`. Basic auth then protects `/admin` and the agent APIs |

Before selling for real, check consumer-protection rules in your market: accurate shipping times, returns policy, product safety, and VAT/sales tax.
