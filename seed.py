"""Sandbox data for a fictional online kids' language course ("Acme Courses").

26 months, so 'compare with last year' works on every period. Writes data/marketing.duckdb with the same
table shapes the live connectors (dlt) will write in v0.2.  Run: python seed.py
"""
from datetime import date, timedelta
from math import exp, sin, pi
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

rng = np.random.default_rng(7)
START, END = date(2024, 9, 20), date(2026, 11, 18)
DAYS = [START + timedelta(d) for d in range((END - START).days + 1)]

PRODUCTS = {  # name: (price, renews every n days or None)
    "Monthly plan": (19.90, 30), "Annual plan": (149.00, None), "Starter pack": (49.00, None),
    "Family plan 6 months": (99.00, None), "Live workshop": (35.00, None)}
PROD_W = {"lead": [.42, .18, .22, .13, .05], "direct": [.20, .30, .25, .20, .05]}
SEQUENCES = ["Welcome 7-day", "Free lesson nurture", "Offer reminder"]

# platform, campaign, funnel type, landing page, daily impressions, CTR, CPC, lead rate,
# direct-buy rate, qualified-lead share, how much the platform over-claims revenue
CAMPAIGNS = [
    ("google_ads", "Search · Brand", "direct", "/", 1100, .110, .38, .03, .045, .70, 1.25),
    ("google_ads", "Search · Generic", "lead", "/free-lesson", 9000, .038, .85, .13, .004, .48, 1.40),
    ("google_ads", "PMax · Offer", "direct", "/offer", 32000, .012, .42, .02, .010, .35, 1.90),
]
CREATIVES = [  # meta creative, campaign, format, start day index, quality, fatigue half-life (days)
    ("UGC · Mum testimonial", "Prospecting · Free lesson", "video", 0, 1.3, 70),
    ("UGC · Kid speaking", "Prospecting · Free lesson", "video", 60, 1.6, 55),
    ("Static · 3 reasons", "Prospecting · Free lesson", "image", 0, 0.7, 90),
    ("Carousel · Lessons", "Prospecting · Free lesson", "carousel", 150, 1.0, 60),
    ("UGC · Before/after", "Prospecting · Free lesson", "video", 300, 1.8, 40),
    ("Offer · -20% video", "Retargeting · Offer", "video", 0, 1.2, 80),
    ("Offer · Price card", "Retargeting · Offer", "image", 200, 0.8, 120),
    ("Offer · Black Friday", "Retargeting · Offer", "video", 400, 1.5, 30),
]
# meta campaign: funnel type, landing page, lead rate, direct-buy rate, qualified share, revenue over-claim
META = {"Prospecting · Free lesson": ("lead", "/free-lesson", .09, .002, .42, 1.7),
        "Retargeting · Offer": ("direct", "/offer", .02, .022, .60, 1.5)}
META_CTR = {"Prospecting · Free lesson": .010, "Retargeting · Offer": .016}
QUERIES = [  # query, page, daily impressions, start position, branded
    ("acme courses", "/", 260, 1.1, True), ("acme courses login", "/account", 90, 1.0, True),
    ("acme courses price", "/offer", 70, 1.4, True),
    ("online english course for kids", "/", 1600, 9.5, False),
    ("free english lesson kids", "/free-lesson", 900, 5.2, False),
    ("how to raise a bilingual child", "/blog/bilingual-child", 2600, 7.4, False),
    ("english games for kids", "/blog/english-games", 2100, 13.8, False),
    ("best app to learn english kids", "/blog/best-apps", 1500, 11.6, False),
    ("english songs for kids", "/blog/english-songs", 3300, 21.0, False),
    ("kids english tutor online", "/offer", 600, 12.4, False),
    ("english for kids 6 years", "/free-lesson", 450, 8.9, False),
    ("phonics for kids", "/blog/phonics", 1200, 17.5, False),
]
AI_ENGINES = {"ChatGPT": .30, "Google AI Overviews": .26, "Perplexity": .22, "Gemini": .16, "Claude": .14}  # our base mention rate
AI_PROMPTS = [  # prompt, page we would want cited
    ("best app to learn english for kids", "/blog/best-apps"), ("how to raise a bilingual child", "/blog/bilingual-child"),
    ("online english course for a 6 year old", "/free-lesson"), ("free english lesson for kids online", "/free-lesson"),
    ("english games for preschoolers", "/blog/english-games"), ("is screen time ok for learning languages", "/blog/bilingual-child"),
    ("kids english tutor vs app", "/offer"), ("phonics programme for kids at home", "/blog/phonics"),
    ("acme courses review", "/"), ("lingo bee vs acme courses", "/"),
]
COMPETITORS = {"Acme Courses": 1.0, "Lingo Bee": 1.6, "Kidspeak": 1.1, "Polyglot Jr": 0.6}


def season(d):
    """Back-to-school in Sep, Black Friday, summer dip, slow growth."""
    doy = d.timetuple().tm_yday
    s = 1 + .12 * sin(2 * pi * (doy - 200) / 365)
    if d.month == 9 or (d.month == 10 and d.day < 10):
        s *= 1.25
    if d.month == 11 and 20 <= d.day <= 30:
        s *= 1.45
    if d.month in (7, 8):
        s *= .8
    return s * (1 + .00045 * (d - START).days)


ads, creative_rows, sessions, leads, orders, gsc, costs = [], [], [], [], [], [], []
first_order = {}  # customer id -> order row, for renewals
next_id = [100000]


def new_id():
    next_id[0] += 1
    return next_id[0]


def add_order(d, cid, prod, channel, campaign, creative, page, lead_date, coupon=None):
    row = [d, cid, prod, PRODUCTS[prod][0], False, True, channel, campaign, creative, page, lead_date, coupon]
    orders.append(row)
    first_order.setdefault(cid, row)


def add_traffic(d, page, channel, campaign, creative, n_sessions, lead_rate, buy_rate, qual, coupon=None):
    """Sessions + CRM leads + shop orders for one slice of traffic. Returns (leads, direct orders, revenue)."""
    if n_sessions <= 0:
        return 0, 0, 0.0
    carts = rng.binomial(n_sessions, min(buy_rate * 4.5 + .01, .6))
    sessions.append((d, page, channel, campaign, n_sessions, carts, rng.binomial(carts, .55)))
    n_leads = rng.binomial(n_sessions, lead_rate)
    for _ in range(n_leads):
        cid, q = new_id(), rng.random() < qual
        known = rng.random() > (.3 if channel == "email" else .12)  # hidden UTM fields lost
        ch, ca = (channel, campaign) if known else (None, None)
        leads.append((cid, d, ch, ca, page, q, SEQUENCES[rng.integers(3)]))
        if rng.random() < (.11 if q else .03):  # some leads buy later, matched by email
            od = d + timedelta(int(rng.exponential(9)))
            if od <= END:
                add_order(od, cid, rng.choice(list(PRODUCTS), p=PROD_W["lead"]), ch, ca, creative, page, d,
                          coupon if coupon and rng.random() < .4 else None)
    n_buy, rev = rng.binomial(n_sessions, buy_rate), 0.0
    for _ in range(n_buy):
        prod = rng.choice(list(PRODUCTS), p=PROD_W["direct"])
        known = rng.random() > .33  # consent refused / ad blockers / cross-device
        add_order(d, new_id(), prod, *((channel, campaign, creative) if known else (None, None, None)), page, None,
                  coupon if coupon and rng.random() < .6 else None)  # creator buyers often type the code, not the link
        rev += PRODUCTS[prod][0]
    return n_leads, n_buy, rev



# ---------- email: newsletters (Tuesdays), promos, automated flows ----------
NEWS = [  # subject, open-rate factor (visibility), click factor (efficiency)
    ("5 games that teach English while you cook", 1.15, 1.10), ("Is your child ready for a second language?", 1.20, .90),
    ("New: phonics lessons for 4-6 year olds", .95, 1.20), ("We tested 7 kids' apps. Here's the truth", 1.25, 1.00),
    ("Your weekly lesson plan", .80, .90), ("Why bilingual kids think differently", 1.10, .85),
    ("Free printable: 50 first words", 1.05, 1.30), ("A message from our teachers", .85, .80),
    ("3 mistakes parents make with screen time", 1.20, 1.00), ("Keep the English going this summer", .90, .95),
    ("Story time: The brave little fox", 1.00, 1.05), ("What 1,200 parents told us", 1.30, 1.10)]
PROMOS = [((9, 2), "Back to school: your first month for €1", "/offer"), ((11, 26), "Black Friday: 30% off the annual plan", "/offer"),
          ((11, 29), "Last day: 30% off ends at midnight", "/offer"), ((12, 15), "Give a year of English this Christmas", "/offer"),
          ((3, 20), "Spring offer: 2 months free on annual", "/offer")]
FLOWS = {"Welcome 7-day": (.52, .16, .010), "Free lesson nurture": (.44, .12, .016), "Offer reminder": (.38, .10, .030)}
EMAILS, EMAIL_BY_DAY, FLOW_ROWS = [], {}, []
for i, d in enumerate(DAYS):
    size = int(6000 + 9000 * i / len(DAYS))
    sends = []
    if d.weekday() == 1:
        subj, oq, cq = NEWS[(i // 7) % len(NEWS)]
        sends.append(("Newsletter", subj, oq, cq, "/blog/bilingual-child" if (i // 7) % 3 == 0 else "/offer", .34, .085, .022))
    for (m, dd), subj, page in PROMOS:
        if (d.month, d.day) == (m, dd):
            sends.append(("Promo", subj, 1.1, 1.3, page, .38, .13, .07))
    for typ, subj, oq, cq, page, o_base, c_base, buy in sends:
        sent = int(size * rng.uniform(.97, 1.0))
        opens = rng.binomial(sent, min(.8, o_base * oq * rng.uniform(.92, 1.08)))
        clicks = rng.binomial(opens, min(.5, c_base * cq * rng.uniform(.9, 1.1)))
        e = dict(id=f"{typ[:2].lower()}-{d:%Y%m%d}", date=d, type=typ, subject=subj, page=page, sent=sent, opens=opens, clicks=clicks,
                 unsubs=rng.binomial(sent, .0016 * (1.6 if typ == "Promo" else 1)), cost=round(sent * .0009, 2), buy=buy * cq)
        EMAILS.append(e)
        EMAIL_BY_DAY.setdefault(d, []).append(e)
    for fl, (o_r, c_r, buy) in FLOWS.items():
        sent = int(110 * season(d) * rng.uniform(.8, 1.2))
        opens = rng.binomial(sent, o_r)
        FLOW_ROWS.append(dict(date=d, flow=fl, sent=sent, opens=opens, clicks=rng.binomial(opens, c_r), buy=buy))

EXPERIMENTS = [  # name, area, hypothesis, metric, start/end offsets, control (n, rate), variant (n, rate), decision
    ("Shorter lead form (3 → 2 fields)", "Landing page", "Fewer fields = more free-lesson sign-ups, same quality", "Lead rate", -120, -92, (4210, .098), (4188, .116), "Shipped"),
    ("Subject line: question vs statement", "Email", "Questions raise curiosity and open rate", "Open rate", -84, -56, (6100, .361), (6080, .394), "Shipped"),
    ("UGC hook: child speaks in first 2 s", "Meta creative", "A real child on screen first stops the scroll", "CTR", -70, -49, (182000, .0092), (179500, .0118), "Shipped"),
    ("Meta prospecting geo holdout", "Incrementality", "Without prospecting in 4 regions, sales drop by what Meta claims", "Incremental ROAS", -60, -32, (None, 1.99), (None, .82), "Cut 30% of prospecting"),
    ("Annual plan shown first on /offer", "Pricing", "Anchoring on annual raises average ticket", "Revenue per visit", -40, -12, (5300, .0182), (5260, .0176), "No difference, keep testing"),
    ("Exit pop-up with 10% coupon", "Landing page", "A coupon at exit saves leaving buyers", "Revenue per visit", -100, -79, (6900, .0190), (6870, .0171), "Rejected"),
    ("Homepage hero: quiz vs video", "Landing page", "A 3-question quiz gets more visitors to start", "Lead rate", -9, 12, (1880, .052), (1902, .061), "Running"),
]
EXP = [dict(name=n, area=a, hypothesis=h, metric=m, start=END + timedelta(s0), end=END + timedelta(s1), n_a=ca[0], rate_a=ca[1],
            n_b=cb[0], rate_b=cb[1], decision=dec) for n, a, h, m, s0, s1, ca, cb, dec in EXPERIMENTS]

# ---------- creators: the influencer Google Sheet (one row per creator, `type` column) ----------
LAST = len(DAYS) - 1
day_at = lambda i: START + timedelta(int(i))
CREATORS, CONTENT, QUOTES, PARTNERS, UGC_ASSETS, BY_ID = [], [], [], [], [], {}
creator_traffic = {}  # date -> [(creator id, landing page, sessions, quality)]


def push_traffic(d, cid, page, n, q):
    if n >= 1 and d <= END:
        creator_traffic.setdefault(d, []).append((cid, page, int(n), q))


def add_creator(handle, typ, platform, followers, q, fee=0, commission=0.0, retainer=0, posts_month=0, start=0):
    cid = handle.lstrip("@").replace(".", "_")
    code = "".join(ch for ch in cid.split("_")[0] if ch.isalpha())[:6].upper() + ("20" if typ == "affiliate" else "10")
    while code in {c["coupon"] for c in CREATORS}:
        code = code[:-2] + str(int(code[-2:]) + 5)
    c = dict(id=cid, handle=handle, type=typ, platform=platform, followers=followers, quality=q, coupon=code,
             utm_campaign=cid, fee=fee, commission=commission, retainer=retainer, posts_month=posts_month,
             since=day_at(start), contact=f"{cid}@example.com", payment=str(rng.choice(["IBAN", "PayPal"])))
    CREATORS.append(c)
    BY_ID[cid] = c
    return c


def add_content(c, i0, fmt, cost, boost=0.0, reach=1.0, page="/free-lesson"):
    d0 = day_at(i0)
    posted = d0 <= END
    plays = int(c["followers"] * rng.uniform(.08, .35) * (1.8 if c["platform"] == "tiktok" else 1) * reach) if posted else 0
    likes = int(plays * rng.uniform(.01, .04))
    boost_imp = int(boost / rng.uniform(6, 14) * 1000) if posted and boost else 0  # partnership-ad CPM varies by audience
    paid = posted and ((END - d0).days > 14 or rng.random() < .4)
    CONTENT.append(dict(id=len(CONTENT) + 1, creator=c["id"], type=c["type"], date=d0, status="posted" if posted else "planned",
                        format=fmt, cost=float(cost), paid=bool(paid), invoice=bool(paid or rng.random() < .5), plays=plays,
                        likes=likes, comments=int(likes * rng.uniform(.03, .1)), boost=float(round(boost, 2)) if posted else 0.0,
                        boost_imp=boost_imp, url=f"https://example.com/{c['id']}/{len(CONTENT) + 1}"))
    if posted:
        for age in range(14):
            push_traffic(d0 + timedelta(age), c["id"], page,
                         plays * rng.uniform(.004, .012) * exp(-age / 3) + boost_imp * .006 * exp(-age / 5), c["quality"])
        if cost or boost:
            costs.append((d0, "creators", float(cost + boost), c["id"]))


# Paid influencers: flat fee per post, some posts boosted as partnership ads
for h, pf, fol, q in [("@lena.reads", "instagram", 48000, 1.4), ("@papa.plays", "tiktok", 120000, .5),
                      ("@maestra.sara", "instagram", 15000, 2.2), ("@tiny.linguists", "youtube", 32000, .8),
                      ("@mum.of.three", "instagram", 9000, 1.8), ("@bilingual.home", "instagram", 67000, .3),
                      ("@story.time.tom", "tiktok", 210000, .6), ("@learn.with.leo", "youtube", 5000, 1.1),
                      ("@la.famiglia.en", "instagram", 23000, 1.3), ("@kids.abc.club", "tiktok", 88000, .7),
                      ("@homeschool.hana", "instagram", 12000, 1.9), ("@daddy.diaries", "instagram", 41000, .9),
                      ("@petit.polyglot", "youtube", 18000, 1.2), ("@reading.nook", "instagram", 7000, 1.5)]:
    fee = int(min(900, max(80, fol * rng.uniform(.003, .006))) // 10 * 10)
    c = add_creator(h, "paid", pf, fol, q, fee=fee, start=int(rng.integers(0, LAST - 200)))
    i = (c["since"] - START).days + int(rng.integers(0, 30))
    while i <= LAST:  # a post every 2-7 weeks, up to today
        add_content(c, i, {"instagram": "Reel", "tiktok": "TikTok", "youtube": "YouTube video"}[pf],
                    fee, boost=float(rng.uniform(100, 450)) if rng.random() < .35 else 0.0)
        i += int(rng.integers(14, 50))
    if rng.random() < .4:
        add_content(c, LAST + int(rng.integers(2, 40)), {"instagram": "Reel", "tiktok": "TikTok", "youtube": "YouTube video"}[pf], fee)

# Affiliates: 20% commission on every new sale they bring, steady traffic from links and posts
for h, pf, fol, q in [("@bestkidsapps.blog", "blog", 0, 1.6), ("@montessori.mama", "instagram", 26000, 1.2),
                      ("@edtech.dad", "youtube", 14000, .9), ("@bilingual.kids.news", "newsletter", 9000, 1.4),
                      ("@homeschool.hub", "blog", 0, 1.1), ("@frugal.family", "blog", 0, .7),
                      ("@english.at.home", "instagram", 31000, 1.0), ("@parent.tips.daily", "newsletter", 22000, .6),
                      ("@language.toys", "blog", 0, 1.3), ("@expat.parents", "facebook", 15000, .8)]:
    st = int(rng.integers(0, LAST - 120))
    c = add_creator(h, "affiliate", pf, fol, q, commission=.20, start=st)
    base = rng.uniform(3, 22)
    for i in range(st, LAST + 1):
        push_traffic(day_at(i), c["id"], "/offer" if pf == "blog" else "/free-lesson", base * season(day_at(i)) * rng.uniform(.4, 1.6), q)

# UGC creators: paid per asset, content runs as our Meta ads (linked to the creative of the same name)
launch = {cr: (st + 365 if st else 0) for cr, _, _, st, _, _ in CREATIVES}
for h, pf, fol, assets in [("@ugc.by.nina", "tiktok", 3000, [("UGC · Mum testimonial", 220), ("UGC · Teacher POV", 260)]),
                           ("@clara.creates", "instagram", 2500, [("UGC · Kid speaking", 300)]),
                           ("@mo.makes.ads", "tiktok", 1800, [("UGC · Before/after", 350)]),
                           ("@ugc.julia", "instagram", 4100, [("UGC · Unboxing kit", 240)]),
                           ("@family.ugc.co", "tiktok", 1200, [("UGC · Day in the life", 180)])]:
    c = add_creator(h, "ugc", pf, fol, 1.0, fee=assets[0][1], start=0)
    for name, cost in assets:
        i0 = max(0, launch[name] - 7) if name in launch else {"UGC · Teacher POV": LAST + 6, "UGC · Unboxing kit": LAST - 10,
                                                              "UGC · Day in the life": LAST - 4}[name]
        UGC_ASSETS.append(dict(asset=name, creator=c["id"], date=day_at(i0), cost=float(cost),
                               creative=name if name in launch else "", status="delivered" if i0 <= LAST else "planned"))
        CONTENT.append(dict(id=len(CONTENT) + 1, creator=c["id"], type="ugc", date=day_at(i0), status="posted" if i0 <= LAST else "planned",
                            format="UGC video", cost=float(cost), paid=i0 <= LAST - 14, invoice=i0 <= LAST, plays=0, likes=0, comments=0,
                            boost=0.0, boost_imp=0, url=""))
        if i0 <= LAST:
            costs.append((day_at(i0), "creators", float(cost), c["id"]))

# Ambassadors: monthly retainer + 10% commission, an agreed number of posts a month
for h, pf, fol, q, ret, per_m, rel in [("@miss.emma.teaches", "instagram", 19000, 1.7, 250, 4, .95),
                                       ("@little.linguists.club", "tiktok", 54000, .9, 400, 4, .7),
                                       ("@mama.in.english", "instagram", 11000, 1.5, 150, 3, .55),
                                       ("@weekend.learners", "youtube", 8000, 1.1, 200, 2, .95)]:
    st = int(rng.integers(150, 420))
    c = add_creator(h, "ambassador", pf, fol, q, commission=.10, retainer=ret, posts_month=per_m, start=st)
    for m in sorted({day_at(i).replace(day=1) for i in range(st, LAST + 40)}):
        i_m = (m - START).days
        if m <= END:
            costs.append((max(m, c["since"]), "creators", float(ret), c["id"]))
        n = per_m if m > END.replace(day=1) else rng.binomial(per_m, rel)
        for _ in range(n):
            i = i_m + int(rng.integers(0, 28))
            if i >= st and (i > LAST or m <= END):
                add_content(c, i, "Reel" if pf != "youtube" else "YouTube short", 0, reach=.5)

# Partnerships: newsletter / app / school swaps and brand collabs, tracked as a pipeline
for name, kind, status, off, reach, cost, gave in [
        ("Little Explorers newsletter", "Newsletter swap", "published", -200, 28000, 0, "1 newsletter slot"),
        ("Kidsbook Club", "Brand collab", "published", -120, 45000, 350, "20 free accounts"),
        ("Primary Teachers Network", "School network", "published", -60, 12000, 0, "Teacher discount code"),
        ("Tiny Travellers", "Newsletter swap", "published", -18, 16000, 0, "1 newsletter slot"),
        ("Bedtime Stories app", "App cross-promo", "agreed", 12, 60000, 0, "In-app banner swap"),
        ("Mums of Milan group", "Community", "agreed", 25, 9000, 120, "Live Q&A for members"),
        ("Polyglot Parents podcast", "Podcast", "negotiating", None, 30000, 300, "Host-read ad"),
        ("Craft Kids box", "Brand collab", "contacted", None, 22000, 0, "Insert in 2,000 boxes"),
        ("Toy Planet stores", "Retail", "declined", None, 80000, 0, "Shelf display")]:
    c = add_creator("@" + name.lower().replace(" ", "."), "partner", kind, reach, rng.uniform(.8, 1.6), fee=cost, start=LAST - 230)
    d0 = day_at(LAST + off) if off is not None else None
    PARTNERS.append(dict(id=c["id"], partner=name, kind=kind, status=status, date=d0, reach=reach, cost=float(cost), gave=gave,
                         contacted=day_at(LAST + (off or 0) - int(rng.integers(20, 70)))))
    if d0:
        CONTENT.append(dict(id=len(CONTENT) + 1, creator=c["id"], type="partner", date=d0, status="posted" if d0 <= END else "planned",
                            format=kind, cost=float(cost), paid=d0 <= END, invoice=d0 <= END, plays=0, likes=0, comments=0,
                            boost=0.0, boost_imp=0, url=""))
        if d0 <= END:
            for age in range(5):
                push_traffic(d0 + timedelta(age), c["id"], "/offer", reach * rng.uniform(.01, .025) * exp(-age / 1.5), c["quality"])
            if cost:
                costs.append((d0, "creators", float(cost), c["id"]))

# Quotations received from prospective paid creators
for h, pf, fol, fee, deliv, status in [("@kinder.english", "instagram", 36000, 300, "1 Reel + 3 stories", "pending"),
                                       ("@the.tiny.teacher", "tiktok", 140000, 900, "2 TikToks", "pending"),
                                       ("@abc.with.amelie", "instagram", 21000, 180, "1 Reel", "accepted"),
                                       ("@playful.parenting", "youtube", 64000, 1200, "1 integration", "declined"),
                                       ("@bilingual.beats", "tiktok", 52000, 350, "1 TikTok + link in bio", "pending"),
                                       ("@kids.read.more", "instagram", 9000, 120, "1 Reel + 2 stories", "accepted"),
                                       ("@family.adventures", "instagram", 98000, 1500, "2 Reels", "declined"),
                                       ("@little.leaders", "youtube", 17000, 250, "1 video mention", "pending")]:
    views = int(fol * rng.uniform(.1, .3) * (1.8 if pf == "tiktok" else 1))
    QUOTES.append(dict(handle=h, platform=pf, followers=fol, avg_views=views, fee=float(fee), deliverables=deliv,
                       status=status, received=day_at(LAST - int(rng.integers(1, 40)))))

for i, d in enumerate(DAYS):
    s = season(d) * (.88 if d.weekday() >= 5 else 1.0)
    for plat, camp, kind, page, imp, ctr, cpc, lr, br, q, claim in CAMPAIGNS:
        impressions = int(imp * s * rng.uniform(.85, 1.15))
        clicks = rng.binomial(impressions, ctr)
        cost = round(clicks * cpc * rng.uniform(.88, 1.12) * (1.15 if d.month == 11 else 1), 2)
        nl, nb, rev = add_traffic(d, page, plat, camp, None, int(clicks * .9), lr, br, q)
        ads.append((d, plat, camp, kind, page, impressions, clicks, cost,
                    round((nl + nb) * rng.uniform(.75, .95)), round(rev * claim + nl * 2.5, 2)))
    for camp, (kind, page, lr, br, q, claim) in META.items():
        tot = dict(impressions=0, clicks=0, cost=0.0, conv=0, rev=0.0)
        for cr, ccamp, fmt, start, quality, half in CREATIVES:
            start = start + 365 if start else 0  # same calendar launch dates as before the history was extended
            if ccamp != camp or i < start:
                continue
            if cr == "Offer · Black Friday" and not (d.month == 11 and d.day >= 15):
                continue
            fatigue = exp(-(i - start) / half * .69)
            impressions = int(7000 * s * (.4 + .6 * fatigue) * rng.uniform(.8, 1.2) * (1.6 if quality > 1.4 else 1))
            clicks = rng.binomial(impressions, min(META_CTR[camp] * quality * (.55 + .45 * fatigue), .2))
            cost = round(impressions / 1000 * 7.5 * rng.uniform(.9, 1.1), 2)
            hook = min(.6, .22 * quality * (.6 + .4 * fatigue) * rng.uniform(.9, 1.1))
            nl, nb, rev = add_traffic(d, page, "meta", camp, cr, int(clicks * .85), lr * min(quality, 1.4),
                                      br * quality * (.5 + .5 * fatigue), q)
            creative_rows.append((d, camp, cr, fmt, impressions, clicks, cost, round(impressions * hook)))
            tot["impressions"] += impressions
            tot["clicks"] += clicks
            tot["cost"] += cost
            tot["conv"] += round((nl + nb) * rng.uniform(.5, .7))
            tot["rev"] += (rev + nl * 6) * claim
        ads.append((d, "meta", camp, kind, page, tot["impressions"], tot["clicks"], round(tot["cost"], 2),
                    tot["conv"], round(tot["rev"], 2)))

    organic = {}
    for qy, page, imp, pos0, branded in QUERIES:
        pos = max(1.0, pos0 + 2.4 - i * (0 if branded else .003) + rng.normal(0, .7))
        impressions = int(imp * s * rng.uniform(.85, 1.15))
        clicks = rng.binomial(impressions, min(.32 / pos ** 1.1, .65))
        gsc.append((d, qy, page, clicks, impressions, round(pos, 1), branded))
        organic[page] = organic.get(page, 0) + clicks
    for page, n in organic.items():
        blog = page.startswith("/blog")
        add_traffic(d, page, "organic_search", None, None, n, .018 if blog else .07, .001 if blog else .012, .5)
    add_traffic(d, "/", "direct", None, None, int(70 * s * rng.uniform(.8, 1.2)), .04, .014, .5)
    for e in EMAIL_BY_DAY.get(d, []):  # every send gets its own utm_campaign = email id
        add_traffic(d, e["page"], "email", e["id"], None, int(e["clicks"] * .85), .02, e["buy"], .6)
        costs.append((d, "email", e["cost"], ""))
    for f in (x for x in FLOW_ROWS[i * 3:i * 3 + 3]):
        add_traffic(d, "/offer", "email", f["flow"], None, int(f["clicks"] * .85), .01, f["buy"], .6)
    for slug, page, n, q in creator_traffic.get(d, []):
        add_traffic(d, page, "creators", slug, None, n, .10 * min(q, 1.6), .009 * q, .55, BY_ID[slug]["coupon"])
    add_traffic(d, "/", "referral", None, None, int(25 * s * rng.uniform(.7, 1.3)), .03, .006, .5)
    ai = 4 + 40 * (i / len(DAYS)) ** 1.6  # AI answer engines send more visits every month
    for page, w in (("/blog/bilingual-child", .4), ("/free-lesson", .35), ("/", .25)):
        add_traffic(d, page, "ai_search", None, None, int(ai * w * s * rng.uniform(.6, 1.4)), .09, .016, .62)
    costs.append((d, "agency_tools", 33.0, ""))

# Renewals: monthly-plan buyers renew every 30 days with 82% retention.
for cid, row in list(first_order.items()):
    if PRODUCTS[row[2]][1]:
        d = row[0] + timedelta(30)
        while d <= END and rng.random() < .82:
            orders.append([d, cid, row[2], row[3], True, False, row[6], row[7], None, None, None, None])
            d += timedelta(30)

# Commission: affiliates 20%, ambassadors 10%, on new sales credited to them by UTM or by coupon
BY_COUPON = {c["coupon"]: c for c in CREATORS}
for o in orders:
    c = BY_ID.get(o[7]) if o[6] == "creators" else None
    c = c or BY_COUPON.get(o[11])
    if c and c["commission"] and not o[4]:
        costs.append((o[0], "creators", round(o[3] * c["commission"], 2), c["id"]))

# AI search visibility: each tracked prompt asked weekly on each engine; who gets mentioned / cited
ai_vis = []
weeks = [END - timedelta(7 * w) for w in range(25, -1, -1)]
for wi, wk in enumerate(weeks):
    lift = 1 + .035 * wi  # GEO work pays off slowly
    for eng, base in AI_ENGINES.items():
        for prompt, page in AI_PROMPTS:
            branded = "acme" in prompt
            for b, w in COMPETITORS.items():
                pm = min(.97, (base * lift if b == "Acme Courses" else base * w * 1.15) * (2.8 if branded and b == "Acme Courses" else 1))
                m = rng.random() < pm
                cited = m and rng.random() < (.45 if b == "Acme Courses" else .55)
                ai_vis.append((wk, eng, prompt, page, b, int(m), int(cited)))

# Lighthouse / PageSpeed Insights, monthly, mobile + desktop, 3 key pages (improving after a speed project)
lighthouse = []
for j, m in enumerate(sorted({d.replace(day=1) for d in DAYS})[-12:]):
    t = j / 11
    for page, pen in (("/", 0), ("/free-lesson", 6), ("/offer", 3)):
        for dev, k in (("mobile", 1.0), ("desktop", 0.0)):
            jit = lambda: rng.normal(0, 1.5)
            lighthouse.append((f"{m:%Y-%m}", page, dev,
                               round(min(99, (48 + 23 * t if k else 82 + 11 * t) - pen + jit())),  # performance
                               round(min(100, 86 + 6 * t + jit())), round(min(100, 92 + jit())), round(min(100, 91 + 9 * t)),
                               round(52 + 16 * t - pen / 2 + jit()),  # agentic browsing (audit-seo G1)
                               round((3.6 - .9 * t if k else 1.9 - .5 * t) + pen / 20, 2),  # LCP s (p75 field)
                               round((280 - 90 * t if k else 120 - 30 * t) + pen * 4),  # INP ms
                               round((.14 - .08 * t if k else .05 - .02 * t) + pen / 200, 3)))  # CLS

# GEO readiness checks (audit-seo skill, layer 2: G1-G12) + one added AI-crawler check, for the sandbox site
geo_checks = [
    ("G1", "Agentic browsing score", "fail", "high", "Lighthouse agentic-browsing 0.68, target ≥ 0.70", "Give every button and form field a visible text label; remove the JS-only quiz step.", "/free-lesson"),
    ("G2", "Organization schema", "pass", "critical", "@type Organization with name, url, logo, email", "", "/"),
    ("G3", "Person schema", "fail", "high", "No @type Person for the founder / teachers", "Add Person schema (name, jobTitle, sameAs LinkedIn) on /about and on blog bylines.", "/about"),
    ("G4", "FAQ schema", "fail", "critical", "No @type FAQPage on any money page", "Add FAQPage schema with 5+ real parent questions to /free-lesson and /offer.", "/free-lesson"),
    ("G5", "Article / Service schema", "pass", "high", "BlogPosting on all blog posts", "", "/blog/*"),
    ("G6", "Question-format headers", "pass", "high", "6 H2s phrased as questions on /blog/bilingual-child", "", "/blog/*"),
    ("G7", "Answer blocks", "fail", "medium", "Answers start after long intros (180+ words)", "Put a 40–100 word direct answer right under each question header.", "/blog/best-apps"),
    ("G8", "Entity clarity", "pass", "high", "'Acme Courses' in title, H1 and schema name", "", "/"),
    ("G9", "E-E-A-T signals", "pass", "medium", "About page, author names, 12 years teaching", "", "/"),
    ("G10", "sameAs links", "fail", "medium", "Organization schema has no sameAs", "Add sameAs: LinkedIn, Instagram, YouTube, Trustpilot to the Organization schema.", "/"),
    ("G11", "Topical coverage", "pass", "medium", "Bilingual-child guide covers 5 angles", "", "/blog/*"),
    ("G12", "Citation signals", "fail", "medium", "No original data or sourced statistics", "Publish one original number (e.g. 'parents of 1,200 kids: average 14 min/day') and cite it everywhere.", "/blog/*"),
    ("+1", "AI crawlers allowed", "pass", "critical", "robots.txt allows GPTBot, PerplexityBot, Google-Extended, ClaudeBot", "", "/robots.txt"),
]

months = sorted({d.replace(day=1) for d in DAYS})
sos = [(f"{m:%Y-%m}", b, int(9000 * w * season(m) * (1 + (.006 * j if b == "Acme Courses" else 0))
                              * rng.uniform(.9, 1.1)))
       for j, m in enumerate(months) for b, w in COMPETITORS.items()]

frames = {
    "ad_daily": pd.DataFrame(ads, columns=["date", "platform", "campaign", "funnel", "landing_page", "impressions",
                                           "clicks", "cost", "platform_conversions", "platform_revenue"]),
    "meta_creatives": pd.DataFrame(creative_rows, columns=["date", "campaign", "creative", "format", "impressions",
                                                           "clicks", "cost", "video_3s_views"]),
    "ga4_sessions": pd.DataFrame(sessions, columns=["date", "landing_page", "channel", "campaign", "sessions",
                                                    "add_to_cart", "begin_checkout"]),
    "crm_leads": pd.DataFrame(leads, columns=["lead_id", "created_at", "channel", "campaign", "landing_page",
                                              "qualified", "sequence"]),
    "shop_orders": pd.DataFrame(orders, columns=["created_at", "customer_id", "product", "revenue", "is_renewal",
                                                 "is_new_customer", "channel", "campaign", "creative", "landing_page",
                                                 "lead_date", "coupon"]),
    "creators": pd.DataFrame(CREATORS).drop(columns=["quality"]),
    "creator_content": pd.DataFrame(CONTENT),
    "creator_quotes": pd.DataFrame(QUOTES),
    "partnerships": pd.DataFrame(PARTNERS),
    "ugc_assets": pd.DataFrame(UGC_ASSETS),
    "gsc_queries": pd.DataFrame(gsc, columns=["date", "query", "page", "clicks", "impressions", "position",
                                              "branded"]),
    "share_of_search": pd.DataFrame(sos, columns=["month", "brand", "searches"]),
    "marketing_costs": pd.DataFrame(costs, columns=["date", "category", "amount", "creator"]),
    "ai_visibility": pd.DataFrame(ai_vis, columns=["week", "engine", "prompt", "page", "brand", "mentioned", "cited"]),
    "lighthouse": pd.DataFrame(lighthouse, columns=["month", "page", "device", "performance", "accessibility", "best_practices",
                                                    "seo", "agentic", "lcp_s", "inp_ms", "cls"]),
    "geo_checks": pd.DataFrame(geo_checks, columns=["id", "check", "status", "severity", "found", "fix", "page"]),
    "email_sends": pd.DataFrame(EMAILS).drop(columns=["buy"]),
    "email_flows": pd.DataFrame(FLOW_ROWS).drop(columns=["buy"]),
    "experiments": pd.DataFrame(EXP),
    "targets": pd.DataFrame([("mer", 3.0), ("ncac", 45.0), ("cpl", 6.0), ("attributed_pct", 80.0),
                             ("roas_google_ads", 2.0), ("roas_meta", 1.5), ("qualified_pct", 50.0)],
                            columns=["metric", "target"]),
}
frames["shop_orders"] = frames["shop_orders"].sort_values("created_at").reset_index(drop=True)
frames["shop_orders"].insert(0, "order_id", range(1, len(orders) + 1))

Path("data").mkdir(exist_ok=True)
db = Path("data/marketing.duckdb")
db.unlink(missing_ok=True)
con = duckdb.connect(str(db))
for name, df in frames.items():
    con.register("df", df)
    con.execute(f"create table {name} as select * from df")
    con.unregister("df")
print({k: len(v) for k, v in frames.items()})
