# Setup guide: from an empty computer to a running agent shop

This guide assumes you have nothing installed. It works on **Windows** and **Mac**. Do the parts in order. You can stop after Part 3 and still have a working demo that costs nothing.

| Part | What you get | Cost |
|---|---|---|
| 1. Install the tools | Node.js, Git, a code editor | Free |
| 2. Get the code and start it | The shop running on your computer | Free |
| 3. Try the workflow | All agents working in simulate mode | Free |
| 4. Turn on the real AI agents | Agents that think, search the web and write listings | Pay per use (Claude API) |
| 5. Turn on autopilot | Agents run by themselves on a schedule | Same as Part 4 |
| 6. Run it 24/7 on a server | Works while your computer is off | About $5–20/month |
| 7. Sell for real | Real supplier, payments and marketplaces | Varies |

---

## Part 1: Install the tools

### 1.1 Open a terminal

You type commands into a **terminal**.

- **Windows:** press the Windows key, type **PowerShell** and open "Windows PowerShell".
- **Mac:** press **Cmd + Space**, type **Terminal** and press Enter.

Keep it open. After installing something new, **close the terminal and open a new one** so it picks up the change.

### 1.2 Install Node.js (runs the shop)

1. Go to **https://nodejs.org** and download the **LTS** version (the one marked "Recommended").
2. Run the installer and click Next/Continue through it with the default options.
3. In a **new** terminal, check it worked:
   ```bash
   node -v
   npm -v
   ```
   You should see version numbers, e.g. `v22.x.x` and `10.x.x`. Anything from Node 18.18 upwards works.

### 1.3 Install Git (downloads the code)

- **Windows:** download from **https://git-scm.com/download/win** and install with the default options. It includes "Git Credential Manager", which lets you sign in to GitHub through your browser.
- **Mac:** in Terminal run `xcode-select --install` and click Install. Alternatively, download from https://git-scm.com/download/mac.

Check it:
```bash
git --version
```

### 1.4 Install a code editor (to edit settings)

Download **Visual Studio Code** from **https://code.visualstudio.com** and install it. You'll use it to edit the settings file in Part 2.

---

## Part 2: Get the code and start it

### 2.1 Download the project

In the terminal, go to the folder where you want the project (for example your Documents folder) and download it:

```bash
cd ~/Documents
git clone https://github.com/arefotman-byte/modern-website.git
cd modern-website
git checkout claude/agent-online-shop-cnishh
```

If the repository is private, Git asks you to sign in to GitHub. On Windows a browser window opens. On Mac, GitHub no longer accepts your account password here: either install **GitHub Desktop** (https://desktop.github.com), sign in, and clone the repo from there, or create a *personal access token* on GitHub and paste it when asked for a password.

### 2.2 Install the project's libraries

```bash
npm install
```

This downloads everything the shop needs into a `node_modules` folder. It takes a minute or two. Warnings are normal. Only lines that say `ERR!` are errors.

### 2.3 Create your settings file

All settings and secret keys live in a file called `.env.local`. Start from the template:

- **Mac:** `cp .env.example .env.local`
- **Windows:** `copy .env.example .env.local`

Open the project in VS Code (`code .`, or File → Open Folder) and open `.env.local`. You'll fill it in over the next parts. **Never share this file or upload it anywhere.** It's already excluded from Git.

### 2.4 Check your setup

```bash
npm run doctor
```

This checks Node, the libraries and your settings, and tells you what's missing. ⚠️ warnings are fine for now.

### 2.5 Start the shop

```bash
npm run dev
```

When it says `Ready`, open these in your browser:

- **http://localhost:3000**: the storefront customers see
- **http://localhost:3000/admin**: the agent control room

To stop the shop, click the terminal and press **Ctrl + C**. Run `npm run dev` again to restart it, which you need to do after every change to `.env.local`.

---

## Part 3: Try the workflow (free)

Without a Claude API key the agents run in **simulate** mode. They follow a script instead of thinking, with no web search and no cost. Every marketplace is in **dry run**: nothing is sent to eBay, Amazon, Walmart or TikTok.

In the control room (http://localhost:3000/admin):

1. **Research → Run agent.** Products appear under *Shortlisted products*.
2. Click **Approve** on the ones you like.
3. **Listing → Run agent.** Products appear on your storefront and under *Listings*, with a price for each marketplace.
4. Buy something on the storefront (any name and address; no payment is taken). Or click **Simulate amazon sale** (or another marketplace) under *Listings*.
5. The **Fulfillment** agent orders the product from the supplier. Run it again after about 20 seconds: the order becomes *shipped*, tracking is "uploaded" to the marketplace, and store customers get an email in the *outbox*.

Every step each agent took is shown under *Agent runs*.

---

## Part 4: Turn on the real AI agents

The agents are powered by Claude. With an API key they really search the web for trends, judge products, write listings and handle orders.

1. Go to the **Claude Console** at **https://platform.claude.com** and create an account.
2. Under **Billing**, add credits (prepaid). Also set a **monthly spend limit** so costs can't surprise you.
3. Under **API Keys**, click **Create Key** and copy it. It starts with `sk-ant-`, and you can only see it once.
4. Paste it into `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...your key...
   ```
5. Stop the shop (Ctrl + C), run `npm run doctor`, then `npm run dev`.

The control room now says **Mode: live**.

**What it costs (rough estimates):**
- A research run (with web searches): roughly $0.50–$1.50.
- A listing run: roughly $0.10–$0.50.
- A fulfillment run: a few cents.

Watch the first few runs on the Console's Usage page to see your real numbers.

---

## Part 5: Turn on autopilot

So far the agents only run when you click **Run agent**. Autopilot runs them on a schedule while the shop is running. In `.env.local`:

```
AUTOPILOT=1
AUTOPILOT_RESEARCH_HOURS=24        # look for new products once a day
AUTOPILOT_LISTING_MINUTES=60       # list products you approved, every hour
AUTOPILOT_FULFILLMENT_MINUTES=15   # handle orders every 15 minutes
ADMIN_PASSWORD=choose-a-strong-password
```

Restart the shop. The control room shows **Autopilot: on**, and the terminal prints `[autopilot]` lines.

What autopilot does:
- An agent is **skipped when it has nothing to do**: no open orders, nothing approved to list, or products still waiting for your review. Quiet days cost almost nothing.
- **You stay in charge of what gets sold.** Research only shortlists products, and nothing is listed until you click Approve.
- The safety limits still apply: minimum margin after fees, a spend cap per supplier order, and small stock on marketplaces.

The catch: autopilot only runs while `npm run dev` is running, which means while your computer is on and awake. For around-the-clock operation, see Part 6.

---

## Part 6: Run it 24/7 on a server

The shop stores its data in the `data/` folder, so the server needs a **persistent disk**. Vercel and similar hosts don't work for this, because their disk is read-only and they stop background work.

**Option A: Railway (easiest, about $5+/month).** I haven't tested these steps.
1. Sign up at **https://railway.com** with your GitHub account.
2. **New Project → Deploy from GitHub repo**, then pick `modern-website`. In the service settings, set the branch to `claude/agent-online-shop-cnishh`.
3. Under **Variables**, add everything from your `.env.local` (API key, `AUTOPILOT=1`, `ADMIN_PASSWORD`, …).
4. Add a **Volume** and mount it at `/app/data` so your products and orders survive restarts and deploys.
5. Under **Networking**, generate a domain. That's your shop's public address.

**Option B: a small VPS (about $5/month, more hands-on).** For example Hetzner or DigitalOcean. Install Node.js on it, `git clone` the project, `npm install`, `npm run build`, then keep it running with `npx pm2 start npm --name shop -- start`.

Either way, **set `ADMIN_PASSWORD` first**. Without it, anyone with the address can open your control room.

Your shop's data is in `data/db.json`. Back it up regularly.

---

## Part 7: Sell for real

The workflow runs end to end, but these pieces are demos until you replace them. The README explains where each one plugs in.

1. **A real supplier.** The demo catalog has fake products, and the shop refuses to put them on live marketplaces. Marketplaces only allow dropshipping from **wholesale suppliers or manufacturers**, not from other shops. Prefer suppliers with US warehouses, product photos, barcodes (UPC/GTIN) and tracked shipping.
2. **Payments.** Checkout currently takes no money. Connect Stripe.
3. **Email.** Customer emails currently only appear in the outbox. Connect an email service (Resend, SendGrid, …).
4. **Marketplace accounts.** eBay, Amazon, Walmart and TikTok Shop each need a seller account plus API credentials (listed in `.env.example`; setup notes in the README). Test each in its sandbox first.
5. **The business side.** Register your business, handle sales tax/VAT, and write a returns policy and accurate shipping times.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `node`, `npm` or `git` is "not recognized" / "command not found" | Close the terminal and open a new one. If it still fails, reinstall (Part 1). |
| `npm install` shows `ERR!` | Check your internet connection and run it again. Make sure you're inside the `modern-website` folder (`cd modern-website`). |
| "Port 3000 is already in use" | The shop is already running in another terminal. Close that one, or run `npm run dev -- -p 3001` and use http://localhost:3001. |
| Changes to `.env.local` do nothing | Restart the shop (Ctrl + C, then `npm run dev`). |
| An agent run shows **failed** | Open the run under *Agent runs* to read the error. `401` or `authentication` means the API key is wrong. `credit balance` means you need to add credits. |
| The control room asks for a password | Use any username and your `ADMIN_PASSWORD`. |
| Nothing happens on autopilot | Check `AUTOPILOT=1` and restart. The terminal prints `[autopilot] waiting on …` with the reason an agent is waiting. |
