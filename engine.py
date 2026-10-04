"""
Workflow Execution Engine for Visual Workflow Automation Platform.
Handles DAG resolution, topological ordering, parallel branch execution,
variable interpolation, conditional routing, retries, and sub-workflows.
"""

import collections
import concurrent.futures
import copy
import json
import re
import time
import traceback
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.database import (
    create_execution,
    get_workflow,
    log_execution_step,
    update_execution
)
from backend.node_handlers import execute_node_handler

# Regex for variable interpolation: {{steps.node_id.output.field.subfield}} or {{trigger.field}}
VAR_PATTERN = re.compile(r"\{\{([^{}]+)\}\}")

def resolve_json_path(data: Any, path_parts: List[str]) -> Any:
    """Traverses nested dicts and lists using dot-path components."""
    current = data
    for part in path_parts:
        if current is None:
            return None
        # Handle array indexing: e.g. items[0]
        array_match = re.match(r"^(\w+)\[(\d+)\]$", part)
        if array_match:
            key, idx = array_match.group(1), int(array_match.group(2))
            if isinstance(current, dict) and key in current:
                current = current[key]
                if isinstance(current, list) and 0 <= idx < len(current):
                    current = current[idx]
                else:
                    return None
            else:
                return None
        elif isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                idx = int(part)
                current = current[idx] if 0 <= idx < len(current) else None
            except ValueError:
                return None
        else:
            return None
    return current

def interpolate_value(val: Any, context: Dict[str, Any]) -> Any:
    """
    Recursively replaces `{{...}}` expressions inside strings, dictionaries, and lists.
    If the string is exactly `{{path}}`, returns the actual typed object (int, dict, list, etc.).
    """
    if isinstance(val, str):
        val_trimmed = val.strip()
        single_match = re.fullmatch(r"\{\{([^{}]+)\}\}", val_trimmed)
        if single_match:
            expr = single_match.group(1).strip()
            return resolve_expression(expr, context)
        
        # Multiple / embedded expressions inside a string template
        def replace_fn(match):
            expr = match.group(1).strip()
            res = resolve_expression(expr, context)
            if res is None:
                return ""
            if isinstance(res, (dict, list)):
                return json.dumps(res)
            return str(res)
            
        return VAR_PATTERN.sub(replace_fn, val)

    elif isinstance(val, dict):
        return {k: interpolate_value(v, context) for k, v in val.items()}
    elif isinstance(val, list):
        return [interpolate_value(item, context) for item in val]
    return val

def resolve_expression(expr: str, context: Dict[str, Any]) -> Any:
    """Resolves an expression like 'steps.node-1.output.id' or 'trigger.user.email' against runtime context."""
    parts = expr.split(".")
    root = parts[0]
    
    if root == "steps":
        if len(parts) < 2:
            return context.get("steps", {})
        node_id = parts[1]
        node_step = context.get("steps", {}).get(node_id, {})
        remaining = parts[2:]
        if not remaining:
            return node_step.get("output")
        if remaining[0] in ("output", "input"):
            sub_root = node_step.get(remaining[0], {})
            return resolve_json_path(sub_root, remaining[1:]) if len(remaining) > 1 else sub_root
        return resolve_json_path(node_step.get("output"), remaining)
        
    elif root in ("trigger", "payload"):
        trigger_data = context.get("trigger_payload") or {}
        return resolve_json_path(trigger_data, parts[1:]) if len(parts) > 1 else trigger_data
        
    elif root == "env":
        # Safe mock environment variables
        env_vars = {"APP_ENV": "production", "DEFAULT_CURRENCY": "USD", "SERVICE_REGION": "us-central1"}
        return resolve_json_path(env_vars, parts[1:])
        
    # Check if root is directly a node ID
    if root in context.get("steps", {}):
        node_step = context["steps"][root]
        remaining = parts[1:]
        return resolve_json_path(node_step.get("output"), remaining) if remaining else node_step.get("output")
        
    return None

class WorkflowEngine:
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers

    def execute_workflow(self, workflow_id: str, trigger_payload: Optional[Dict[str, Any]] = None, 
                         trigger_override_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Loads workflow from database and executes the DAG.
        Returns execution result summary.
        """
        wf = get_workflow(workflow_id)
        if not wf:
            raise ValueError(f"Workflow with ID '{workflow_id}' not found.")

        nodes = wf.get("nodes", [])
        edges = wf.get("edges", [])
        wf_name = wf.get("name", "Untitled")
        trigger_type = trigger_override_type or wf.get("trigger_type", "manual")

        exec_id = create_execution(workflow_id, wf_name, trigger_type, trigger_payload or {})
        start_time = time.time()

        try:
            summary = self._run_dag(exec_id, workflow_id, nodes, edges, trigger_payload or {}, trigger_type)
            duration_ms = (time.time() - start_time) * 1000
            status = "completed" if summary.get("failed_count", 0) == 0 else "failed"
            update_execution(exec_id, status, time.time(), round(duration_ms, 2), 
                             error_message=summary.get("last_error"), summary=summary)
            summary["execution_id"] = exec_id
            summary["status"] = status
            summary["duration_ms"] = round(duration_ms, 2)
            return summary
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            err_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            update_execution(exec_id, "failed", time.time(), round(duration_ms, 2), error_message=err_msg)
            return {
                "execution_id": exec_id,
                "workflow_id": workflow_id,
                "status": "failed",
                "duration_ms": round(duration_ms, 2),
                "error": str(e),
                "traceback": err_msg
            }

    def _run_dag(self, exec_id: str, workflow_id: str, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], 
                 trigger_payload: Dict[str, Any], trigger_type: str) -> Dict[str, Any]:
        """Core DAG graph traversal with support for parallel branching, conditions, and retries."""
        node_map = {n["id"]: n for n in nodes}
        
        # Build adjacency maps and in-degree counts
        outgoing_edges: Dict[str, List[Dict[str, Any]]] = collections.defaultdict(list)
        incoming_edges: Dict[str, List[Dict[str, Any]]] = collections.defaultdict(list)
        
        for e in edges:
            src = e.get("source")
            tgt = e.get("target")
            if src and tgt and src in node_map and tgt in node_map:
                outgoing_edges[src].append(e)
                incoming_edges[tgt].append(e)

        # Detect Trigger / Entry Nodes (nodes with trigger types or 0 incoming edges)
        entry_nodes = []
        for n in nodes:
            n_type = n.get("type", "")
            if "trigger" in n_type or len(incoming_edges[n["id"]]) == 0:
                entry_nodes.append(n["id"])

        if not entry_nodes and nodes:
            entry_nodes = [nodes[0]["id"]]

        # Runtime State
        steps_context: Dict[str, Dict[str, Any]] = {}
        node_status: Dict[str, str] = {n["id"]: "pending" for n in nodes}
        node_branch_chosen: Dict[str, Optional[str]] = {} # e.g. "node-cond-1": "true"
        executed_nodes: Set[str] = set()
        skipped_nodes: Set[str] = set()
        
        # Execution queue
        queue: collections.deque = collections.deque(entry_nodes)
        
        failed_count = 0
        last_error = None

        while queue:
            # Gather nodes ready to be executed concurrently
            batch_candidates = []
            while queue:
                batch_candidates.append(queue.popleft())

            # Filter candidates whose predecessors are satisfied
            ready_nodes = []
            for nid in batch_candidates:
                if nid in executed_nodes or nid in skipped_nodes:
                    continue
                
                # Check if all incoming edges are resolved
                in_edges = incoming_edges.get(nid, [])
                if not in_edges:
                    ready_nodes.append(nid)
                    continue

                all_parents_done = True
                should_skip = False
                active_parent_count = 0

                for ie in in_edges:
                    parent_id = ie["source"]
                    source_handle = ie.get("sourceHandle", "output")
                    
                    if parent_id not in executed_nodes and parent_id not in skipped_nodes:
                        all_parents_done = False
                        break
                    
                    if parent_id in skipped_nodes:
                        continue

                    # If parent was a condition or switch node, check if this handle was activated
                    parent_branch = node_branch_chosen.get(parent_id)
                    if parent_branch is not None:
                        if source_handle and source_handle != parent_branch and source_handle != "output":
                            # Branch not taken
                            continue
                        else:
                            active_parent_count += 1
                    else:
                        active_parent_count += 1

                if not all_parents_done:
                    # Put back to wait for parents
                    queue.append(nid)
                    continue

                if active_parent_count == 0 and in_edges:
                    # All parents skipped or chose other branches -> Skip this node
                    skipped_nodes.add(nid)
                    node_status[nid] = "skipped"
                    log_execution_step(
                        exec_id=exec_id,
                        node_id=nid,
                        node_title=node_map[nid].get("title", nid),
                        node_type=node_map[nid].get("type", "unknown"),
                        status="skipped",
                        input_payload={},
                        output_payload={},
                        error_message="Skipped because incoming branch was not active",
                        started_at=time.time(),
                        finished_at=time.time(),
                        duration_ms=0.0
                    )
                    # Propagate skip to downstream
                    for oe in outgoing_edges.get(nid, []):
                        if oe["target"] not in queue:
                            queue.append(oe["target"])
                    continue

                ready_nodes.append(nid)

            if not ready_nodes:
                # If queue still has items, break potential deadlock
                if queue:
                    nid = queue.popleft()
                    ready_nodes.append(nid)
                else:
                    break

            # Execute ready nodes in parallel if more than 1
            if len(ready_nodes) == 1:
                results = [self._execute_single_node(exec_id, node_map[ready_nodes[0]], steps_context, trigger_payload)]
            else:
                with concurrent.futures.ThreadPoolExecutor(max_workers=min(self.max_workers, len(ready_nodes))) as executor:
                    futures = [
                        executor.submit(self._execute_single_node, exec_id, node_map[nid], steps_context, trigger_payload)
                        for nid in ready_nodes
                    ]
                    results = [f.result() for f in futures]

            for nid, status, output_data, branch_chosen, err_msg in results:
                executed_nodes.add(nid)
                node_status[nid] = status
                node_branch_chosen[nid] = branch_chosen
                
                if status == "success":
                    steps_context[nid] = {"output": output_data}
                else:
                    failed_count += 1
                    last_error = err_msg
                    steps_context[nid] = {"error": err_msg}

                # Add downstream connected nodes to queue
                for oe in outgoing_edges.get(nid, []):
                    tgt_id = oe["target"]
                    if tgt_id not in executed_nodes and tgt_id not in skipped_nodes and tgt_id not in queue:
                        queue.append(tgt_id)

        return {
            "workflow_id": workflow_id,
            "total_nodes": len(nodes),
            "executed_count": len(executed_nodes),
            "skipped_count": len(skipped_nodes),
            "failed_count": failed_count,
            "last_error": last_error,
            "node_statuses": node_status,
            "steps": steps_context
        }

    def _execute_single_node(self, exec_id: str, node: Dict[str, Any], steps_context: Dict[str, Any], 
                             trigger_payload: Dict[str, Any]) -> Tuple[str, str, Any, Optional[str], Optional[str]]:
        """Executes a single node with retry logic and logs step trace."""
        nid = node["id"]
        ntype = node.get("type", "unknown")
        title = node.get("title", nid)
        raw_data = node.get("data", {})

        # Retry configuration
        max_retries = int(raw_data.get("retry_count", 0))
        retry_delay = float(raw_data.get("retry_delay_seconds", 1.0))
        
        attempt = 0
        last_exception = None
        started_at = time.time()

        # Handle Sub-workflow invocation
        if ntype == "sub_workflow_call":
            sub_wf_id = raw_data.get("sub_workflow_id")
            input_mapping = raw_data.get("input_mapping", {})
            resolved_input = interpolate_value(input_mapping, {"steps": steps_context, "trigger_payload": trigger_payload})
            
            try:
                sub_res = self.execute_workflow(sub_wf_id, trigger_payload=resolved_input, trigger_override_type="sub_workflow")
                finished_at = time.time()
                duration_ms = (finished_at - started_at) * 1000
                log_execution_step(exec_id, nid, title, ntype, "success", resolved_input, sub_res, None, started_at, finished_at, round(duration_ms, 2), 1)
                return nid, "success", sub_res, None, None
            except Exception as e:
                finished_at = time.time()
                duration_ms = (finished_at - started_at) * 1000
                err_msg = str(e)
                log_execution_step(exec_id, nid, title, ntype, "failed", resolved_input, {}, err_msg, started_at, finished_at, round(duration_ms, 2), 1)
                return nid, "failed", {}, None, err_msg

        while attempt <= max_retries:
            attempt += 1
            try:
                # Interpolate variable references inside node config
                resolved_data = interpolate_value(raw_data, {"steps": steps_context, "trigger_payload": trigger_payload})
                
                runtime_context = {
                    "execution_id": exec_id,
                    "node_id": nid,
                    "trigger_payload": trigger_payload,
                    "input_data": resolved_data.get("input_mapping") or trigger_payload,
                    "steps": steps_context
                }

                output, branch = execute_node_handler(ntype, resolved_data, runtime_context)
                finished_at = time.time()
                duration_ms = (finished_at - started_at) * 1000

                log_execution_step(
                    exec_id=exec_id,
                    node_id=nid,
                    node_title=title,
                    node_type=ntype,
                    status="success",
                    input_payload=resolved_data,
                    output_payload=output,
                    error_message=None,
                    started_at=started_at,
                    finished_at=finished_at,
                    duration_ms=round(duration_ms, 2),
                    attempt_count=attempt
                )
                return nid, "success", output, branch, None

            except Exception as e:
                last_exception = e
                if attempt <= max_retries:
                    time.sleep(retry_delay * (1.5 ** (attempt - 1))) # Exponential backoff

        finished_at = time.time()
        duration_ms = (finished_at - started_at) * 1000
        err_msg = f"{type(last_exception).__name__}: {str(last_exception)}"
        log_execution_step(
            exec_id=exec_id,
            node_id=nid,
            node_title=title,
            node_type=ntype,
            status="failed",
            input_payload=raw_data,
            output_payload={},
            error_message=err_msg,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=round(duration_ms, 2),
            attempt_count=attempt
        )
        return nid, "failed", {}, None, err_msg

    def test_single_node(self, node_data: Dict[str, Any], mock_input: Dict[str, Any]) -> Dict[str, Any]:
        """Executes a single node in isolation with provided mock inputs for instant UI step testing."""
        node_type = node_data.get("type", "unknown")
        config = node_data.get("data", {})
        
        start_t = time.time()
        try:
            resolved_config = interpolate_value(config, {"steps": mock_input.get("steps", {}), "trigger_payload": mock_input.get("trigger", {})})
            runtime_context = {
                "execution_id": "test-debug-run",
                "node_id": node_data.get("id", "test-node"),
                "trigger_payload": mock_input.get("trigger", {}),
                "input_data": mock_input.get("input_data") or resolved_config.get("input_mapping") or mock_input,
                "steps": mock_input.get("steps", {})
            }
            output, branch = execute_node_handler(node_type, resolved_config, runtime_context)
            duration_ms = (time.time() - start_t) * 1000
            return {
                "status": "success",
                "duration_ms": round(duration_ms, 2),
                "output": output,
                "branch_chosen": branch,
                "resolved_config": resolved_config
            }
        except Exception as e:
            duration_ms = (time.time() - start_t) * 1000
            return {
                "status": "failed",
                "duration_ms": round(duration_ms, 2),
                "error": f"{type(e).__name__}: {str(e)}",
                "traceback": traceback.format_exc()
            }
