"""DuckDB -> web/data.js (aggregated, string columns dictionary-encoded). Run: python export.py"""
import json
from pathlib import Path

import duckdb

con = duckdb.connect("data/marketing.duckdb", read_only=True)

QUERIES = {
    "ads": """select strftime(date, '%Y-%m-%d') d, platform, campaign, funnel, landing_page page, impressions imp,
                     clicks, cost, platform_conversions pconv, platform_revenue prev from ad_daily""",
    "creatives": """select strftime(date, '%Y-%m-%d') d, campaign, creative, format, impressions imp, clicks, cost,
                           video_3s_views v3s from meta_creatives""",
    "sessions": """select strftime(date, '%Y-%m-%d') d, landing_page page, channel ch, coalesce(campaign, '') camp,
                          sum(sessions) s, sum(add_to_cart) carts, sum(begin_checkout) chk
                   from ga4_sessions group by all""",
    # one row per lead-day slice; conv/rev = what those leads bought afterwards (matched by customer id = email)
    "leads": """select strftime(l.created_at, '%Y-%m-%d') d, coalesce(l.channel, '') ch, coalesce(l.campaign, '') camp,
                       l.landing_page page, l.qualified::int q, l.sequence seq, count(distinct l.lead_id) n,
                       count(distinct o.customer_id) conv, coalesce(sum(o.revenue), 0) rev
                from crm_leads l left join shop_orders o on o.customer_id = l.lead_id
                group by all""",
    # coupon recovery: an order with no UTM but a creator's coupon is credited to that creator (cp = 2)
    "orders": """select strftime(o.created_at, '%Y-%m-%d') d, o.product prod, o.is_renewal::int ren,
                        case when o.channel is null and c.id is not null and not o.is_renewal then 'creators' else coalesce(o.channel, '') end ch,
                        case when o.channel is null and c.id is not null and not o.is_renewal then c.id else coalesce(o.campaign, '') end camp,
                        coalesce(o.creative, '') cr, coalesce(o.landing_page, '') page,
                        case when o.channel is null and c.id is not null then 0 else (o.lead_date is not null)::int end via,
                        case when o.coupon is null then 0 when o.channel is null and c.id is not null then 2 else 1 end cp,
                        count(*) n, sum(o.revenue) rev
                 from shop_orders o left join creators c on o.coupon = c.coupon group by all""",
    "gsc": """select strftime(date, '%Y-%m-%d') d, query q, page, clicks, impressions imp, position pos,
                     branded::int b from gsc_queries""",
    "sos": "select month m, brand, searches from share_of_search",
    "costs": "select strftime(date, '%Y-%m-%d') d, category cat, creator cid, sum(amount) amount from marketing_costs group by all",
    "creators": "select id, handle, type, platform, followers, coupon, fee, commission, retainer, posts_month pm, strftime(since, '%Y-%m-%d') since, contact, payment from creators",
    "content": "select id, creator cid, type, strftime(date, '%Y-%m-%d') d, status, format, cost, paid::int paid, invoice::int inv, plays, likes, comments, boost, boost_imp, url from creator_content",
    "quotes": "select handle, platform, followers, avg_views, fee, deliverables, status, strftime(received, '%Y-%m-%d') d from creator_quotes",
    "partners": "select id, partner, kind, status, strftime(date, '%Y-%m-%d') d, reach, cost, gave, strftime(contacted, '%Y-%m-%d') contacted from partnerships",
    "ugc": "select asset, creator cid, strftime(date, '%Y-%m-%d') d, cost, creative, status from ugc_assets",
    "ai": """select strftime(week, '%Y-%m-%d') wk, engine eng, prompt, page, brand, mentioned m, cited c from ai_visibility""",
    "lh": "select month m, page, device dev, performance perf, accessibility a11y, best_practices bp, seo, agentic, lcp_s lcp, inp_ms inp, cls from lighthouse",
    "geo": "select * from geo_checks",
    "emails": "select id, strftime(date, '%Y-%m-%d') d, type, subject, page, sent, opens, clicks, unsubs, cost from email_sends",
    "flows": "select strftime(date, '%Y-%m-%d') d, flow, sent, opens, clicks from email_flows",
    "exp": "select name, area, hypothesis, metric, strftime(start, '%Y-%m-%d') s, strftime(\"end\", '%Y-%m-%d') e, n_a, rate_a, n_b, rate_b, decision from experiments",
    # lead cohorts: month of sign-up x months until purchase
    "cohorts": """select strftime(date_trunc('month', l.created_at), '%Y-%m') cm, coalesce(l.channel, '') ch,
                         datediff('month', date_trunc('month', l.created_at), date_trunc('month', o.created_at)) age,
                         count(distinct o.customer_id) buyers, sum(o.revenue) rev
                  from crm_leads l join shop_orders o on o.customer_id = l.lead_id group by all""",
    # monthly-plan retention: renewals per customer, by first-purchase month
    "retention": """with f as (select customer_id, min(created_at) first, count(*) filter (where is_renewal) renewals
                               from shop_orders where product = 'Monthly plan' group by 1)
                    select strftime(date_trunc('month', first), '%Y-%m') cm, renewals, count(*) n from f group by all""",
}


def table(sql):
    rel = con.sql(sql)
    cols, rows = rel.columns, rel.fetchall()
    dicts = {}
    for j, c in enumerate(cols):
        if rows and isinstance(rows[0][j], str) and c not in ("d", "m", "wk", "found", "fix", "url", "contact", "handle", "id", "since", "contacted", "deliverables", "gave", "partner", "asset", "subject", "name", "hypothesis"):
            vals = sorted({r[j] for r in rows})
            dicts[c], idx = vals, {v: k for k, v in enumerate(vals)}
            rows = [r[:j] + (idx[r[j]],) + r[j + 1:] for r in rows]
    rows = [[(round(v, 4) if abs(v) < 10 else round(v, 2)) if isinstance(v, float) else v for v in r] for r in rows]  # keep small rates exact
    return {"cols": cols, "dicts": dicts, "rows": rows}


data = {k: table(q) for k, q in QUERIES.items()}
data["targets"] = dict(con.execute("select metric, target from targets").fetchall())
data["range"] = [str(x) for x in con.execute("select min(date), max(date) from ad_daily").fetchone()]

out = Path("web/data.js")
out.parent.mkdir(exist_ok=True)
out.write_text("window.DATA=" + json.dumps(data, separators=(",", ":")) + ";\n")
print(f"{out} {out.stat().st_size / 1e6:.2f} MB", {k: len(v["rows"]) for k, v in data.items() if isinstance(v, dict) and "rows" in v})
