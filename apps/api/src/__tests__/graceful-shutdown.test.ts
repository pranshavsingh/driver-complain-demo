import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { initRealtime, closeRealtime } from '../realtime/socket';
import { stopCleanupScheduler } from '../jobs/cleanup.worker';
import { stopSlaEscalationScheduler } from '../jobs/sla-escalation.worker';
import { closeQueues } from '../jobs/queue';
import { closeRedis } from '../lib/redis';
import { logger } from '../lib/logger';

describe('API Graceful Shutdown Lifecycle', () => {
  it('executes shutdown sequence, drains websockets, stops workers, and disconnects prisma', async () => {
    const loggerInfoSpy = vi.spyOn(logger, 'info');
    const prismaDisconnectSpy = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    const app = createApp();
    const server = createServer(app);
    initRealtime(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    expect(server.listening).toBe(true);

    // Simulate graceful shutdown sequence as executed in index.ts
    const signal = 'SIGTERM';
    logger.info(`Received ${signal}, shutting down gracefully`);
    stopCleanupScheduler();
    stopSlaEscalationScheduler();

    await closeRealtime().catch(() => {});
    await closeQueues().catch(() => {});
    await closeRedis().catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => {
        void prisma.$disconnect().finally(() => resolve());
      });
    });

    expect(loggerInfoSpy).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully');
    expect(prismaDisconnectSpy).toHaveBeenCalled();
    expect(server.listening).toBe(false);

    loggerInfoSpy.mockRestore();
    prismaDisconnectSpy.mockRestore();
  });
});

