const express = require('express');
const os = require('os');

const app = express();
app.use(express.json());

const REPLICA_ID = process.env.REPLICA_ID || os.hostname();
const SHARD_ID   = process.env.SHARD_ID   || 'baseline'; // set cpu|mem|io in policy

const AUTH_COLD_MS = parseInt(process.env.AUTH_COLD_MS || '300');
const FEAT_COLD_MS = parseInt(process.env.FEAT_COLD_MS || '600');
const DOC_COLD_MS  = parseInt(process.env.DOC_COLD_MS  || '900');
const HIT_MS_AUTH  = parseInt(process.env.HIT_MS_AUTH  || '2');
const HIT_MS_FEAT  = parseInt(process.env.HIT_MS_FEAT  || '3');
const HIT_MS_DOC   = parseInt(process.env.HIT_MS_DOC   || '4');
const CACHE_TTL_MS = (process.env.CACHE_TTL_SEC ? parseInt(process.env.CACHE_TTL_SEC) : 1800) * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Simple in-process caches
const cacheAuth     = new Map(); // key: user_id
const cacheFeatures = new Map(); // key: user_id|model_version
const cacheDocument = new Map(); // key: document_id

function now() { return new Date().toISOString(); }
function getUserId(req) { return req.query.user_id || 'u0'; }
function getModelVer(req) { return req.query.model_version || 'm1'; }
function getDocId(req) { return req.query.document_id || 'd0'; }



function getOrSet(cache, key, coldMs) {
  const now = Date.now();
  const ent = cache.get(key);
  if (ent && (now - ent.t) < CACHE_TTL_MS) {
    return { hit: true, costMs: 0 };
  }
  // MISS: set and return cold cost
  cache.set(key, { t: now });
  return { hit: false, costMs: coldMs };
}

async function handle(endpoint, workMs) {
  // latency = workMs if miss; 1-3ms if hit (simulated)
  await sleep(workMs);
  return workMs;
}

app.get('/healthz', (_, res) => res.status(200).send('ok'));

// /auth
app.get('/auth', async (req, res) => {
  const user_id = req.query.user_id || 'u0';
  const { hit, costMs } = getOrSet(cacheAuth, user_id, AUTH_COLD_MS);
  const latency = hit ? HIT_MS_AUTH : costMs;
  await sleep(latency);
  logAndSend('auth', user_id, hit, latency);
});

// /features
app.get('/features', async (req, res) => {
  const key = `${req.query.user_id || 'u0'}:${req.query.model_version || 'v1'}`;
  const { hit, costMs } = getOrSet(cacheFeatures, key, FEAT_COLD_MS);
  const latency = hit ? HIT_MS_FEAT : costMs;
  await sleep(latency);
  logAndSend('features', key, hit, latency);
});

// /document
app.get('/document', async (req, res) => {
  const doc_id = req.query.document_id || 'd0';
  const { hit, costMs } = getOrSet(cacheDocument, doc_id, DOC_COLD_MS);
  const latency = hit ? HIT_MS_DOC : costMs;
  await sleep(latency);
  logAndSend('document', doc_id, hit, latency);
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`demo-app on ${port}`));
console.log(JSON.stringify({
  boot_cfg: { AUTH_COLD_MS, FEAT_COLD_MS, DOC_COLD_MS, HIT_MS_AUTH, HIT_MS_FEAT, HIT_MS_DOC, CACHE_TTL_MS }
}));
