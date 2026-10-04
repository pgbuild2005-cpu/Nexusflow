"""
Database module for Visual Workflow Automation Platform.
Manages SQLite connection, schema tables, workflows, executions, step traces, and template data.
"""

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

DB_FILE = os.environ.get("WORKFLOW_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "workflows.db"))

def get_db_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_FILE)), exist_ok=True)
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Workflows table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            trigger_type TEXT DEFAULT 'manual',
            schedule_cron TEXT,
            is_active INTEGER DEFAULT 1,
            nodes_json TEXT NOT NULL,
            edges_json TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """)

    # Executions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_name TEXT,
            status TEXT NOT NULL, -- running, completed, failed, cancelled
            trigger_type TEXT NOT NULL,
            trigger_payload_json TEXT,
            started_at REAL NOT NULL,
            finished_at REAL,
            duration_ms REAL,
            error_message TEXT,
            summary_json TEXT,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        )
    """)

    # Execution steps table (individual node execution results)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS execution_steps (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_id TEXT NOT NULL,
            node_title TEXT,
            node_type TEXT NOT NULL,
            status TEXT NOT NULL, -- running, success, failed, skipped
            attempt_count INTEGER DEFAULT 1,
            input_json TEXT,
            output_json TEXT,
            error_message TEXT,
            started_at REAL NOT NULL,
            finished_at REAL,
            duration_ms REAL,
            FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
        )
    """)

    # Templates table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            trigger_type TEXT NOT NULL,
            nodes_json TEXT NOT NULL,
            edges_json TEXT NOT NULL,
            tags_json TEXT
        )
    """)

    conn.commit()
    conn.close()
    seed_templates()

# Pre-built templates
DEFAULT_TEMPLATES = [
    {
        "id": "tpl-lead-enrichment",
        "name": "Lead Ingestion & Qualification Pipeline",
        "category": "Sales & CRM",
        "description": "Ingests incoming webhook leads, filters high-value prospects (score >= 70), enriches user profiles, and dispatches multi-channel alerts.",
        "trigger_type": "webhook",
        "tags": ["webhook", "crm", "lead", "filter", "enrichment"],
        "nodes": [
            {
                "id": "node-trig-1",
                "type": "webhook_trigger",
                "title": "Inbound Lead Webhook",
                "x": 80,
                "y": 180,
                "data": {
                    "sample_payload": "{\n  \"lead_id\": \"LD-9842\",\n  \"email\": \"alex.dev@innovate.co\",\n  \"company\": \"Innovate Corp\",\n  \"budget\": 15000,\n  \"score\": 85\n}"
                }
            },
            {
                "id": "node-cond-1",
                "type": "condition_if_else",
                "title": "Qualify Score & Budget",
                "x": 380,
                "y": 180,
                "data": {
                    "left_operand": "{{steps.node-trig-1.output.score}}",
                    "operator": ">=",
                    "right_operand": "70"
                }
            },
            {
                "id": "node-act-enrich",
                "type": "data_transform",
                "title": "Calculate Tier & Discount",
                "x": 700,
                "y": 100,
                "data": {
                    "mode": "expression",
                    "code": "return {\n  'tier': 'Enterprise' if input_data.get('score', 0) > 80 else 'Mid-Market',\n  'discount_pct': 15 if input_data.get('budget', 0) > 10000 else 5,\n  'assigned_rep': 'Sarah Jenkins (Senior AE)',\n  'lead_email': input_data.get('email'),\n  'company': input_data.get('company')\n}",
                    "input_mapping": "{{steps.node-trig-1.output}}"
                }
            },
            {
                "id": "node-act-notify",
                "type": "send_notification",
                "title": "Notify Sales Channel",
                "x": 1020,
                "y": 100,
                "data": {
                    "channel": "slack",
                    "recipient": "#enterprise-leads",
                    "message_template": "🔥 Hot Qualified Lead Received!\nCompany: {{steps.node-act-enrich.output.company}}\nTier: {{steps.node-act-enrich.output.tier}}\nAssigned Rep: {{steps.node-act-enrich.output.assigned_rep}}\nBudget Discount: {{steps.node-act-enrich.output.discount_pct}}%"
                }
            },
            {
                "id": "node-act-nurture",
                "type": "send_notification",
                "title": "Add to Standard Nurture",
                "x": 700,
                "y": 300,
                "data": {
                    "channel": "email",
                    "recipient": "{{steps.node-trig-1.output.email}}",
                    "message_template": "Hello! Thank you for contacting us. A sales representative will reach out shortly."
                }
            }
        ],
        "edges": [
            {"id": "e1", "source": "node-trig-1", "target": "node-cond-1", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e2", "source": "node-cond-1", "target": "node-act-enrich", "sourceHandle": "true", "targetHandle": "input"},
            {"id": "e3", "source": "node-cond-1", "target": "node-act-nurture", "sourceHandle": "false", "targetHandle": "input"},
            {"id": "e4", "source": "node-act-enrich", "target": "node-act-notify", "sourceHandle": "output", "targetHandle": "input"}
        ]
    },
    {
        "id": "tpl-api-monitor-retry",
        "name": "API Health Monitor & Auto-Retry Alert",
        "category": "DevOps & SRE",
        "description": "Periodically pings an external microservice with automatic exponential retry policy. If unhealthy, generates AI diagnosis and alerts on-call.",
        "trigger_type": "schedule",
        "tags": ["schedule", "devops", "healthcheck", "retry", "ai"],
        "nodes": [
            {
                "id": "node-trig-cron",
                "type": "cron_trigger",
                "title": "Every 5 Minutes Pulse",
                "x": 80,
                "y": 200,
                "data": {
                    "cron_expression": "*/5 * * * *",
                    "interval_seconds": 300
                }
            },
            {
                "id": "node-act-http",
                "type": "http_request",
                "title": "Ping Payment Gateway API",
                "x": 380,
                "y": 200,
                "data": {
                    "method": "GET",
                    "url": "https://httpbin.org/status/200",
                    "headers": "{\"Content-Type\": \"application/json\"}",
                    "retry_count": 3,
                    "retry_delay_seconds": 2
                }
            },
            {
                "id": "node-cond-status",
                "type": "condition_if_else",
                "title": "Verify HTTP Status 200",
                "x": 680,
                "y": 200,
                "data": {
                    "left_operand": "{{steps.node-act-http.output.status_code}}",
                    "operator": "==",
                    "right_operand": "200"
                }
            },
            {
                "id": "node-act-ok",
                "type": "data_transform",
                "title": "Record Uptime Metric",
                "x": 980,
                "y": 120,
                "data": {
                    "mode": "expression",
                    "code": "return {'status': 'healthy', 'latency_ms': input_data.get('duration_ms', 45), 'timestamp': time.time()}",
                    "input_mapping": "{{steps.node-act-http.output}}"
                }
            },
            {
                "id": "node-act-ai-diag",
                "type": "ai_generate",
                "title": "AI Incident Severity Diagnosis",
                "x": 980,
                "y": 300,
                "data": {
                    "prompt": "An API health check failed with status code {{steps.node-act-http.output.status_code}} and body {{steps.node-act-http.output.body}}. Provide an incident severity rating (P1-P4) and immediate triage recommendation in 2 sentences."
                }
            }
        ],
        "edges": [
            {"id": "e-cron-http", "source": "node-trig-cron", "target": "node-act-http", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-http-cond", "source": "node-act-http", "target": "node-cond-status", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-cond-true", "source": "node-cond-status", "target": "node-act-ok", "sourceHandle": "true", "targetHandle": "input"},
            {"id": "e-cond-false", "source": "node-cond-status", "target": "node-act-ai-diag", "sourceHandle": "false", "targetHandle": "input"}
        ]
    },
    {
        "id": "tpl-parallel-aggregator",
        "name": "Parallel Multi-Service Data Aggregator",
        "category": "Data & Analytics",
        "description": "Splits a customer query into concurrent parallel branch lookups across orders and support, aggregating into a unified customer dossier.",
        "trigger_type": "manual",
        "tags": ["parallel", "aggregation", "fan-out", "fan-in", "customer360"],
        "nodes": [
            {
                "id": "node-trig-cust",
                "type": "manual_trigger",
                "title": "Lookup Customer Dossier",
                "x": 80,
                "y": 220,
                "data": {
                    "default_payload": "{\n  \"customer_id\": \"CUST-4029\",\n  \"email\": \"jordan.smith@example.com\",\n  \"tier\": \"Platinum\"\n}"
                }
            },
            {
                "id": "node-fork-parallel",
                "type": "parallel_fork_join",
                "title": "Parallel Branch Dispatcher",
                "x": 380,
                "y": 220,
                "data": {
                    "description": "Executes downstream branches simultaneously in parallel worker threads."
                }
            },
            {
                "id": "node-act-orders",
                "type": "code_execution",
                "title": "Fetch Order History",
                "x": 680,
                "y": 100,
                "data": {
                    "code": "# Simulate Orders Microservice fetch\ncust_id = input_data.get('customer_id', 'UNKNOWN')\nreturn {\n    'total_orders': 18,\n    'lifetime_spend': 4280.50,\n    'last_order_date': '2026-09-28',\n    'recent_status': 'Delivered'\n}",
                    "input_mapping": "{{steps.node-trig-cust.output}}"
                }
            },
            {
                "id": "node-act-support",
                "type": "code_execution",
                "title": "Fetch Support Ticket Health",
                "x": 680,
                "y": 300,
                "data": {
                    "code": "# Simulate Support Desk lookup\nreturn {\n    'open_tickets': 0,\n    'csat_score': 4.9,\n    'vip_support_eligible': True\n}",
                    "input_mapping": "{{steps.node-trig-cust.output}}"
                }
            },
            {
                "id": "node-act-join",
                "type": "data_transform",
                "title": "Aggregate Customer 360 Dossier",
                "x": 1020,
                "y": 200,
                "data": {
                    "mode": "expression",
                    "code": "return {\n    'customer': steps.get('node-trig-cust', {}).get('output'),\n    'orders': steps.get('node-act-orders', {}).get('output'),\n    'support': steps.get('node-act-support', {}).get('output'),\n    'account_standing': 'EXCELLENT',\n    'generated_at': time.strftime('%Y-%m-%d %H:%M:%S')\n}",
                    "input_mapping": "{}"
                }
            }
        ],
        "edges": [
            {"id": "e-trig-fork", "source": "node-trig-cust", "target": "node-fork-parallel", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-fork-b1", "source": "node-fork-parallel", "target": "node-act-orders", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-fork-b2", "source": "node-fork-parallel", "target": "node-act-support", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-join-1", "source": "node-act-orders", "target": "node-act-join", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e-join-2", "source": "node-act-support", "target": "node-act-join", "sourceHandle": "output", "targetHandle": "input"}
        ]
    },
    {
        "id": "tpl-ecommerce-fraud-check",
        "name": "E-Commerce Fraud Detection & Order Routing",
        "category": "E-Commerce",
        "description": "Evaluates incoming checkout events. If risk score > 60, runs automated AI verification and holds the order; otherwise approves and charges the card.",
        "trigger_type": "webhook",
        "tags": ["ecommerce", "fraud", "ai", "webhook", "order"],
        "nodes": [
            {
                "id": "node-wf-trig",
                "type": "webhook_trigger",
                "title": "Checkout Created Event",
                "x": 80,
                "y": 200,
                "data": {
                    "sample_payload": "{\n  \"order_id\": \"ORD-5542\",\n  \"customer_email\": \"customer@fastmail.com\",\n  \"amount\": 349.99,\n  \"ip_country\": \"US\",\n  \"billing_country\": \"US\",\n  \"velocity_count_24h\": 1\n}"
                }
            },
            {
                "id": "node-calc-risk",
                "type": "code_execution",
                "title": "Calculate Risk Index",
                "x": 380,
                "y": 200,
                "data": {
                    "code": "ip_match = input_data.get('ip_country') == input_data.get('billing_country')\namount = float(input_data.get('amount', 0))\nvelocity = int(input_data.get('velocity_count_24h', 1))\n\nrisk = 10\nif not ip_match: risk += 45\nif amount > 1000: risk += 30\nif velocity > 3: risk += 35\n\nreturn {\n    'risk_score': min(risk, 100),\n    'is_suspicious': risk >= 50,\n    'order_id': input_data.get('order_id'),\n    'amount': amount\n}",
                    "input_mapping": "{{steps.node-wf-trig.output}}"
                }
            },
            {
                "id": "node-eval-risk",
                "type": "condition_if_else",
                "title": "Risk Score >= 50?",
                "x": 680,
                "y": 200,
                "data": {
                    "left_operand": "{{steps.node-calc-risk.output.risk_score}}",
                    "operator": ">=",
                    "right_operand": "50"
                }
            },
            {
                "id": "node-hold-order",
                "type": "send_notification",
                "title": "Alert Fraud Ops & Hold",
                "x": 980,
                "y": 100,
                "data": {
                    "channel": "slack",
                    "recipient": "#fraud-alerts",
                    "message_template": "⚠️ HIGH RISK ORDER HELD: {{steps.node-calc-risk.output.order_id}} with Risk Score {{steps.node-calc-risk.output.risk_score}}/100."
                }
            },
            {
                "id": "node-approve-order",
                "type": "send_notification",
                "title": "Approve & Send Confirmation",
                "x": 980,
                "y": 300,
                "data": {
                    "channel": "email",
                    "recipient": "{{steps.node-wf-trig.output.customer_email}}",
                    "message_template": "Your order {{steps.node-calc-risk.output.order_id}} has been approved and is being prepared!"
                }
            }
        ],
        "edges": [
            {"id": "e1", "source": "node-wf-trig", "target": "node-calc-risk", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e2", "source": "node-calc-risk", "target": "node-eval-risk", "sourceHandle": "output", "targetHandle": "input"},
            {"id": "e3", "source": "node-eval-risk", "target": "node-hold-order", "sourceHandle": "true", "targetHandle": "input"},
            {"id": "e4", "source": "node-eval-risk", "target": "node-approve-order", "sourceHandle": "false", "targetHandle": "input"}
        ]
    }
]

def seed_templates():
    conn = get_db_connection()
    cursor = conn.cursor()
    for tpl in DEFAULT_TEMPLATES:
        cursor.execute("""
            INSERT OR REPLACE INTO templates (id, name, category, description, trigger_type, nodes_json, edges_json, tags_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tpl["id"],
            tpl["name"],
            tpl["category"],
            tpl["description"],
            tpl["trigger_type"],
            json.dumps(tpl["nodes"]),
            json.dumps(tpl["edges"]),
            json.dumps(tpl["tags"])
        ))
    conn.commit()
    conn.close()

# Workflow Operations
def list_workflows() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, description, trigger_type, schedule_cron, is_active, created_at, updated_at
        FROM workflows ORDER BY updated_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_workflow(workflow_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    data = dict(row)
    data["nodes"] = json.loads(data["nodes_json"])
    data["edges"] = json.loads(data["edges_json"])
    return data

def save_workflow(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    wf_id = data.get("id") or f"wf-{uuid.uuid4().hex[:8]}"
    now = time.time()
    
    name = data.get("name", "Untitled Workflow")
    desc = data.get("description", "")
    trigger_type = data.get("trigger_type", "manual")
    schedule_cron = data.get("schedule_cron", "")
    is_active = 1 if data.get("is_active", True) else 0
    nodes_json = json.dumps(data.get("nodes", []))
    edges_json = json.dumps(data.get("edges", []))
    
    cursor.execute("SELECT created_at FROM workflows WHERE id = ?", (wf_id,))
    existing = cursor.fetchone()
    created_at = existing["created_at"] if existing else now

    cursor.execute("""
        INSERT OR REPLACE INTO workflows (id, name, description, trigger_type, schedule_cron, is_active, nodes_json, edges_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (wf_id, name, desc, trigger_type, schedule_cron, is_active, nodes_json, edges_json, created_at, now))
    conn.commit()
    conn.close()
    
    return get_workflow(wf_id)

def delete_workflow(workflow_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

# Execution Operations
def create_execution(workflow_id: str, workflow_name: str, trigger_type: str, trigger_payload: Any) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    exec_id = f"exec-{uuid.uuid4().hex[:10]}"
    now = time.time()
    cursor.execute("""
        INSERT INTO executions (id, workflow_id, workflow_name, status, trigger_type, trigger_payload_json, started_at)
        VALUES (?, ?, ?, 'running', ?, ?, ?)
    """, (exec_id, workflow_id, workflow_name, trigger_type, json.dumps(trigger_payload or {}), now))
    conn.commit()
    conn.close()
    return exec_id

def update_execution(exec_id: str, status: str, finished_at: float, duration_ms: float, error_message: Optional[str] = None, summary: Optional[Dict[str, Any]] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE executions
        SET status = ?, finished_at = ?, duration_ms = ?, error_message = ?, summary_json = ?
        WHERE id = ?
    """, (status, finished_at, duration_ms, error_message, json.dumps(summary or {}), exec_id))
    conn.commit()
    conn.close()

def log_execution_step(exec_id: str, node_id: str, node_title: str, node_type: str, status: str, 
                       input_payload: Any, output_payload: Any, error_message: Optional[str],
                       started_at: float, finished_at: float, duration_ms: float, attempt_count: int = 1):
    conn = get_db_connection()
    cursor = conn.cursor()
    step_id = f"step-{uuid.uuid4().hex[:10]}"
    cursor.execute("""
        INSERT INTO execution_steps (id, execution_id, node_id, node_title, node_type, status, attempt_count, input_json, output_json, error_message, started_at, finished_at, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        step_id, exec_id, node_id, node_title, node_type, status, attempt_count,
        json.dumps(input_payload if input_payload is not None else {}),
        json.dumps(output_payload if output_payload is not None else {}),
        error_message, started_at, finished_at, duration_ms
    ))
    conn.commit()
    conn.close()

def get_execution(exec_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM executions WHERE id = ?", (exec_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    exec_data = dict(row)
    exec_data["trigger_payload"] = json.loads(exec_data["trigger_payload_json"]) if exec_data["trigger_payload_json"] else {}
    exec_data["summary"] = json.loads(exec_data["summary_json"]) if exec_data["summary_json"] else {}

    cursor.execute("SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY started_at ASC", (exec_id,))
    step_rows = cursor.fetchall()
    steps = []
    for s in step_rows:
        s_dict = dict(s)
        s_dict["input"] = json.loads(s_dict["input_json"]) if s_dict["input_json"] else {}
        s_dict["output"] = json.loads(s_dict["output_json"]) if s_dict["output_json"] else {}
        steps.append(s_dict)
    exec_data["steps"] = steps
    conn.close()
    return exec_data

def list_executions(workflow_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    if workflow_id:
        cursor.execute("SELECT * FROM executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?", (workflow_id, limit))
    else:
        cursor.execute("SELECT * FROM executions ORDER BY started_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["trigger_payload"] = json.loads(d["trigger_payload_json"]) if d["trigger_payload_json"] else {}
        d["summary"] = json.loads(d["summary_json"]) if d["summary_json"] else {}
        result.append(d)
    return result

def get_templates() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM templates ORDER BY category, name")
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["nodes"] = json.loads(d["nodes_json"])
        d["edges"] = json.loads(d["edges_json"])
        d["tags"] = json.loads(d["tags_json"]) if d["tags_json"] else []
        result.append(d)
    return result

