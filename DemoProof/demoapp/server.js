// server.js — demo-app with real CPU/MEM/IO work and TTL caches

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// -------------------------------------------------------------------------------------
// CONFIG (env tunables)
// -------------------------------------------------------------------------------------

// Process placement info (for logs)
const REPLICA_ID = process.env.HOSTNAME || 'local';
const SHARD_ID   = process.env.SHARD_ID || 'baseline';

// HTTP
const PORT = parseInt(process.env.PORT || '8080', 10);

// Cache TTL (seconds) and per-cache entry caps (simple LRU-ish)
const CACHE_TTL_SEC   = parseInt(process.env.CACHE_TTL_SEC || '1800', 10); // 30m
const AUTH_CACHE_CAP  = parseInt(process.env.AUTH_CACHE_CAP || '2000', 10);
const FEAT_CACHE_CAP  = parseInt(process.env.FEAT_CACHE_CAP || '300', 10);
const DOC_CACHE_CAP   = parseInt(process.env.DOC_CACHE_CAP  || '1000', 10);

// Real work knobs
// CPU: number of pbkdf2Sync batches; higher = more CPU time (roughly linear)
const AUTH_ITER = parseInt(process.env.AUTH_ITER || '180000', 10);

// MEM: bytes to allocate & touch for a feature vector on cache miss
const FEAT_BYTES = parseInt(process.env.FEAT_BYTES || String(200 * 1024 * 1024), 10); // 200 MB

// IO: where the JSON documents live (PVC mount)
const DOC_DIR = process.env.DOC_DIR || '/data/docs';

// -------------------------------------------------------------------------------------
// Simple TTL cache (Map with eviction of oldest when above cap)
// -------------------------------------------------------------------------------------

function nowMs() { return Date.now(); }
const TTL_MS = CACHE_TTL_SEC * 1000;

class TtlCache {
  constructor(capacity) {
    this.m = new Map();     // key -> { t, v }
    this.capacity = capacity;
  }
  get(key) {
    const e = this.m.get(key);
    if (!e) return null;
    if (nowMs() - e.t > TTL_MS) { this.m.delete(key); return null; }
    return e.v;
  }
  set(key, val) {
    // If exists, delete to update recency ordering
    if (this.m.has(key)) this.m.delete(key);
    this.m.set(key, { t: nowMs(), v: val });
    // Evict oldest if over capacity
    while (this.m.size > this.capacity) {
      const first = this.m.keys().next().value;
      this.m.delete(first);
    }
  }
  size() { return this.m.size; }
}

const cacheAuth = new TtlCache(AUTH_CACHE_CAP);
const cacheFeat = new TtlCache(FEAT_CACHE_CAP);
const cacheDoc  = new TtlCache(DOC_CACHE_CAP);

// -------------------------------------------------------------------------------------
// Real work implementations
// -------------------------------------------------------------------------------------

// CPU work: repeated key derivations
function doCPUWork(iter) {
  // Each pbkdf2Sync call burns CPU for a few ms depending on node size.
  // We batch in chunks to avoid huge single-call costs.
  const chunk = 4000;
  for (let i = 0; i < iter; i += chunk) {
    crypto.pbkdf2Sync('pw' + i, 'salt', 5000, 32, 'sha512');
  }
}

// MEM work: allocate and touch a buffer to force physical pages/bandwidth
function makeFeatureVector(bytes) {
  const buf = Buffer.allocUnsafe(bytes);
  for (let i = 0; i < buf.length; i += 4096) buf[i] = (buf[i] + i) & 0xff;
  return buf;
}

// IO work: read & parse a JSON document from DOC_DIR (PVC)
function loadAndParseDoc(docId) {
  const id = normalizeDocId(docId);
  const file = path.join(DOC_DIR, `${id}.json`);
  const data = fs.readFileSync(file);
  return JSON.parse(data.toString());
}

// -------------------------------------------------------------------------------------
// Logging (JSON line per request, ready for jq/analysis)
// -------------------------------------------------------------------------------------

function logLine(endpoint, user_or_key, cache_hit, latency_ms) {
  const rec = {
    ts: new Date().toISOString(),
    endpoint,
    user_id: user_or_key, // for features we log "user:model"
    cache_hit,
    latency_ms,
    shard_id: SHARD_ID,
    replica_id: REPLICA_ID
  };
  // one JSON per line
  console.log(JSON.stringify(rec));
}

function normalizeDocId(raw) {
  // ensure filenames like "d186.json" regardless of input "186", "D186", "d186"
  const s = String(raw || '').trim();
  const digits = (s.match(/\d+/) || ['0'])[0];
  return 'd' + digits;                 // always lower-case 'd'
}

// -------------------------------------------------------------------------------------
// App
// -------------------------------------------------------------------------------------

const app = express();

// Health and readiness
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/ready',   (_req, res) => res.status(200).send('ok'));

// CPU path: /auth?user_id=u123
app.get('/auth', (req, res) => {
  const uid = req.query.user_id || 'u0';
  const hit = !!cacheAuth.get(uid);
  const t0 = nowMs();
  if (!hit) {
    doCPUWork(AUTH_ITER);
    cacheAuth.set(uid, 1);
  }
  const latency = nowMs() - t0;
  logLine('auth', uid, hit, latency);
  res.json({ ok: true, cache_hit: hit, latency_ms: latency });
});

// MEM path: /features?user_id=u123&model_version=v1
app.get('/features', (req, res) => {
  const uid = req.query.user_id || 'u0';
  const mv  = req.query.model_version || 'v1';
  const key = `${uid}:${mv}`;
  let vec = cacheFeat.get(key);
  const hit = !!vec;
  const t0 = nowMs();
  if (!hit) {
    vec = makeFeatureVector(FEAT_BYTES);
    cacheFeat.set(key, vec);
  } else {
    // light touch to simulate reuse
    vec[0] ^= 0x1;
  }
  const latency = nowMs() - t0;
  logLine('features', key, hit, latency);
  res.json({ ok: true, cache_hit: hit, latency_ms: latency });
});

/// In your /document handler, wrap in try/catch:
app.get('/document', (req, res) => {
  const raw = req.query.document_id || '0';
  const key = normalizeDocId(raw);
  let parsed = cacheDoc.get(key);
  const hit = !!parsed;
  const t0 = nowMs();
  if (!hit) {
    try {
      parsed = loadAndParseDoc(key);
      cacheDoc.set(key, parsed);
    } catch (e) {
      // Graceful error (don’t crash pod)
      const latency = nowMs() - t0;
      logLine('document', key, false, latency);
      return res.status(404).json({ ok: false, error: 'doc_not_found', id: key });
    }
  }
  const latency = nowMs() - t0;
  logLine('document', key, hit, latency);
  res.json({ ok: true, cache_hit: hit, latency_ms: latency });
});

// Startup banner (proves envs were read)
console.log(JSON.stringify({
  boot_cfg: {
    SHARD_ID, REPLICA_ID, PORT,
    CACHE_TTL_SEC, AUTH_CACHE_CAP, FEAT_CACHE_CAP, DOC_CACHE_CAP,
    AUTH_ITER, FEAT_BYTES, DOC_DIR
  }
}));

app.listen(PORT, () => {
  console.log(`demo-app listening on :${PORT}`);
});
