import json, statistics, sys
from collections import defaultdict

# Usage: python analyze.py baseline.jsonl policy_app.jsonl policy_router.jsonl

def pctl(xs, p):
    if not xs: return None
    xs = sorted(xs)
    k = (len(xs)-1) * (p/100.0)
    f = int(k)
    c = min(f+1, len(xs)-1)
    if f == c: return xs[f]
    return xs[f] + (xs[c]-xs[f]) * (k-f)

def load_jsonl(path):
    rows = []
    with open(path, 'r', encoding='utf-8') as f:
      for line in f:
        line=line.strip()
        if not line: continue
        try:
          rows.append(json.loads(line))
        except:
          pass
    return rows

def summarize_app(rows, label):
    # rows: {ts, endpoint, user_id, cache_hit, latency_ms, shard_id, replica_id}
    by_ep = defaultdict(list)
    hits = defaultdict(int)
    total = defaultdict(int)
    errors = defaultdict(int)
    for r in rows:
        ep = r.get('endpoint','unknown')
        if 'latency_ms' in r:
            by_ep[ep].append(r['latency_ms'])
        if r.get('cache_hit') is True: hits[ep] += 1
        total[ep] += 1
        # No explicit error field; if needed, detect by absence of latency
        if 'latency_ms' not in r: errors[ep] += 1

    out = {}
    for ep, lat in by_ep.items():
        out[ep] = {
            'p50': pctl(lat, 50),
            'p95': pctl(lat, 95),
            'hit_ratio': (hits[ep]/total[ep]) if total[ep] else 0.0,
            'count': total[ep],
            'errors': errors[ep]
        }
    return out

def summarize_router(rows):
    # rows: {endpoint, selected_shard, L, locality, score, sticky_used, diverted}
    by_ep = defaultdict(lambda: {'diverted':0,'total':0})
    # Shard balance: stddev of r·U (we approximate using L values per selected shard/replica)
    # During steady window only: filter by ts minutes 2..12? For simplicity, include all and note phases filtered upstream if needed.
    L_by_shard = defaultdict(list)

    for r in rows:
        ep = r.get('endpoint','unknown')
        by_ep[ep]['total'] += 1
        if r.get('diverted'): by_ep[ep]['diverted'] += 1
        L = r.get('L')
        shard = r.get('selected_shard')
        if L is not None and shard:
            L_by_shard[shard].append(float(L))

    div_rates = { ep: (v['diverted']/v['total'] if v['total'] else 0.0) for ep,v in by_ep.items() }
    # stddev per shard
    shard_stddev = {}
    for shard, vals in L_by_shard.items():
        if len(vals)>=2:
            shard_stddev[shard] = statistics.pstdev(vals)
        else:
            shard_stddev[shard] = 0.0
    return div_rates, shard_stddev

def compare(baseline, policy, div_rates, shard_stddev):
    endpoints = sorted(set(list(baseline.keys()) + list(policy.keys())))
    print("\n=== HEADLINE METRICS ===")
    print(f"{'Endpoint':<10} {'Base_P95':>10} {'Policy_P95':>12} {'Δ%':>7} {'Base_Hit':>10} {'Policy_Hit':>11} {'xHit':>6} {'DivRate':>8}")
    for ep in endpoints:
        b = baseline.get(ep, {})
        p = policy.get(ep, {})
        base_p95 = b.get('p95'); pol_p95 = p.get('p95')
        base_hit = b.get('hit_ratio',0.0); pol_hit = p.get('hit_ratio',0.0)
        delta = None
        if base_p95 and pol_p95:
            delta = (pol_p95 - base_p95) / base_p95 * 100.0
        xhit = (pol_hit/base_hit) if base_hit else None
        div = div_rates.get(ep, 0.0)
        print(f"{ep:<10} {base_p95 if base_p95 is not None else '-':>10} {pol_p95 if pol_p95 is not None else '-':>12} "
              f"{(round(delta,1) if delta is not None else '-'):>7} {round(base_hit,3):>10} {round(pol_hit,3):>11} "
              f"{(round(xhit,2) if xhit is not None else '-'):>6} {round(div,3):>8}")
    print("\nShard balance (stddev of r·U proxy L) – lower is better:\n", shard_stddev)

def main():
    if len(sys.argv)<4:
      print("Usage: python analyze.py baseline.jsonl policy_app.jsonl policy_router.jsonl")
      sys.exit(1)
    base = load_jsonl(sys.argv[1])
    polA = load_jsonl(sys.argv[2])
    polR = load_jsonl(sys.argv[3])

    baseSum = summarize_app(base, 'baseline')
    polSum  = summarize_app(polA, 'policy')
    div_rates, shard_stddev = summarize_router(polR)
    compare(baseSum, polSum, div_rates, shard_stddev)

    # Success criteria checks
    targets = {
      'auth':     {'p95_impr': 40, 'xhit': 2.0},
      'features': {'p95_impr': 50, 'xhit': 2.5},
      'document': {'p95_impr': 35, 'xhit': 2.0},
    }
    print("\n=== CRITERIA ===")
    ok_all = True
    for ep, t in targets.items():
      b = baseSum.get(ep, {}); p = polSum.get(ep, {})
      if not b or not p or (b.get('p95') is None) or (p.get('p95') is None):
        print(f"{ep}: insufficient data"); ok_all=False; continue
      impr = (b['p95'] - p['p95'])/b['p95']*100.0
      xhit = (p['hit_ratio']/b['hit_ratio']) if b['hit_ratio'] else None
      ok_p95 = (impr >= t['p95_impr'])
      ok_hit = (xhit is not None and xhit >= t['xhit'])
      print(f"{ep}: P95_impr={round(impr,1)}% (>= {t['p95_impr']}%) -> {'OK' if ok_p95 else 'FAIL'}, "
            f"xHit={round(xhit,2) if xhit is not None else '-'} (>= {t['xhit']}) -> {'OK' if ok_hit else 'FAIL'}")
      ok_all = ok_all and ok_p95 and ok_hit

    # diversion rate (steady-phase-only would be better; here overall proxy)
    overall_div = sum(polR[i].get('diverted',False) for i in range(len(polR))) / (len(polR) if polR else 1)
    print(f"\nDiversion rate (overall proxy): {round(overall_div,3)} (target < 0.10) -> {'OK' if overall_div<0.10 else 'FAIL'}")

    if ok_all and overall_div<0.10:
      print("\nRESULT: ✅ Success criteria met (check shard stddev & any hot pod durations separately).")
    else:
      print("\nRESULT: ❌ One or more criteria not met. Inspect per-endpoint stats & router tuning.")
if __name__ == "__main__":
    main()
