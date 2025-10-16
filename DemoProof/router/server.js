const express = require('express');
const httpProxy = require('http'); // simple request forwarder
const os = require('os');

const app = express();

const BETA_LOAD = parseFloat(process.env.BETA_LOAD || '1.0');
const GAMMA_LOC = parseFloat(process.env.GAMMA_LOCALITY || '0.5');
const T_CPU = parseFloat(process.env.T_CPU || '0.80');
const T_MEM = parseFloat(process.env.T_MEM || '0.80');
const T_IO  = parseFloat(process.env.T_IO  || '0.80');
const W = parseInt(process.env.W || '90');              // hysteresis window sec
const TAU = parseFloat(process.env.TAU || '0.10');      // equivalence margin
const TTL = parseInt(process.env.STICKY_TTL || '1200'); // sec
const F = parseInt(process.env.F || '20');              // telemetry refresh sec

// Shard backends (Services) – injected via env
const CPU_BACKEND = process.env.CPU_SVC || 'http://cpu-shard:8080';
const MEM_BACKEND = process.env.MEM_SVC || 'http://mem-shard:8080';
const IO_BACKEND  = process.env.IO_SVC  || 'http://io-shard:8080';

// Demand vectors
const R = {
  auth:     [0.80, 0.15, 0.05],
  features: [0.15, 0.80, 0.05],
  document: [0.15, 0.25, 0.60]
};

// Per-shard utilization U = [u_cpu, u_mem, u_io] (EWMA)
const U = {
  cpu: [0.10, 0.05, 0.05],
  mem: [0.05, 0.10, 0.05],
  io:  [0.05, 0.05, 0.10]
};

const DOM_THRESH = {cpu: T_CPU, mem: T_MEM, io: T_IO};
const BACKENDS = { cpu: CPU_BACKEND, mem: MEM_BACKEND, io: IO_BACKEND };
const REPLICAS = { cpu: [], mem: [], io: [] }; // We'll just treat Services as L4 and rely on sticky cookie at ingress + stickiness in router to choose shard; "replica" is logical here.

const stickyMap = new Map(); // key -> { shard, replica, ts }
const lastSeenLocality = new Map(); // key -> preferred shard (locality hint)

// helper
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function now(){return Date.now();}
function iso(){return new Date().toISOString();}
function typeFromPath(p){
  if (p.startsWith('/auth')) return 'auth';
  if (p.startsWith('/features')) return 'features';
  if (p.startsWith('/document')) return 'document';
  return 'auth';
}
function dominantIndex(r){ // 0=cpu,1=mem,2=io
  if (r[0]>=r[1] && r[0]>=r[2]) return 0;
  if (r[1]>=r[0] && r[1]>=r[2]) return 1;
  return 2;
}
function domName(i){return ['cpu','mem','io'][i];}

// Simple EWMA update on completion
function updateU(shard, r, latencyMs){
  const k = 0.04; // EWMA constant
  // approximate resource usage scaled from latency; sufficient for test signal
  const use = [r[0], r[1], r[2]].map(x => Math.min(0.99, x * (latencyMs/120)));
  for (let i=0;i<3;i++){
    U[shard][i] = (1-k)*U[shard][i] + k*use[i];
  }
}

function chooseShard(endpoint, key){
  const r = R[endpoint];
  const localityShard = lastSeenLocality.get(key);
  const localityScore = {cpu:0, mem:0, io:0};
  if (localityShard && localityScore.hasOwnProperty(localityShard)) {
    localityScore[localityShard] = 1.0; // cheap locality bonus
  }
  const scores = ['cpu','mem','io'].map(s => {
    const L = dot(r, U[s]);
    const score = BETA_LOAD * L + GAMMA_LOC * (localityScore[s] || 0);
    return {shard:s, L, score};
  });
  // pick lowest score (least cost)
  scores.sort((a,b)=>a.score-b.score);
  return scores[0]; // { shard, L, score }
}

function canStaySticky(endpoint, sticky){
  const r = R[endpoint];
  const d = dominantIndex(r);
  const dom = domName(d); // 'cpu'|'mem'|'io'
  const u_dom = U[sticky.shard][d];
  const thr = DOM_THRESH[dom];
  // stay if utilization under threshold + TAU window
  return u_dom <= (thr + TAU);
}

function forward(req, res, target){
  const url = new URL(req.url, target);
  const opts = {
    method: req.method,
    headers: req.headers
  };
  const outReq = httpProxy.request(url, opts, (proxyRes)=>{
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, {end:true});
  });
  req.pipe(outReq, {end:true});
  outReq.on('error', (e)=>{
    res.statusCode = 502; res.end('router error');
  });
}

app.get('/healthz', (_, res) => res.status(200).send('ok'));

app.use(async (req, res) => {
  try {
    const endpoint = typeFromPath(req.path || req.url);
    const key = (req.query.user_id || 'u0');
    const sticky = stickyMap.get(key);
    let chosen = null;
    let sticky_used = false;
    let diverted = false;

    if (sticky && (now() - sticky.ts) < TTL*1000 && canStaySticky(endpoint, sticky)) {
      chosen = { shard: sticky.shard, L: dot(R[endpoint], U[sticky.shard]), score: 0 };
      sticky_used = true;
    } else {
      chosen = chooseShard(endpoint, key);
      if (sticky && sticky.shard !== chosen.shard) diverted = true;
      stickyMap.set(key, {shard: chosen.shard, replica: 'svc', ts: now()});
    }

    // record locality
    lastSeenLocality.set(key, chosen.shard);

    const start = Date.now();
    res.on('finish', ()=>{
      const latency = Date.now() - start;
      updateU(chosen.shard, R[endpoint], latency);
      // decision log
      const locality = (lastSeenLocality.get(key) === chosen.shard) ? 1.0 : 0.0;
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        endpoint, user_id: key,
        selected_shard: chosen.shard,
        selected_replica: 'svc',
        L: chosen.L,
        locality,
        score: chosen.score,
        sticky_used,
        diverted
      }));
    });

    forward(req, res, BACKENDS[chosen.shard]);
  } catch(e){
    res.statusCode = 500; res.end('router exception');
  }
});

const port = process.env.PORT || 8081;
app.listen(port, ()=> console.log(`router on ${port}`));
