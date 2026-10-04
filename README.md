# NexusFlow - Visual Workflow Automation Platform

**NexusFlow** (Problem ID: `ALG-AUTO-01`) is a high-performance, production-ready Visual Workflow Automation Studio and Execution Engine that allows teams and developers to visually compose, test, execute, schedule, and monitor data and automation pipelines across disparate tools and services.

---

## 🌟 Key Features

### 1. Interactive Visual Studio
- **Dynamic DAG Canvas**: Drag-and-drop nodes with smooth cubic bezier connections, zoom/pan controls, minimap, snap-to-grid, and one-click auto-alignment layout.
- **Port Types**: Standard inputs/outputs, specialized **True / False** conditional branching handles, and multi-case ports.
- **Rich Node Palette**:
  - **Triggers**: Manual Trigger, Inbound Webhook (`/api/webhooks/{id}`), Schedule / Cron, Event Poller.
  - **Actions**: HTTP / REST API with auto-retries, Data Transformations (Python / JSONPath / Math expressions), Sandboxed Python Code Executor, Multi-channel Notifications (Slack, Discord, Email, Webhooks), Delay & Sleep, AI / LLM reasoning generation.
  - **Logic & Branching**: If / Else Condition Evaluator (12+ comparison operators), Switch / Multi-case, Array Filters.
  - **Advanced Control**: Parallel Fork & Join (concurrent thread pool execution), Sub-Workflow callers.
- **Dynamic Inspector**: Real-time validation, upstream variable auto-completion pills (`{{steps.node.output.field}}`), and single-step isolation tester.

### 2. Robust Real Execution Engine
- **DAG Topological Resolution**: Handles arbitrary graph topologies, detects cycles, and orchestrates execution order.
- **Parallel Branch Concurrency**: Simultaneously executes independent graph branches via thread pools.
- **Variable Interpolation**: Deep path traversal (`{{steps.node_id.output.user.email}}` and `{{trigger.order_id}}`) with typed scalar evaluation and template string substitution.
- **Automatic Retries & Exponential Backoff**: Configurable retry policies on API & network action nodes.
- **Inbound Webhook Listener**: Instant background execution triggered by external HTTP POST events.
- **Background Cron Scheduler**: Built-in background daemon evaluating active cron schedules.

### 3. Observability & AI
- **Live Canvas Glowing Animation**: Visual state progression (Running pulsing cyan -> Success emerald -> Failed rose -> Skipped dashed gray) with active flowing connection wires.
- **Execution Console & Trace Timeline**: Step-by-step latency metrics, attempt counters, and dual JSON payload inspector (Input vs Output).
- **Prompt-to-Workflow AI Generator**: Enter natural language descriptions to synthesize full, valid DAG node graphs.
- **Pre-Built Template Gallery**: Battle-tested workflows for Lead Ingestion, Fraud Detection, Health Monitoring, and Customer 360 Aggregation.

---

## 🚀 Quick Start

### Start Server
```bash
./run.sh 8080
# Or directly:
python3 backend/server.py 8080
```
Open **`http://localhost:8080`** in your browser to access the Studio.

---

## 🧪 Running Automated Tests
```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

---

## 📡 REST API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/workflows` | List all saved workflows |
| `POST` | `/api/workflows` | Create or update workflow DAG |
| `GET` | `/api/workflows/{id}` | Get workflow details |
| `DELETE` | `/api/workflows/{id}` | Delete workflow |
| `POST` | `/api/workflows/{id}/execute` | Execute workflow DAG |
| `POST` | `/api/webhooks/{id}` | Inbound webhook trigger endpoint |
| `GET` | `/api/executions` | List execution history |
| `GET` | `/api/executions/{id}` | Detailed step traces & JSON logs |
| `POST` | `/api/test-node` | Test a single node in isolation |
| `POST` | `/api/ai/generate-workflow` | Synthesize DAG from natural language |
| `GET` | `/api/templates` | Pre-built template gallery |
| `GET` | `/api/stats` | Platform execution analytics |
