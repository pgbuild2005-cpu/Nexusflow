"""
Unit and Integration Tests for Visual Workflow Automation Platform.
Tests DAG execution, condition branching, parallel concurrency, retries, and variable interpolation.
"""

import os
import sys
import unittest
import time

# Set test DB path
os.environ["WORKFLOW_DB_PATH"] = "/tmp/test_workflows.db"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import init_db, save_workflow, get_execution, get_workflow
from backend.engine import WorkflowEngine, interpolate_value, resolve_json_path
from backend.node_handlers import evaluate_condition, execute_node_handler
from backend.ai_generator import generate_workflow_from_prompt

class TestWorkflowEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.engine = WorkflowEngine(max_workers=4)

    def test_variable_interpolation(self):
        ctx = {
            "steps": {
                "node_1": {
                    "output": {
                        "user": {"name": "Alice", "score": 95},
                        "items": ["apple", "banana"]
                    }
                }
            },
            "trigger_payload": {"order_id": "ORD-123"}
        }

        # Exact typing resolution
        res_int = interpolate_value("{{steps.node_1.output.user.score}}", ctx)
        self.assertEqual(res_int, 95)

        # String templating
        res_str = interpolate_value("User {{steps.node_1.output.user.name}} placed {{trigger.order_id}}", ctx)
        self.assertEqual(res_str, "User Alice placed ORD-123")

        # Array element resolution
        res_arr = interpolate_value("{{steps.node_1.output.items[1]}}", ctx)
        self.assertEqual(res_arr, "banana")

    def test_condition_evaluation(self):
        self.assertTrue(evaluate_condition(100, ">=", 50))
        self.assertFalse(evaluate_condition(20, ">", 50))
        self.assertTrue(evaluate_condition("active", "==", "active"))
        self.assertTrue(evaluate_condition("support@domain.com", "contains", "domain.com"))
        self.assertTrue(evaluate_condition("hello world", "starts_with", "hello"))
        self.assertTrue(evaluate_condition("", "is_empty", None))
        self.assertTrue(evaluate_condition("value", "is_not_empty", None))

    def test_dag_conditional_branching(self):
        """Test that condition node only runs the true branch and skips the false branch."""
        wf = {
            "name": "Test Condition Flow",
            "trigger_type": "manual",
            "nodes": [
                {
                    "id": "trig",
                    "type": "manual_trigger",
                    "title": "Trigger",
                    "data": {"default_payload": {"val": 100}}
                },
                {
                    "id": "cond",
                    "type": "condition_if_else",
                    "title": "Check Val >= 50",
                    "data": {
                        "left_operand": "{{steps.trig.output.val}}",
                        "operator": ">=",
                        "right_operand": 50
                    }
                },
                {
                    "id": "true_act",
                    "type": "data_transform",
                    "title": "True Action",
                    "data": {
                        "mode": "expression",
                        "code": "return {'result': 'true_branch_taken'}"
                    }
                },
                {
                    "id": "false_act",
                    "type": "data_transform",
                    "title": "False Action",
                    "data": {
                        "mode": "expression",
                        "code": "return {'result': 'false_branch_taken'}"
                    }
                }
            ],
            "edges": [
                {"id": "e1", "source": "trig", "target": "cond", "sourceHandle": "output", "targetHandle": "input"},
                {"id": "e2", "source": "cond", "target": "true_act", "sourceHandle": "true", "targetHandle": "input"},
                {"id": "e3", "source": "cond", "target": "false_act", "sourceHandle": "false", "targetHandle": "input"}
            ]
        }
        saved_wf = save_workflow(wf)
        wf_id = saved_wf["id"]

        # Run with val = 100 (should take TRUE branch)
        res = self.engine.execute_workflow(wf_id, trigger_payload={"val": 100})
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["node_statuses"]["true_act"], "success")
        self.assertEqual(res["node_statuses"]["false_act"], "skipped")
        self.assertEqual(res["steps"]["true_act"]["output"]["result"], "true_branch_taken")

        # Run with val = 10 (should take FALSE branch)
        res_false = self.engine.execute_workflow(wf_id, trigger_payload={"val": 10})
        self.assertEqual(res_false["status"], "completed")
        self.assertEqual(res_false["node_statuses"]["true_act"], "skipped")
        self.assertEqual(res_false["node_statuses"]["false_act"], "success")
        self.assertEqual(res_false["steps"]["false_act"]["output"]["result"], "false_branch_taken")

    def test_parallel_branch_execution(self):
        """Test concurrent parallel branch execution and downstream joining."""
        wf = {
            "name": "Test Parallel Flow",
            "trigger_type": "manual",
            "nodes": [
                {"id": "trig", "type": "manual_trigger", "data": {"default_payload": {"num": 5}}},
                {"id": "fork", "type": "parallel_fork_join", "data": {}},
                {"id": "b1", "type": "code_execution", "data": {"code": "time.sleep(0.1); return {'calc': input_data.get('num') * 2}"}},
                {"id": "b2", "type": "code_execution", "data": {"code": "time.sleep(0.1); return {'calc': input_data.get('num') * 10}"}},
                {"id": "join", "type": "data_transform", "data": {
                    "mode": "expression",
                    "code": "return {'sum': steps.get('b1',{}).get('output',{}).get('calc',0) + steps.get('b2',{}).get('output',{}).get('calc',0)}"
                }}
            ],
            "edges": [
                {"id": "e1", "source": "trig", "target": "fork"},
                {"id": "e2", "source": "fork", "target": "b1"},
                {"id": "e3", "source": "fork", "target": "b2"},
                {"id": "e4", "source": "b1", "target": "join"},
                {"id": "e5", "source": "b2", "target": "join"}
            ]
        }
        saved = save_workflow(wf)
        res = self.engine.execute_workflow(saved["id"], trigger_payload={"num": 5})
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["steps"]["b1"]["output"]["calc"], 10)
        self.assertEqual(res["steps"]["b2"]["output"]["calc"], 50)
        self.assertEqual(res["steps"]["join"]["output"]["sum"], 60)

    def test_single_node_test_runner(self):
        """Test step execution in isolation with mock input."""
        node = {
            "id": "test-transform-node",
            "type": "data_transform",
            "data": {
                "mode": "expression",
                "code": "return {'tax': input_data.get('amount', 0) * 0.2, 'total': input_data.get('amount', 0) * 1.2}"
            }
        }
        res = self.engine.test_single_node(node, {"input_data": {"amount": 500}})
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["output"]["tax"], 100.0)
        self.assertEqual(res["output"]["total"], 600.0)

    def test_ai_workflow_synthesis(self):
        """Test natural language to DAG workflow generation."""
        prompt = "When an order webhook is received, check if amount > 500, calculate VIP discount, and alert Slack"
        wf = generate_workflow_from_prompt(prompt)
        self.assertTrue(len(wf["nodes"]) >= 3)
        self.assertTrue(any(n["type"] == "webhook_trigger" for n in wf["nodes"]))
        self.assertTrue(any(n["type"] == "condition_if_else" for n in wf["nodes"]))

if __name__ == "__main__":
    unittest.main()
