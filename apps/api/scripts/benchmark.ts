import http from 'node:http';
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
  console.log('\n--- 1. Single-Operation Latency (10 iterations) ---');
  const PIN = '2468';

  // Warmup
  const warmHash = await hashPin(PIN);
  await verifyPin(PIN, warmHash);

  // Measure hashPin
  const hashLatencies: number[] = [];
  let sampleHash = '';
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    sampleHash = await hashPin(PIN);
    hashLatencies.push(performance.now() - start);
  }
  const hashStats = calculateStats(hashLatencies);
  console.log(`hashPin:   mean=${hashStats.mean}ms | p50=${hashStats.p50}ms | p95=${hashStats.p95}ms | p99=${hashStats.p99}ms | min=${hashStats.min}ms | max=${hashStats.max}ms`);

  // Measure verifyPin
  const verifyLatencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await verifyPin(PIN, sampleHash);
    verifyLatencies.push(performance.now() - start);
  }
  const verifyStats = calculateStats(verifyLatencies);
  console.log(`verifyPin: mean=${verifyStats.mean}ms | p50=${verifyStats.p50}ms | p95=${verifyStats.p95}ms | p99=${verifyStats.p99}ms | min=${verifyStats.min}ms | max=${verifyStats.max}ms`);

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

  console.log(
    `Concurrency ${concurrency.toString().padStart(2, ' ')}: batch=${totalBatchTime.toFixed(
      2,
    )}ms | per-op mean=${stats.mean}ms | p50=${stats.p50}ms | p95=${stats.p95}ms | p99=${stats.p99}ms | min=${stats.min}ms | max=${stats.max}ms`,
  );

  return { concurrency, totalBatchTime: Number(totalBatchTime.toFixed(2)), stats };
}

async function benchmarkHealthUnderLoad(sampleHash: string, concurrentOps = 50) {
  console.log(`\n--- 3. /health Latency During ${concurrentOps} Concurrent Authentication Operations ---`);

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

  // Poll /health sequentially in a tight loop with keep-alive agent
  const httpAgent = new http.Agent({ keepAlive: true });
  const pollerPromise = (async () => {
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
      await new Promise((r) => setTimeout(r, 10));
    }
  })();

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

  // Stop poller and wait
  keepPolling = false;
  await pollerPromise;

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

  console.log(`Test Duration:           ${testDuration.toFixed(2)}ms`);
  console.log(`Auth Batch (50 ops):     ${authBatchDuration.toFixed(2)}ms (per-op mean=${authStats.mean}ms)`);
  console.log(`Total /health requests:  ${healthStats.count}`);
  console.log(
    `/health Latency:         mean=${healthStats.mean}ms | p50=${healthStats.p50}ms | p95=${healthStats.p95}ms | p99=${healthStats.p99}ms | max=${healthStats.max}ms`,
  );
  console.log(
    `Event Loop Delay:        mean=${eventLoopStats.mean}ms | p50=${eventLoopStats.p50}ms | p95=${eventLoopStats.p95}ms | p99=${eventLoopStats.p99}ms | max=${eventLoopStats.max}ms`,
  );
  console.log(
    `CPU Usage:               user=${cpuStats.userMs}ms | system=${cpuStats.systemMs}ms | total=${cpuStats.totalMs}ms`,
  );
  console.log(
    `Memory (Heap):           before=${memStats.heapUsedBeforeMb}MB | after=${memStats.heapUsedAfterMb}MB | delta=${memStats.heapDeltaMb}MB | RSS=${memStats.rssMb}MB`,
  );
  console.log(
    `Acceptance check (health p99 <= 30ms): ${
      healthStats.p99 <= 30 ? 'PASS (<= 30ms)' : `FAIL (${healthStats.p99}ms > 30ms)`
    }`,
  );

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

async function main() {
  console.log('================================================================');
  console.log('SSE CONNECT+ PASSWORD HASHING BENCHMARK');
  console.log('================================================================');
  console.log(`Timestamp:        ${new Date().toISOString()}`);
  console.log(`Node.js Version:  ${process.version}`);
  console.log(`Platform / Arch:  ${process.platform} / ${process.arch}`);
  console.log(`Process PID:      ${process.pid}`);
  console.log(`UV_THREADPOOL:    ${process.env.UV_THREADPOOL_SIZE || '(default)'}`);

  const single = await benchmarkSingleOperations();

  console.log('\n--- 2. Concurrent Authentication Operations (10, 25, 50) ---');
  const c10 = await benchmarkConcurrency(single.sampleHash, 10);
  const c25 = await benchmarkConcurrency(single.sampleHash, 25);
  const c50 = await benchmarkConcurrency(single.sampleHash, 50);

  const healthUnderLoad = await benchmarkHealthUnderLoad(single.sampleHash, 50);

  const summary = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE || 'default',
    },
    single: {
      hash: single.hashStats,
      verify: single.verifyStats,
    },
    concurrency: {
      c10,
      c25,
      c50,
    },
    healthUnderLoad,
  };

  console.log('\n================================================================');
  console.log('JSON SUMMARY RESULT:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('================================================================');

  if (process.argv.includes('--save-baseline')) {
    const fs = await import('node:fs');
    fs.writeFileSync('benchmark-baseline.json', JSON.stringify(summary, null, 2));
    console.log('Saved baseline to benchmark-baseline.json');
  } else if (process.argv.includes('--save-native')) {
    const fs = await import('node:fs');
    fs.writeFileSync('benchmark-native.json', JSON.stringify(summary, null, 2));
    console.log('Saved native results to benchmark-native.json');
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
