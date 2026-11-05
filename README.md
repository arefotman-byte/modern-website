# Trendcart: an online shop run by agents

A dropshipping store where three Claude-powered agents do the work:

| Agent | What it does | Tools |
|---|---|---|
| **Research** | Searches the web for what is trending, matches trends to the supplier catalog, scores demand and shortlists products | Web search (Anthropic-hosted), `search_supplier_catalog`, `list_existing_products`, `save_candidate` |
| **Listing** | Writes product pages and sets prices for approved products | `list_approved_candidates`, `publish_listing` |
| **Fulfillment** | Orders paid items from the supplier (shipped straight to the customer), tracks shipments, emails customers, escalates problems | `list_open_orders`, `place_supplier_order`, `sync_supplier_status`, `email_customer`, `flag_for_human` |

```
web trends ─▶ Research ─▶ [you approve] ─▶ Listing ─▶ storefront ─▶ checkout ─▶ Fulfillment ─▶ supplier ships
```

## Guardrails

The rules live in `lib/config.ts` and are enforced in the tool code, so the model cannot break them:

- **Human approval** before a researched product can be listed (`requireCandidateApproval`).
- **Margin floor and ceiling.** A listing is rejected if the price is outside `cost × (1 + minMargin)` to `cost × (1 + maxMargin)`.
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

Without an API key the agents run in **simulate** mode: scripted logic, no web search and no API cost. Use it to try the whole flow.

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
