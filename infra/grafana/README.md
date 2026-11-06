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

---

## Production Monitoring Deployment Checklist

> [!IMPORTANT]
> **Repository Configuration vs. Live Cluster Verification**  
> The manifests in `infra/k8s/` (`api-deployment.yaml`, `api-prometheusrules.yaml`, `api-servicemonitor.yaml`) and the dashboard in `infra/grafana/dashboard.json` represent declarative infrastructure-as-code configurations versioned within this repository. They are **not** currently deployed to an active Kubernetes cluster by local build scripts. When preparing for cluster deployment, verify each checklist item against the live target cluster before routing production traffic.

### 1. Prometheus Operator & Custom Resource Definitions (CRDs)
- [ ] Confirm Prometheus Operator is installed and running in the cluster (e.g., via `kube-prometheus-stack` Helm chart or Operator manifests).
- [ ] Verify required CRDs are registered:
  - `prometheusrules.monitoring.coreos.com`
  - `servicemonitors.monitoring.coreos.com`
- [ ] Apply the alerting rules:
  ```bash
  kubectl apply -f infra/k8s/api-prometheusrules.yaml -n <target-namespace>
  ```
- [ ] Confirm Prometheus Operator successfully reconciles `api-prometheus-rules` without syntax errors.

### 2. ServiceMonitor Discovery & Label Selectors
- [ ] Apply the ServiceMonitor manifest:
  ```bash
  kubectl apply -f infra/k8s/api-servicemonitor.yaml -n <target-namespace>
  ```
- [ ] Ensure the labels on `api-metrics-monitor` (specifically `release: prometheus` and `app: driver-complaint-api`) match the `serviceMonitorSelector` configured on your Prometheus instance.
- [ ] Verify the target API `Service` exposes port name `http` (port 4000) with matching `app: driver-complaint-api` pod selectors.

### 3. Namespace, Secrets & Scrape Authentication
- [ ] Verify the existence of the Kubernetes Secret `api-secrets` in the same namespace where the API pods and ServiceMonitor reside:
  ```bash
  kubectl get secret api-secrets -n <target-namespace>
  ```
- [ ] Ensure the secret contains the key `metrics-auth-token`:
  ```bash
  kubectl get secret api-secrets -n <target-namespace> -o jsonpath='{.data.metrics-auth-token}'
  ```
- [ ] Confirm the decoded secret value matches the `METRICS_AUTH_TOKEN` environment variable passed to the API container in `infra/k8s/api-deployment.yaml`.
- [ ] Verify Prometheus uses this secret for scrape authorization (`authorization.credentials.name: api-secrets`, `authorization.credentials.key: metrics-auth-token`). Unauthenticated scrapes to `/metrics` in production return HTTP 403/401.

### 4. Prometheus Target Reachability
- [ ] In Prometheus Web UI (`Status` $\rightarrow$ `Targets`), verify that all `driver-complaint-api` pods appear under target pool `serviceMonitor/<namespace>/api-metrics-monitor/0` with state **UP**.
- [ ] Confirm the 15-second scrape interval is honored and scrape duration is consistently below 500ms.

### 5. Grafana Datasource & Dashboard Import
- [ ] Verify that a Prometheus data source is provisioned in Grafana and points to the cluster Prometheus server (e.g. `http://prometheus-k8s.monitoring.svc:9090`).
- [ ] Import `infra/grafana/dashboard.json` following the instructions above.
- [ ] Verify that template variable `${DS_PROMETHEUS}` binds to the active Prometheus datasource.
- [ ] Check that all 22 panels populate metrics across the 7 rows.

### 6. Alertmanager Routing & Notification Configuration
- [ ] Verify that Prometheus is connected to Alertmanager instances (`Status` $\rightarrow$ `Runtime & Build Information`).
- [ ] Configure Alertmanager routes (`alertmanager.yaml`) for receiver routing:
  - Route alerts with `severity: critical` (e.g. `HighHttp5xxErrorRate`, `HighHttpP99Latency`, `RedisUnavailable`, `DatabaseUnavailable`, `OutboxDispatchStalled`) to real-time notification channels (PagerDuty, Opsgenie, critical on-call Slack channel).
  - Route alerts with `severity: warning` (e.g. `HighHttpP95Latency`, `PodMemoryPressure`, `BullMQQueueBacklog`, `DatabaseQueryLatencyHigh`, `OutboxDispatchLagHigh`) to operational triage channels.
- [ ] Test alert dispatch and verify resolution notifications cleanly clear when metrics recover.


