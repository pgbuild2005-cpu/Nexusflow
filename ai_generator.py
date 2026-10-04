"""
AI Workflow Generator for Visual Workflow Automation Platform.
Converts natural language user prompts into fully-structured DAG workflows
with typed nodes, interconnected edges, and configured variables.
"""

import json
import re
import uuid
from typing import Any, Dict, List

def generate_workflow_from_prompt(prompt: str) -> Dict[str, Any]:
    """
    Synthesizes a complete executable workflow graph from a plain English prompt.
    Extracts triggers, actions, conditionals, notifications, and connections.
    """
    prompt_lower = prompt.lower()
    wf_id = f"wf-ai-{uuid.uuid4().hex[:6]}"
    
    # Heuristic / intent detection
    has_webhook = "webhook" in prompt_lower or "api call" in prompt_lower or "post" in prompt_lower
    has_schedule = "schedule" in prompt_lower or "every" in prompt_lower or "daily" in prompt_lower or "cron" in prompt_lower or "minute" in prompt_lower
    has_condition = "if" in prompt_lower or "filter" in prompt_lower or "check" in prompt_lower or "greater" in prompt_lower or "less" in prompt_lower or "qualif" in prompt_lower or "score" in prompt_lower
    has_http = "http" in prompt_lower or "rest" in prompt_lower or "fetch" in prompt_lower or "endpoint" in prompt_lower or "ping" in prompt_lower or "api" in prompt_lower
    has_ai = "ai" in prompt_lower or "summary" in prompt_lower or "summarize" in prompt_lower or "llm" in prompt_lower or "sentiment" in prompt_lower or "recommend" in prompt_lower
    has_notification = "notify" in prompt_lower or "slack" in prompt_lower or "email" in prompt_lower or "alert" in prompt_lower or "message" in prompt_lower
    has_transform = "transform" in prompt_lower or "format" in prompt_lower or "calculate" in prompt_lower or "enrich" in prompt_lower or "map" in prompt_lower

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    
    x_cursor = 80
    y_center = 200
    prev_node_id = None

    # 1. Trigger Node
    if has_schedule:
        trig_id = f"trig-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": trig_id,
            "type": "cron_trigger",
            "title": "Scheduled Interval Trigger",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "cron_expression": "0 * * * *" if "hour" in prompt_lower else "*/15 * * * *",
                "interval_seconds": 3600 if "hour" in prompt_lower else 900
            }
        })
        trigger_type = "schedule"
        prev_node_id = trig_id
    elif has_webhook or "inbound" in prompt_lower or "event" in prompt_lower:
        trig_id = f"trig-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": trig_id,
            "type": "webhook_trigger",
            "title": "Inbound Webhook Trigger",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "sample_payload": "{\n  \"event_type\": \"order_submitted\",\n  \"user_email\": \"customer@example.com\",\n  \"amount\": 250,\n  \"priority\": \"high\"\n}"
            }
        })
        trigger_type = "webhook"
        prev_node_id = trig_id
    else:
        trig_id = f"trig-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": trig_id,
            "type": "manual_trigger",
            "title": "Manual Workflow Trigger",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "default_payload": "{\n  \"request_id\": \"REQ-1001\",\n  \"status\": \"pending\",\n  \"query\": \"User inquiry data\"\n}"
            }
        })
        trigger_type = "manual"
        prev_node_id = trig_id

    x_cursor += 300

    # 2. HTTP / Data Fetching step if requested
    if has_http and not has_schedule:
        http_id = f"act-http-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": http_id,
            "type": "http_request",
            "title": "Fetch External API Data",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "method": "GET",
                "url": "https://httpbin.org/json",
                "headers": "{\"Content-Type\": \"application/json\"}",
                "retry_count": 2,
                "retry_delay_seconds": 1
            }
        })
        edges.append({
            "id": f"e-{prev_node_id}-{http_id}",
            "source": prev_node_id,
            "target": http_id,
            "sourceHandle": "output",
            "targetHandle": "input"
        })
        prev_node_id = http_id
        x_cursor += 300

    # 3. Transform / Data formatting
    if has_transform or (not has_condition and not has_ai):
        trans_id = f"act-trans-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": trans_id,
            "type": "data_transform",
            "title": "Process & Format Data",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "mode": "expression",
                "code": "return {\n    'processed_at': time.time(),\n    'payload': input_data,\n    'status': 'verified'\n}",
                "input_mapping": f"{{{{steps.{prev_node_id}.output}}}}"
            }
        })
        edges.append({
            "id": f"e-{prev_node_id}-{trans_id}",
            "source": prev_node_id,
            "target": trans_id,
            "sourceHandle": "output",
            "targetHandle": "input"
        })
        prev_node_id = trans_id
        x_cursor += 300

    # 4. Condition Branching if prompt mentions conditional logic
    if has_condition:
        cond_id = f"cond-{uuid.uuid4().hex[:4]}"
        
        # Check condition keywords
        op = ">="
        right_val = "100"
        if "greater" in prompt_lower or ">" in prompt_lower:
            op = ">"
        elif "equal" in prompt_lower or "==" in prompt_lower:
            op = "=="
            right_val = "active"

        nodes.append({
            "id": cond_id,
            "type": "condition_if_else",
            "title": "Evaluate Condition Rule",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "left_operand": f"{{{{steps.{prev_node_id}.output.amount}}}}",
                "operator": op,
                "right_operand": right_val
            }
        })
        edges.append({
            "id": f"e-{prev_node_id}-{cond_id}",
            "source": prev_node_id,
            "target": cond_id,
            "sourceHandle": "output",
            "targetHandle": "input"
        })
        
        # True branch: High Priority Action
        true_act_id = f"act-true-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": true_act_id,
            "type": "send_notification" if has_notification else "ai_generate",
            "title": "Priority Path Alert" if has_notification else "AI High-Value Processor",
            "x": x_cursor + 320,
            "y": y_center - 100,
            "data": {
                "channel": "slack",
                "recipient": "#priority-alerts",
                "message_template": f"⚡ Condition Passed: Value satisfied {op} {right_val} requirement."
            } if has_notification else {
                "prompt": f"Analyze priority data: {{{{steps.{prev_node_id}.output}}}}"
            }
        })
        edges.append({
            "id": f"e-{cond_id}-{true_act_id}-true",
            "source": cond_id,
            "target": true_act_id,
            "sourceHandle": "true",
            "targetHandle": "input"
        })

        # False branch: Standard Fallback Action
        false_act_id = f"act-false-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": false_act_id,
            "type": "send_notification",
            "title": "Standard Path Logger",
            "x": x_cursor + 320,
            "y": y_center + 120,
            "data": {
                "channel": "email",
                "recipient": "logs@company.com",
                "message_template": "Standard workflow path executed."
            }
        })
        edges.append({
            "id": f"e-{cond_id}-{false_act_id}-false",
            "source": cond_id,
            "target": false_act_id,
            "sourceHandle": "false",
            "targetHandle": "input"
        })

        prev_node_id = true_act_id
        x_cursor += 320

    # 5. AI Reasoning Step if explicitly mentioned and not already placed
    if has_ai and not has_condition:
        ai_id = f"act-ai-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": ai_id,
            "type": "ai_generate",
            "title": "AI Content Intelligence",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "prompt": f"Analyze and summarize the workflow data: {{{{steps.{prev_node_id}.output}}}}"
            }
        })
        edges.append({
            "id": f"e-{prev_node_id}-{ai_id}",
            "source": prev_node_id,
            "target": ai_id,
            "sourceHandle": "output",
            "targetHandle": "input"
        })
        prev_node_id = ai_id
        x_cursor += 300

    # 6. Final Notification if requested and not attached to branches
    if has_notification and not has_condition:
        notif_id = f"act-notif-{uuid.uuid4().hex[:4]}"
        nodes.append({
            "id": notif_id,
            "type": "send_notification",
            "title": "Dispatch Notification",
            "x": x_cursor,
            "y": y_center,
            "data": {
                "channel": "slack" if "slack" in prompt_lower else "email",
                "recipient": "#general-notifications" if "slack" in prompt_lower else "team@example.com",
                "message_template": f"Workflow completed successfully!\nResult: {{{{steps.{prev_node_id}.output}}}}"
            }
        })
        edges.append({
            "id": f"e-{prev_node_id}-{notif_id}",
            "source": prev_node_id,
            "target": notif_id,
            "sourceHandle": "output",
            "targetHandle": "input"
        })

    # Generate meaningful title
    clean_title = prompt.strip()
    if len(clean_title) > 40:
        clean_title = clean_title[:40].rsplit(" ", 1)[0] + "..."
    clean_title = clean_title.capitalize()

    return {
        "id": wf_id,
        "name": f"AI Flow: {clean_title}",
        "description": f"Automatically synthesized from prompt: '{prompt}'",
        "trigger_type": trigger_type,
        "is_active": True,
        "nodes": nodes,
        "edges": edges
    }
