/**
 * Global runtime bootstrap module.
 *
 * Configures process-level defaults (such as UV_THREADPOOL_SIZE) before any
 * application modules, third-party libraries, or Node.js internal subsystems
 * initialize libuv or start asynchronous work.
 *
 * libuv initializes its worker threadpool on the first asynchronous threadpool
 * operation (such as file I/O, DNS lookups, or native crypto/bcrypt work).
 * Setting UV_THREADPOOL_SIZE here ensures the worker pool size is established
 * before any dependencies can initialize libuv.
 *
 * Explicit environment variables passed via Docker, Kubernetes, or .env are
 * always preserved.
 */
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

