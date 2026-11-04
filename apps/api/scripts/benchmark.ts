import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import express from 'express';
import { hashPin, verifyPin } from '../src/lib/password';

interface Stats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

function calculateStats(latencies: number[]): Stats {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;
  const percentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return sorted[idx]!;
  };

  return {
    count: sorted.length,
    min: Number(sorted[0]!.toFixed(2)),
    max: Number(sorted[sorted.length - 1]!.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    p50: Number(percentile(50).toFixed(2)),
    p95: Number(percentile(95).toFixed(2)),
    p99: Number(percentile(99).toFixed(2)),
  };
}

async function benchmarkSingleOperations() {
  const PIN = '2468';

  // Warmup (10 operations)
  for (let i = 0; i < 10; i++) {
    const h = await hashPin(PIN);
    await verifyPin(PIN, h);
  }

  // Measure hashPin (10 iterations)
  const hashLatencies: number[] = [];
  let sampleHash = '';
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    sampleHash = await hashPin(PIN);
    hashLatencies.push(performance.now() - start);
  }
  const hashStats = calculateStats(hashLatencies);

  // Measure verifyPin (10 iterations)
  const verifyLatencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await verifyPin(PIN, sampleHash);
    verifyLatencies.push(performance.now() - start);
  }
  const verifyStats = calculateStats(verifyLatencies);

  return { hashStats, verifyStats, sampleHash };
}

async function benchmarkConcurrency(sampleHash: string, concurrency: number) {
  const PIN = '2468';
  const opLatencies: number[] = [];

  const startBatch = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const start = performance.now();
      const ok = await verifyPin(PIN, sampleHash);
      if (!ok) throw new Error('PIN verification failed');
      opLatencies.push(performance.now() - start);
    }),
  );
  const totalBatchTime = performance.now() - startBatch;
  const stats = calculateStats(opLatencies);

  return { concurrency, totalBatchTime: Number(totalBatchTime.toFixed(2)), stats };
}

async function benchmarkHealthUnderLoad(sampleHash: string, concurrentOps = 50) {
  // Setup minimal Express app with /health
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid server address');
  const port = address.port;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  // Start Event Loop Delay monitor
  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();

  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const testStartTime = performance.now();

  const healthLatencies: number[] = [];
  let keepPolling = true;

  // Poll /health using 3 concurrent workers in tight keep-alive loops to maximize probe density
  const httpAgent = new http.Agent({ keepAlive: true });
  const NUM_POLLERS = 3;
  const pollerPromises = Array.from({ length: NUM_POLLERS }, async () => {
    while (keepPolling) {
      const reqStart = performance.now();
      await new Promise<void>((resolve) => {
        const req = http.get(healthUrl, { agent: httpAgent }, (res) => {
          res.resume();
          res.on('end', () => {
            if (res.statusCode === 200) {
              healthLatencies.push(performance.now() - reqStart);
            }
            resolve();
          });
        });
        req.on('error', () => resolve());
      });
      await new Promise((r) => setTimeout(r, 2));
    }
  });

  // Trigger concurrent authentication operations
  const authOpLatencies: number[] = [];
  const authBatchStart = performance.now();
  await Promise.all(
    Array.from({ length: concurrentOps }, async () => {
      const opStart = performance.now();
      const ok = await verifyPin('2468', sampleHash);
      if (!ok) throw new Error('PIN verification failed');
      authOpLatencies.push(performance.now() - opStart);
    }),
  );
  const authBatchDuration = performance.now() - authBatchStart;

  // Stop pollers and wait
  keepPolling = false;
  await Promise.all(pollerPromises);

  const testDuration = performance.now() - testStartTime;
  eld.disable();
  const cpuAfter = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();

  server.close();

  const healthStats = calculateStats(healthLatencies);
  const authStats = calculateStats(authOpLatencies);

  const eventLoopStats = {
    min: Number((eld.min / 1e6).toFixed(2)),
    max: Number((eld.max / 1e6).toFixed(2)),
    mean: Number((eld.mean / 1e6).toFixed(2)),
    p50: Number((eld.percentile(50) / 1e6).toFixed(2)),
    p95: Number((eld.percentile(95) / 1e6).toFixed(2)),
    p99: Number((eld.percentile(99) / 1e6).toFixed(2)),
  };

  const cpuStats = {
    userMs: Number((cpuAfter.user / 1000).toFixed(2)),
    systemMs: Number((cpuAfter.system / 1000).toFixed(2)),
    totalMs: Number(((cpuAfter.user + cpuAfter.system) / 1000).toFixed(2)),
  };

  const memStats = {
    heapUsedBeforeMb: Number((memBefore.heapUsed / 1024 / 1024).toFixed(2)),
    heapUsedAfterMb: Number((memAfter.heapUsed / 1024 / 1024).toFixed(2)),
    heapDeltaMb: Number(((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)),
    rssMb: Number((memAfter.rss / 1024 / 1024).toFixed(2)),
  };

  return {
    testDuration: Number(testDuration.toFixed(2)),
    authBatchDuration: Number(authBatchDuration.toFixed(2)),
    healthStats,
    authStats,
    eventLoopStats,
    cpuStats,
    memStats,
  };
}

async function runSingleBenchmarkIteration(iteration: number) {
  console.log(`\n>>> RUN ${iteration} STARTING...`);
  const single = await benchmarkSingleOperations();
  const c10 = await benchmarkConcurrency(single.sampleHash, 10);
  const c25 = await benchmarkConcurrency(single.sampleHash, 25);
  const c50 = await benchmarkConcurrency(single.sampleHash, 50);

  const health10 = await benchmarkHealthUnderLoad(single.sampleHash, 10);
  const health25 = await benchmarkHealthUnderLoad(single.sampleHash, 25);
  const health50 = await benchmarkHealthUnderLoad(single.sampleHash, 50);

  console.log(
    `Run ${iteration}: single verify p50=${single.verifyStats.p50}ms | c10=${c10.totalBatchTime}ms | c25=${c25.totalBatchTime}ms | c50=${c50.totalBatchTime}ms`,
  );
  console.log(
    `Run ${iteration} /health @ c10 (probes=${health10.healthStats.count}): mean=${health10.healthStats.mean}ms | p50=${health10.healthStats.p50}ms | p95=${health10.healthStats.p95}ms | p99=${health10.healthStats.p99}ms | ELD p99=${health10.eventLoopStats.p99}ms`,
  );
  console.log(
    `Run ${iteration} /health @ c25 (probes=${health25.healthStats.count}): mean=${health25.healthStats.mean}ms | p50=${health25.healthStats.p50}ms | p95=${health25.healthStats.p95}ms | p99=${health25.healthStats.p99}ms | ELD p99=${health25.eventLoopStats.p99}ms`,
  );
  console.log(
    `Run ${iteration} /health @ c50 (probes=${health50.healthStats.count}): mean=${health50.healthStats.mean}ms | p50=${health50.healthStats.p50}ms | p95=${health50.healthStats.p95}ms | p99=${health50.healthStats.p99}ms | ELD p99=${health50.eventLoopStats.p99}ms`,
  );

  return {
    run: iteration,
    single: {
      hash: single.hashStats,
      verify: single.verifyStats,
    },
    concurrency: {
      c10,
      c25,
      c50,
    },
    health10,
    health25,
    health50,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const res = sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Number(res.toFixed(2));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

async function main() {
  const isLegacy = process.env.USE_LEGACY_BCRYPT === 'true';
  const engineName = isLegacy ? 'bcryptjs' : '@node-rs/bcrypt';

  // Parse CLI args
  const runsArg = process.argv.find((a) => a.startsWith('--runs='));
  const totalRuns = runsArg ? Math.max(1, parseInt(runsArg.split('=')[1]!, 10)) : 1;

  const saveJsonArg = process.argv.find((a) => a.startsWith('--save-json='));
  const saveJsonPath = saveJsonArg ? saveJsonArg.split('=')[1] : null;

  console.log('================================================================');
  console.log(`SSE CONNECT+ PASSWORD HASHING BENCHMARK (${engineName.toUpperCase()})`);
  console.log('================================================================');
  console.log(`Timestamp:         ${new Date().toISOString()}`);
  console.log(`Engine:            ${engineName}`);
  console.log(`USE_LEGACY_BCRYPT: ${process.env.USE_LEGACY_BCRYPT || 'false'}`);
  console.log(`Node.js Version:   ${process.version}`);
  console.log(`Platform / Arch:   ${process.platform} / ${process.arch}`);
  console.log(`Logical CPUs:      ${os.cpus().length}`);
  console.log(`System Memory:     ${(os.totalmem() / 1024 / 1024).toFixed(0)}MB`);
  console.log(`Process PID:       ${process.pid}`);
  console.log(`Total Runs:        ${totalRuns}`);

  const runResults: Array<Awaited<ReturnType<typeof runSingleBenchmarkIteration>>> = [];
  for (let r = 1; r <= totalRuns; r++) {
    const res = await runSingleBenchmarkIteration(r);
    runResults.push(res);
  }

  // Aggregate stats across runs
  const aggregateHealthTier = (tier: 'health10' | 'health25' | 'health50') => ({
    probesCountMedian: median(runResults.map((r) => r[tier].healthStats.count)),
    meanP50: mean(runResults.map((r) => r[tier].healthStats.p50)),
    medianP50: median(runResults.map((r) => r[tier].healthStats.p50)),
    meanP95: mean(runResults.map((r) => r[tier].healthStats.p95)),
    medianP95: median(runResults.map((r) => r[tier].healthStats.p95)),
    meanP99: mean(runResults.map((r) => r[tier].healthStats.p99)),
    medianP99: median(runResults.map((r) => r[tier].healthStats.p99)),
    eldMeanAvg: mean(runResults.map((r) => r[tier].eventLoopStats.mean)),
    eldMedianP99: median(runResults.map((r) => r[tier].eventLoopStats.p99)),
  });

  const aggregate = {
    runsCount: totalRuns,
    singleHash: {
      meanP50: mean(runResults.map((r) => r.single.hash.p50)),
      medianP50: median(runResults.map((r) => r.single.hash.p50)),
      meanP95: mean(runResults.map((r) => r.single.hash.p95)),
    },
    singleVerify: {
      meanP50: mean(runResults.map((r) => r.single.verify.p50)),
      medianP50: median(runResults.map((r) => r.single.verify.p50)),
      meanP95: mean(runResults.map((r) => r.single.verify.p95)),
    },
    c10BatchTimeMs: {
      mean: mean(runResults.map((r) => r.concurrency.c10.totalBatchTime)),
      median: median(runResults.map((r) => r.concurrency.c10.totalBatchTime)),
    },
    c25BatchTimeMs: {
      mean: mean(runResults.map((r) => r.concurrency.c25.totalBatchTime)),
      median: median(runResults.map((r) => r.concurrency.c25.totalBatchTime)),
    },
    c50BatchTimeMs: {
      mean: mean(runResults.map((r) => r.concurrency.c50.totalBatchTime)),
      median: median(runResults.map((r) => r.concurrency.c50.totalBatchTime)),
    },
    health10: aggregateHealthTier('health10'),
    health25: aggregateHealthTier('health25'),
    health50: aggregateHealthTier('health50'),
  };

  const finalPayload = {
    timestamp: new Date().toISOString(),
    engine: engineName,
    isLegacy,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemoryMb: Number((os.totalmem() / 1024 / 1024).toFixed(0)),
      uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE || 'default (4)',
    },
    aggregate,
    runs: runResults,
  };

  console.log('\n================================================================');
  console.log('FINAL AGGREGATED SUMMARY:');
  console.log(`Runs:                          ${totalRuns}`);
  console.log(`Single verifyPin (p50 median): ${aggregate.singleVerify.medianP50}ms`);
  console.log(`Concurrency 10 Batch (median): ${aggregate.c10BatchTimeMs.median}ms`);
  console.log(`Concurrency 25 Batch (median): ${aggregate.c25BatchTimeMs.median}ms`);
  console.log(`Concurrency 50 Batch (median): ${aggregate.c50BatchTimeMs.median}ms`);
  console.log('----------------------------------------------------------------');
  console.log(`/health under 10 concurrent auth ops:`);
  console.log(`  Probes Handled (median):     ${aggregate.health10.probesCountMedian}`);
  console.log(`  Latency p95 (median):        ${aggregate.health10.medianP95}ms`);
  console.log(`  Latency p99 (median):        ${aggregate.health10.medianP99}ms`);
  console.log(`  Event Loop Delay p99 (median): ${aggregate.health10.eldMedianP99}ms`);
  console.log(`  SLA Target (p99 <= 30ms):    ${aggregate.health10.medianP99 <= 30 ? 'PASS' : 'FAIL'}`);
  console.log('----------------------------------------------------------------');
  console.log(`/health under 25 concurrent auth ops:`);
  console.log(`  Probes Handled (median):     ${aggregate.health25.probesCountMedian}`);
  console.log(`  Latency p95 (median):        ${aggregate.health25.medianP95}ms`);
  console.log(`  Latency p99 (median):        ${aggregate.health25.medianP99}ms`);
  console.log(`  Event Loop Delay p99 (median): ${aggregate.health25.eldMedianP99}ms`);
  console.log(`  SLA Target (p99 <= 30ms):    ${aggregate.health25.medianP99 <= 30 ? 'PASS' : 'FAIL'}`);
  console.log('----------------------------------------------------------------');
  console.log(`/health under 50 concurrent auth ops (Stress Test):`);
  console.log(`  Probes Handled (median):     ${aggregate.health50.probesCountMedian}`);
  console.log(`  Latency p95 (median):        ${aggregate.health50.medianP95}ms`);
  console.log(`  Latency p99 (median):        ${aggregate.health50.medianP99}ms`);
  console.log(`  Event Loop Delay p99 (median): ${aggregate.health50.eldMedianP99}ms`);
  console.log(`  SLA Target (p99 <= 30ms):    ${aggregate.health50.medianP99 <= 30 ? 'PASS' : 'FAIL (CPU saturation under 2-CPU constraint)'}`);
  console.log('================================================================');

  console.log('\nRAW_JSON_START');
  console.log(JSON.stringify(finalPayload, null, 2));
  console.log('RAW_JSON_END');

  if (saveJsonPath) {
    fs.writeFileSync(saveJsonPath, JSON.stringify(finalPayload, null, 2));
    console.log(`Successfully saved benchmark JSON to ${saveJsonPath}`);
  }
}

main().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
