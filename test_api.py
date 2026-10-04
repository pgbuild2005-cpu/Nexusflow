"""
Integration Tests for Visual Workflow Automation Platform REST API.
Validates all HTTP endpoints, executions, webhooks, and AI synthesis.
"""

import http.client
import json
import os
import sys
import threading
import time
import unittest

os.environ["WORKFLOW_DB_PATH"] = "/tmp/test_api_workflows.db"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import init_db
from backend.server import WorkflowRequestHandler
import socketserver

class TestWorkflowAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.port = 8899
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", cls.port), WorkflowRequestHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        headers = {"Content-Type": "application/json"} if body is not None else {}
        req_body = json.dumps(body) if body is not None else None
        conn.request(method, path, body=req_body, headers=headers)
        resp = conn.getresponse()
        data = resp.read().decode("utf-8")
        conn.close()
        try:
            return resp.status, json.loads(data)
        except Exception:
            return resp.status, data

    def test_01_list_templates_and_instantiate(self):
        status, data = self._request("GET", "/api/templates")
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertGreaterEqual(len(data["templates"]), 3)
        
        tpl_id = data["templates"][0]["id"]
        status, inst_data = self._request("POST", f"/api/templates/{tpl_id}/instantiate")
        self.assertEqual(status, 200)
        self.assertTrue(inst_data["success"])
        self.assertIn("workflow", inst_data)
        self.wf_id = inst_data["workflow"]["id"]

    def test_02_workflow_crud_and_execute(self):
        # Create custom workflow
        new_wf = {
            "name": "Integration Test Pipeline",
            "trigger_type": "manual",
            "nodes": [
                {
                    "id": "trig_1",
                    "type": "manual_trigger",
                    "title": "Start",
                    "data": {"default_payload": {"counter": 10}}
                },
                {
                    "id": "calc_1",
                    "type": "data_transform",
                    "title": "Multiply By 5",
                    "data": {
                        "mode": "expression",
                        "code": "return {'total': input_data.get('counter', 0) * 5, 'status': 'ok'}"
                    }
                }
            ],
            "edges": [
                {"id": "e1", "source": "trig_1", "target": "calc_1", "sourceHandle": "output", "targetHandle": "input"}
            ]
        }
        status, save_res = self._request("POST", "/api/workflows", new_wf)
        self.assertEqual(status, 200)
        wf_id = save_res["workflow"]["id"]

        # Execute
        status, exec_res = self._request("POST", f"/api/workflows/{wf_id}/execute", {"payload": {"counter": 20}})
        self.assertEqual(status, 200)
        self.assertEqual(exec_res["result"]["status"], "completed")
        self.assertEqual(exec_res["result"]["steps"]["calc_1"]["output"]["total"], 100)

        # Inspect execution trace
        exec_id = exec_res["result"]["execution_id"]
        status, trace_res = self._request("GET", f"/api/executions/{exec_id}")
        self.assertEqual(status, 200)
        self.assertEqual(trace_res["execution"]["status"], "completed")
        self.assertEqual(len(trace_res["execution"]["steps"]), 2)

    def test_03_inbound_webhook_endpoint(self):
        # Create webhook workflow
        wf = {
            "name": "Webhook Ingestion Test",
            "trigger_type": "webhook",
            "nodes": [
                {"id": "wh_trig", "type": "webhook_trigger", "data": {}},
                {"id": "wh_act", "type": "data_transform", "data": {
                    "mode": "expression",
                    "code": "return {'echo_event': input_data.get('event'), 'success': True}"
                }}
            ],
            "edges": [{"id": "e_wh", "source": "wh_trig", "target": "wh_act"}]
        }
        status, save_res = self._request("POST", "/api/workflows", wf)
        wf_id = save_res["workflow"]["id"]

        # Post to webhook endpoint
        webhook_payload = {"event": "order_paid", "order_id": "ORD-999", "amount": 150}
        status, wh_res = self._request("POST", f"/api/webhooks/{wf_id}", webhook_payload)
        self.assertEqual(status, 200)
        self.assertEqual(wh_res["status"], "completed")

    def test_04_single_step_tester_endpoint(self):
        node_payload = {
            "node": {
                "id": "step_test_1",
                "type": "code_execution",
                "data": {
                    "code": "return {'power': input_data.get('base', 2) ** 3}"
                }
            },
            "mock_input": {
                "input_data": {"base": 4}
            }
        }
        status, test_res = self._request("POST", "/api/test-node", node_payload)
        self.assertEqual(status, 200)
        self.assertEqual(test_res["result"]["status"], "success")
        self.assertEqual(test_res["result"]["output"]["power"], 64)

    def test_05_ai_workflow_generation_endpoint(self):
        prompt = "When a webhook is triggered with customer feedback, evaluate sentiment and send email alert"
        status, ai_res = self._request("POST", "/api/ai/generate-workflow", {"prompt": prompt})
        self.assertEqual(status, 200)
        self.assertTrue(ai_res["success"])
        self.assertGreaterEqual(len(ai_res["workflow"]["nodes"]), 2)

    def test_06_platform_analytics_stats(self):
        status, stats_res = self._request("GET", "/api/stats")
        self.assertEqual(status, 200)
        self.assertTrue(stats_res["success"])
        self.assertIn("total_workflows", stats_res["stats"])
        self.assertIn("total_executions", stats_res["stats"])

if __name__ == "__main__":
    unittest.main()
