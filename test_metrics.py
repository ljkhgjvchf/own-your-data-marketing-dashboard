"""Checks the dashboard's JS numbers against SQL on the DuckDB file. Run: python test_metrics.py"""
import json
import subprocess

import duckdb

FROM, TO = "2026-10-20", "2026-11-18"
con = duckdb.connect("data/marketing.duckdb", read_only=True)
q = lambda sql: con.execute(sql, [FROM, TO]).fetchone()[0]
expected = {
    "rev": q("select sum(revenue) from shop_orders where created_at between ? and ?"),
    "newN": q("select count(*) from shop_orders where not is_renewal and created_at between ? and ?"),
    "cost": q("select sum(cost) from ad_daily where date between ? and ?")
            + q("select sum(amount) from marketing_costs where date between ? and ?"),
    # an order has a source if it has a UTM, or (no UTM but) a creator's coupon
    "attributed": q("""select avg((o.channel is not null or c.id is not null)::int) from shop_orders o
                       left join creators c on o.coupon = c.coupon where not o.is_renewal and o.created_at between ? and ?"""),
    "creatorRev": q("""select sum(o.revenue) from shop_orders o left join creators c on o.coupon = c.coupon
                       where not o.is_renewal and (o.channel = 'creators' or (o.channel is null and c.id is not null))
                       and o.created_at between ? and ?"""),
    # matched revenue, Meta: what this period's Meta leads bought (any time) + new Meta orders with no lead
    "metaMatched": q("""select (select coalesce(sum(o.revenue), 0) from crm_leads l join shop_orders o on o.customer_id = l.lead_id
                                where l.channel = 'meta' and l.created_at between $1 and $2)
                             + (select sum(revenue) from shop_orders where channel = 'meta' and not is_renewal
                                and lead_date is null and created_at between $1 and $2)"""),
}

js = f"""
const fs = require('fs');
const el = () => ({{ innerHTML: '', style: {{}}, addEventListener() {{}}, classList: {{ add() {{}}, remove() {{}} }} }});
global.window = global; global.location = {{ hash: '#/brief' }};
global.document = {{ getElementById: el, addEventListener() {{}}, querySelectorAll: () => [], documentElement: {{}} }};
global.getComputedStyle = () => ({{ getPropertyValue: () => '#000' }});
global.addEventListener = () => {{}}; global.scrollTo = () => {{}};
global.echarts = {{ init: () => ({{ setOption() {{}}, on() {{}}, dispose() {{}}, resize() {{}} }}) }};
eval(fs.readFileSync('web/data.js', 'utf8'));
eval(fs.readFileSync('web/app.js', 'utf8') + `
  Object.assign(S, {{ from: '{FROM}', to: '{TO}' }});
  for (const p of Object.values(PAGES)) p.render();  // every page renders without throwing
  const m = M(R());
  console.log(JSON.stringify({{ rev: m.rev, newN: m.newN, cost: m.cost.total, attributed: m.attributed,
                                metaMatched: camp('meta', null, R()).rev, creatorRev: sum(rows('orders', R(), x => !x.ren && x.ch === 'creators'), 'rev') }}));`);
"""
got = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
for k, v in expected.items():
    assert abs(got[k] - v) < 0.01 * max(1, abs(v)) / 100, f"{k}: dashboard {got[k]} vs SQL {v}"
print("metrics ok:", {k: round(v, 2) for k, v in got.items()})
