const express = require('express');
const os = require('os');

const app = express();
app.use(express.json());

const REPLICA_ID = process.env.REPLICA_ID || os.hostname();
const SHARD_ID   = process.env.SHARD_ID   || 'baseline'; // set cpu|mem|io in policy
const CACHE_TTL_MS = (process.env.CACHE_TTL_SEC ? parseInt(process.env.CACHE_TTL_SEC) : 600) * 1000;

// Simple in-process caches
const cacheAuth     = new Map(); // key: user_id
const cacheFeatures = new Map(); // key: user_id|model_version
const cacheDocument = new Map(); // key: document_id

function now() { return new Date().toISOString(); }
function getUserId(req) { return req.query.user_id || 'u0'; }
function getModelVer(req) { return req.query.model_version || 'm1'; }
function getDocId(req) { return req.query.document_id || 'd0'; }

function getOrSet(cache, key, buildMs) {
  const entry = cache.get(key);
  const t = Date.now();
  if (entry && (t - entry.t < CACHE_TTL_MS)) {
    return {hit: true, costMs: 1}; // cheap hit
  }
  // simulate heavy work
  return {hit: false, costMs: buildMs};
}

// small helper to simulate work
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function handle(endpoint, workMs) {
  // latency = workMs if miss; 1-3ms if hit (simulated)
  await sleep(workMs);
  return workMs;
}

app.get('/healthz', (_, res) => res.status(200).send('ok'));

app.get('/auth', async (req, res) => {
  const user_id = getUserId(req);
  const {hit, costMs} = getOrSet(cacheAuth, user_id, 30); // ~30ms on cold
  if (!hit) cacheAuth.set(user_id, {t: Date.now()});
  const latency = await handle('auth', hit ? 2 : costMs);
  console.log(JSON.stringify({ts: now(), endpoint:'auth', user_id, cache_hit: hit, latency_ms: latency, shard_id: SHARD_ID, replica_id: REPLICA_ID}));
  res.json({ok:true});
});

app.get('/features', async (req, res) => {
  const user_id = getUserId(req);
  const key = `${user_id}|${getModelVer(req)}`;
  const {hit, costMs} = getOrSet(cacheFeatures, key, 80); // ~80ms on cold
  if (!hit) cacheFeatures.set(key, {t: Date.now()});
  const latency = await handle('features', hit ? 3 : costMs);
  console.log(JSON.stringify({ts: now(), endpoint:'features', user_id, cache_hit: hit, latency_ms: latency, shard_id: SHARD_ID, replica_id: REPLICA_ID}));
  res.json({ok:true});
});

app.get('/document', async (req, res) => {
  const doc_id = getDocId(req);
  const {hit, costMs} = getOrSet(cacheDocument, doc_id, 120); // IO-ish cold path
  if (!hit) cacheDocument.set(doc_id, {t: Date.now()});
  const latency = await handle('document', hit ? 4 : costMs);
  console.log(JSON.stringify({ts: now(), endpoint:'document', user_id: getUserId(req), cache_hit: hit, latency_ms: latency, shard_id: SHARD_ID, replica_id: REPLICA_ID}));
  res.json({ok:true});
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`demo-app on ${port}`));
