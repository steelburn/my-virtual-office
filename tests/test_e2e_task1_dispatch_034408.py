"""Contract checks for the 2026-08-11 03:44:08 E2E task dispatch."""

import ast
import json
import os
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-034408.html"
WORKFLOW_TEST = ROOT / "tests" / "test_workflow_e2e.py"
BASE_URL = os.environ.get("VO_TEST_URL", "http://127.0.0.1:8090")
LIVE_PAGE = f"{BASE_URL}/e2e-task1-dispatch-2026-08-11-034408.html"


class DispatchPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = {}
        self._open_ids = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.elements[element_id] = {
                "tag": tag,
                "attrs": attributes,
                "text_parts": [],
            }
            self._open_ids.append(element_id)

    def handle_data(self, data):
        for element_id in self._open_ids:
            self.elements[element_id]["text_parts"].append(data)

    def handle_endtag(self, tag):
        for index in range(len(self._open_ids) - 1, -1, -1):
            element_id = self._open_ids[index]
            if self.elements[element_id]["tag"] == tag:
                del self._open_ids[index]
                break


def parsed_page(source=None):
    parser = DispatchPageParser()
    parser.feed(source if source is not None else PAGE.read_text(encoding="utf-8"))
    for element in parser.elements.values():
        element["text"] = " ".join(" ".join(element.pop("text_parts")).split())
    return parser


def literal_dict_fields(node):
    assert isinstance(node, ast.Dict)
    fields = {}
    for key_node, value_node in zip(node.keys, node.values):
        try:
            key = ast.literal_eval(key_node)
            value = ast.literal_eval(value_node)
        except (ValueError, TypeError):
            continue
        fields[key] = value
    return fields


def assigned_dict_list(name):
    tree = ast.parse(WORKFLOW_TEST.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and target.id == name:
            assert isinstance(node.value, ast.List)
            return [literal_dict_fields(item) for item in node.value.elts]
    raise AssertionError(f"{name} assignment was not found")


def task_creation_payload():
    tree = ast.parse(WORKFLOW_TEST.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or len(node.args) < 2:
            continue
        if not isinstance(node.args[1], ast.Dict):
            continue
        payload = literal_dict_fields(node.args[1])
        if payload.get("title") == "E2E Test Task 1":
            return payload
    raise AssertionError("E2E Test Task 1 creation payload was not found")


def test_dispatch_page_records_the_exact_assigned_task():
    assert PAGE.is_file()
    root = parsed_page().elements["verification"]
    assert root["attrs"] == {
        "id": "verification",
        "data-project": "E2E-Test-Pipeline",
        "data-task": "E2E Test Task 1",
        "data-description": "This is a test task for E2E verification",
        "data-assignee": "main",
        "data-priority": "high",
        "data-result": "pass",
        "data-task-created": "2026-08-11T03:44:08.495558+00:00",
        "data-dispatch": "2026-08-11T03:44:08.522032+00:00",
        "data-verified": "2026-08-11T03:45:47.974678+00:00",
        "data-workflow-state": "verification-complete",
        "data-completion-evidence": "source-contract-live-mount-browser",
        "data-source-test": "tests/test_workflow_e2e.py",
    }


def test_source_contract_preserves_both_pending_checklist_items():
    payload = task_creation_payload()
    assert payload["description"] == "This is a test task for E2E verification"
    assert payload["assignee"] == "main"
    assert payload["priority"] == "high"
    assert payload["checklist"] == [
        {"text": "Verify item A", "done": False},
        {"text": "Verify item B", "done": False},
    ]


def test_verify_item_a_has_explicit_final_pass_evidence():
    final_review = assigned_dict_list("all_pass_data")
    assert final_review[0]["text"] == "Verify item A"
    assert final_review[0]["status"] == "pass"
    item = parsed_page().elements["verify-item-a"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence"] == "source-review-contract"
    assert item["text"] == "Verify item A PASS"


def test_verify_item_b_has_explicit_final_pass_evidence():
    final_review = assigned_dict_list("all_pass_data")
    assert final_review[1]["text"] == "Verify item B"
    assert final_review[1]["status"] == "pass"
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence"] == "source-review-contract"
    assert item["text"] == "Verify item B PASS"


def test_verification_signal_follows_dispatch_and_is_visible():
    page = parsed_page()
    root = page.elements["verification"]
    dispatched = datetime.fromisoformat(root["attrs"]["data-dispatch"])
    verified = datetime.fromisoformat(root["attrs"]["data-verified"])
    assert verified > dispatched
    assert root["attrs"]["data-workflow-state"] == "verification-complete"
    assert page.elements["completion-status"]["text"] == "Both checklist items verified"
    assert "Verified 2026-08-11 03:45:47 UTC" in page.elements["audit-record"]["text"]


def test_live_product_serves_the_page_and_expected_api_shapes():
    with urlopen(LIVE_PAGE, timeout=10) as response:
        served_source = response.read().decode("utf-8")
        assert response.status == 200
        assert response.headers.get_content_type() == "text/html"
    served_page = parsed_page(served_source)
    source_page = parsed_page()
    assert served_page.elements["verification"]["attrs"] == source_page.elements["verification"]["attrs"]
    assert served_page.elements["verify-item-a"]["text"] == "Verify item A PASS"
    assert served_page.elements["verify-item-b"]["text"] == "Verify item B PASS"

    with urlopen(f"{BASE_URL}/health", timeout=10) as response:
        health = json.load(response)
        assert response.status == 200
    with urlopen(f"{BASE_URL}/api/projects", timeout=10) as response:
        projects = json.load(response)
        assert response.status == 200
    assert health == {"ok": True, "status": "running"}
    assert projects["ok"] is True
    assert isinstance(projects["projects"], list)
