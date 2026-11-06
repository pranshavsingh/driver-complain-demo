import { Worker, Queue } from 'bullmq';
import { redis, redisAvailable } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { dispatchPendingOutboxEvents, startDispatcherScheduler, stopDispatcherScheduler } from './dispatcher.service';
import { processDeliveryForConsumer } from './consumer.service';
import { startWatchdogScheduler, stopWatchdogScheduler } from './watchdog.service';
import { instrumentWorker } from '../../jobs/queue-metrics';
import { QUEUES } from '../../jobs/queue';

export const OUTBOX_QUEUES = {
  DISPATCH: QUEUES.OUTBOX_DISPATCH,
  DELIVERY: QUEUES.OUTBOX_DELIVERY,
} as const;

let dispatchQueue: Queue | null = null;
let deliveryQueue: Queue | null = null;
let dispatchWorker: Worker | null = null;
let deliveryWorker: Worker | null = null;
let isStarted = false;

/** Returns active outbox queues for metrics collection. */
export function getOutboxQueues(): { dispatchQueue: Queue | null; deliveryQueue: Queue | null } {
  return { dispatchQueue, deliveryQueue };
}

export async function enqueueOutboxDispatch(outboxId: string): Promise<boolean> {
  if (!dispatchQueue) return false;
  await dispatchQueue.add('dispatch', { outboxId }, { removeOnComplete: 100, removeOnFail: 500 });
  return true;
}

export async function enqueueOutboxDelivery(consumerId: string, consumerName: string): Promise<boolean> {
  if (!deliveryQueue) return false;
  await deliveryQueue.add('deliver', { consumerId, consumerName }, { removeOnComplete: 100, removeOnFail: 500 });
  return true;
}

/**
 * Initializes BullMQ outbox workers and schedulers with graceful lifecycle management.
 */
export async function startOutboxWorkers(): Promise<void> {
  if (isStarted) return;
  isStarted = true;

  // Always start internal schedulers
  startDispatcherScheduler();
  startWatchdogScheduler();

  if (!redis || !redisAvailable) {
    logger.info('Redis unavailable — Outbox operating in embedded scheduler mode');
    return;
  }

  try {
    const connection = redis;

    dispatchQueue = new Queue(OUTBOX_QUEUES.DISPATCH, { connection, defaultJobOptions: { attempts: 3 } });
    deliveryQueue = new Queue(OUTBOX_QUEUES.DELIVERY, { connection, defaultJobOptions: { attempts: 3 } });

    dispatchWorker = new Worker(
      OUTBOX_QUEUES.DISPATCH,
      async (job) => {
        logger.debug({ jobId: job.id, data: job.data }, 'Processing outbox dispatch job');
        await dispatchPendingOutboxEvents();
      },
      {
        connection,
        concurrency: 5,
      },
    );

    deliveryWorker = new Worker(
      OUTBOX_QUEUES.DELIVERY,
      async (job) => {
        const { consumerId, consumerName } = job.data as { consumerId: string; consumerName: string };
        const workerId = `bullmq-${process.pid}-${job.id}`;
        await processDeliveryForConsumer(consumerId, consumerName, workerId);
      },
      {
        connection,
        concurrency: 10,
      },
    );

    instrumentWorker(dispatchWorker, OUTBOX_QUEUES.DISPATCH);
    instrumentWorker(deliveryWorker, OUTBOX_QUEUES.DELIVERY);

    dispatchWorker.on('error', (err) => {
      logger.error({ err }, 'Outbox dispatch worker error');
    });

    deliveryWorker.on('error', (err) => {
      logger.error({ err }, 'Outbox delivery worker error');
    });

    logger.info('Outbox BullMQ workers initialized successfully');
  } catch (err) {
    logger.warn({ err }, 'Failed to start BullMQ outbox workers, falling back to embedded schedulers');
  }
}

/**
 * Gracefully shuts down BullMQ outbox workers, draining in-flight jobs.
 */
export async function stopOutboxWorkers(): Promise<void> {
  if (!isStarted) return;
  isStarted = false;

  stopDispatcherScheduler();
  stopWatchdogScheduler();

  const promises: Promise<unknown>[] = [];

  if (dispatchWorker) {
    promises.push(dispatchWorker.close().catch((err: unknown) => {
      logger.warn({ err }, 'Error closing dispatch worker');
    }));
    dispatchWorker = null;
  }

  if (deliveryWorker) {
    promises.push(deliveryWorker.close().catch((err: unknown) => {
      logger.warn({ err }, 'Error closing delivery worker');
    }));
    deliveryWorker = null;
  }

  if (dispatchQueue) {
    promises.push(dispatchQueue.close().catch(() => {}));
    dispatchQueue = null;
  }

  if (deliveryQueue) {
    promises.push(deliveryQueue.close().catch(() => {}));
    deliveryQueue = null;
  }

  await Promise.all(promises);
  logger.info('Outbox BullMQ workers and schedulers shut down gracefully');
}
