"""Contract checks for the 2026-08-11 01:32:13 E2E task resend."""

import ast
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-013209.html"
WORKFLOW_TEST = ROOT / "tests" / "test_workflow_e2e.py"
LIVE_PAGE = os.environ.get(
    "E2E_TASK1_DISPATCH_URL",
    "http://127.0.0.1:8090/e2e-task1-dispatch-2026-08-11-013209.html",
)


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
    """Return only statically literal fields from an AST dictionary."""
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
        if not isinstance(target, ast.Name) or target.id != name:
            continue
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


def test_dispatch_page_records_the_assigned_task():
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
        "data-task-created": "2026-08-11T01:32:09.521313+00:00",
        "data-dispatch": "2026-08-11T01:32:09.547703+00:00",
        "data-backlog-return": "2026-08-11T01:32:13.601912+00:00",
        "data-resend": "2026-08-11T01:32:13.628218+00:00",
        "data-workflow-state": "resent-from-backlog",
        "data-source-test": "tests/test_workflow_e2e.py",
    }


def test_resend_history_is_preserved_in_the_audit_record():
    page = parsed_page()
    root = page.elements["verification"]
    audit = page.elements["audit-record"]
    assert root["attrs"]["data-workflow-state"] == "resent-from-backlog"
    assert root["attrs"]["data-backlog-return"] == "2026-08-11T01:32:13.601912+00:00"
    assert root["attrs"]["data-resend"] == "2026-08-11T01:32:13.628218+00:00"
    assert "Returned to Backlog 2026-08-11 01:32:13 UTC" in audit["text"]
    assert "Resent to agent 2026-08-11 01:32:13 UTC" in audit["text"]


def test_source_contract_defines_both_pending_checklist_items():
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
    assert item["attrs"]["data-evidence"] == "source-contract"
    assert item["text"] == "Verify item A PASS"


def test_verify_item_b_has_explicit_final_pass_evidence():
    final_review = assigned_dict_list("all_pass_data")
    assert final_review[1]["text"] == "Verify item B"
    assert final_review[1]["status"] == "pass"
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence"] == "source-contract"
    assert item["text"] == "Verify item B PASS"


def test_live_mount_serves_the_exact_dispatch_page():
    with urlopen(LIVE_PAGE, timeout=10) as response:
        served_source = response.read().decode("utf-8")
        status = response.status
        content_type = response.headers.get_content_type()

    assert status == 200
    assert content_type == "text/html"
    assert served_source == PAGE.read_text(encoding="utf-8")
    assert parsed_page(served_source).elements["verification"]["attrs"]["data-result"] == "pass"
