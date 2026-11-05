# Grafana Operational Dashboard: SSE Connect+ API Fleet

This directory contains the production Grafana dashboard model for monitoring the Driver Complaint Management System (`driver-complaint-api`).

## Datasource Assumptions

- **Prometheus Datasource:** The dashboard template expects a Prometheus data source. The template variable `${DS_PROMETHEUS}` automatically binds to the default Prometheus datasource upon import.
- **Scrape Interval:** Assumes 15-second scraping configured via Kubernetes `ServiceMonitor` (`infra/k8s/api-servicemonitor.yaml`).
- **Scrape Target:** Scrapes `/metrics` on port 4000 using Bearer token authentication from Kubernetes secret `api-secrets` (`metrics-auth-token`).

## Dashboard Panels Overview

1. **HTTP Traffic & Availability:**
   - **Request Rate by Route:** `sse_connect_http_requests_total` rate aggregated by HTTP method and bounded route template.
   - **HTTP 5xx Error Rate:** Percentage of HTTP 5xx responses over total requests with warning (1%) and critical (2%) thresholds.
   - **In-Flight HTTP Requests:** Realtime gauge of currently executing requests (`sse_connect_http_requests_in_flight`).
   - **HTTP Latency Percentiles:** 50th, 95th, and 99th percentile request duration histograms.

2. **Node.js Process & Host Resources:**
   - **Process CPU Utilization:** Combined user and system CPU consumption.
   - **Node.js Memory Allocation:** V8 Heap Used, Heap Total, and Process Resident Set Size (RSS).
   - **Event Loop Lag:** Libuv event loop delay gauge.

3. **PostgreSQL & Prisma Query Performance:**
   - **Database Connectivity:** Binary status (1 = UP, 0 = DOWN) based on deep query reachability.
   - **Query Rate by Model:** Query execution rate partitioned by Prisma data model (`Complaint`, `User`, `Vehicle`, etc.).
   - **p95 Latency by Model:** 95th percentile query execution duration by model.

4. **Redis Health & Connectivity:**
   - **Redis Status:** Binary reachability status.
   - **Ping Latency:** Round-trip latency of Redis ping probe.
   - **Connected Clients & Memory:** Connected client connections and byte allocation from Redis INFO.

5. **BullMQ Queues & Workers:**
   - **Queue Jobs by State:** Stacked job counts across states (`waiting`, `active`, `delayed`, `failed`, `completed`) for allowlisted queues.
   - **Job Execution Duration:** 95th percentile worker execution duration.

6. **Realtime WebSockets (Socket.IO):**
   - **Connected Clients:** Live count of active authenticated WebSocket connections.
   - **Disconnection Rate:** Disconnections per minute partitioned by normalized reason code.
   - **Active Rooms:** Total active rooms across connected users and roles.

7. **Transactional Outbox Engine:**
   - **Pending Outbox Events:** Current backlog of un-dispatched transactional events.
   - **Outbox Dispatch Lag:** Age in seconds of the oldest pending event.
   - **Dispatch & Delivery Throughput:** Event fan-out preparation and consumer delivery rates.

## How to Import

1. In Grafana UI, navigate to **Dashboards** $\rightarrow$ **New** $\rightarrow$ **Import**.
2. Upload `infra/grafana/dashboard.json` or paste the file contents.
3. Select your Prometheus data source from the dropdown.
4. Click **Import**.

