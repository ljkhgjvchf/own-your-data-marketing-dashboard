# Reference dashboard analysis + v1 architecture (19 Nov 2026)

Reference: an existing private marketing dashboard (reviewed from screenshots). Goal: a professional template for Nicola's portfolio, reusable for clients. Public version = Convertleads brand + sandbox data, no client names, data or funnel specifics.

## 1. Part by part: can we recreate it?

| # | Reference part | What it shows | Recreate? | Gap in our v0.1 | Improve |
|---|---|---|---|---|---|
| 1 | Global filter bar | Time grain (daily/weekly/monthly), from/to, compare (off / last year / 1 month ago), channel, product, price, campaign, type (new/renewal), lead sequence | ✅ yes | We only have date + previous period | Same bar, sticky, plus a "saved view" chip row |
| 2 | Overview KPI row | Sales, revenue (new vs renewal), avg ticket, avg sale/day, renewal revenue | ✅ | No new/renewal split, no avg ticket | Each KPI gets target + traffic light + sparkline |
| 3 | Profit block | Revenue − Google+Meta spend, all vs new, ROAS all/new, last-year compare | ✅ | Missing | Rename to **contribution after marketing**: subtract creator fees, affiliate commission and agency cost too, not just ad spend |
| 4 | Sales / revenue / avg ticket chart | Stacked new vs renewal bars + ticket line + count line, click a bar to see the sales | ✅ | Only a 2-line chart | Same, plus click → order list drawer |
| 5 | Lead gen block | Revenue, lead spend, CPL, cost per purchase, ROAS; stacked clicks by funnel + spend line; CPL vs share of qualified leads | ✅ | Missing | Keep the "qualified lead share" idea (generic segment), it's the best chart in the reference |
| 6 | By-funnel table | Spend, visits, leads, visit→lead, CPL, finished, checkout clicks, bought | ✅ | Partial | Add CAC and ROAS columns, conditional colours vs target |
| 7 | Leads & revenue brought | Lead cohort by registration day → converted, rate, revenue; filter by email sequence | ✅ | Missing | Show as cohort curve (day 0, 7, 30) so recent cohorts don't look "bad" |
| 8 | Top products | Volume, most sold price, revenue, renewals toggle | ✅ | Missing | Add margin column when cost is known |
| 9 | Google Ads page | Per-campaign card: attribution rule chips (LEADS / DIRECT SALES / NEVER), spend-revenue-ROAS hero, impressions→clicks→leads→sales chain with rates, lead-dated vs sale-dated revenue, "not provable" bucket, segment split, daily combo chart with series toggles, funnel, landing pages used, carousel of funnels | ✅ | We have one table | Keep everything. Fix: the reference mixes **$ and €** on this page |
| 10 | Meta Ads page | Same card + **sales & ROAS per creative** table, All/Stripe/LTV toggle, LTV per lead, ad-set filter | ✅ | No creative level | Creative table gets thumbnail, hook rate, days running (fatigue) |
| 11 | Channel funnel | 100% stacked bars traffic → leads → sales by channel; channel table with CAQ; landing-page order attribution; share of orders with attribution data | ✅ | Partial | Coverage % becomes a headline KPI (most leads/sales sit in "Other / not set" in the reference: the #1 problem) |
| 12 | Landing pages | Pick a page → traffic by source vs sales by source vs platform conversions; all-pages table | ✅ | Partial | Add lead rate when the form records the page |
| 13 | Email conversion | (no data) | ✅ | Missing | Per email: sent, open, click, leads, sales, revenue, revenue per send, on a calendar |
| 14 | Product management (renewals) | Projected renewal revenue | ⏭ skip | – | Client-specific, out of the template |
| 15 | Influencers | Overview (contents, cost, paid/to pay, plays, organic CPM; boosted spend, paid CPM, sales, ROAS), posts table with invoice/payment, content calendar, quotations | ✅ | We have one ranking | Split into 5 creator types (see §3). Reference has **no leads/sales per creator**, only for boosted posts |

Everything is recreatable. The reference has nothing that needs a closed tool.

## 2. What the research says is missing (both dashboards)

| Source | Principle | What the reference lacks | Fix in v1 |
|---|---|---|---|
| Avinash Kaushik (Action Dashboard, "IAbI") | Never data without Insight → Action → Business impact | Hundreds of numbers, zero sentences on "so what" | **Decision Brief** home: 5 KPIs vs target + auto-written "what changed, likely why, suggested action" cards |
| Google Modern Measurement Playbook | Attribution = upper bound, incrementality = lower bound, MMM in between | Three different ROAS labels (directional / projected / real) with no order | One rule per channel: **platform ROAS (ceiling) · matched ROAS (floor) · decision ROAS** shown as a range bar |
| BCG + Google maturity (2021) | Linked first-party data + agile test loops: +18 pp revenue, +29 pp cost efficiency | No test log, no targets | **Experiments** page: hypothesis, start/end, metric, result, decision |
| Binet & Field / Ritson | Short-term metrics undervalue brand by ~half; add one slow metric | Nothing long-term, no SEO | **SEO + share of search** (branded search vs competitors) |
| r/PPC practitioners | Run on blended MER + cost per *new* customer; platform ROAS only inside a channel | MER and nCAC absent | MER + nCAC are the top 2 KPIs |

Also missing: Search Console, organic social, email data, targets/alerts, a data-health page, metric definitions.

## 3. Creators hub (expanded, Nicola 19 Nov)

| Type | Deal | Core metrics |
|---|---|---|
| Paid influencers | Flat fee per post (+ optional boost) | Posts, plays, organic CPM, leads, sales, revenue, CAC, ROAS; boosted spend + paid ROAS; payment status |
| Affiliates | 20% commission on revenue | Clicks, sales, revenue, commission owed / paid, profit after commission, earnings per click |
| UGC creators | Pay per asset, content runs as our ads | Assets delivered, ads live, spend, hook rate, CTR, CPA, ROAS per asset, days to fatigue |
| Ambassadors | Long-term, retainer and/or commission | Posts per month vs agreed, cumulative leads/sales, cost per month, customer retention from their buyers |
| Partnerships | Brand / newsletter / 1:1 swaps | Status pipeline (contacted → agreed → published), publish date, deliverables, reach, leads, revenue |

Common: one creator table (Google Sheet) with a `type` column, coupon + UTM per creator, content calendar across all types.

## 4. v1 navigation (organised by decision, not by tool)

```
Brief            ← weekly: north star, 5 KPIs vs target, insight/action cards, data-health strip
Acquisition ▾    Overview · Google Ads · Meta Ads · SEO
Creators ▾       Overview · Paid influencers · Affiliates · UGC · Ambassadors · Partnerships · Calendar
Analyses ▾       Channel funnel · Landing pages · Email · Lead cohorts · Products
Trust ▾          Data health · Experiments · Definitions
```

Cadence: Brief weekly (owner: marketing manager). Channel pages daily/weekly (owner: channel lead). Trust monthly.

## 5. Build

- Data: `seed.py` (expanded sandbox) → DuckDB → `export.py` → `web/data.json` (daily grain, filtered in the browser). v0.2 swaps the seed for dlt connectors, same tables.
- UI: static HTML + vanilla JS + Apache ECharts (Apache-2.0, CDN). Replaces Streamlit: full control over the look, and it deploys as a **live demo link** (GitHub Pages / Vercel) to send with DASH DMs.
- Brand: Convertleads kit (Inter Tight, #FA5D29 accent, #17120F dark), plus a 8-colour categorical chart palette with distinct hues.
