"""Continuation checks for the 2026-08-11 03:44:12 E2E task dispatch."""

import ast
import json
import os
from datetime import datetime
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

import pytest


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-034412.html"
PRIOR_PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-034408.html"
WORKFLOW_TEST = ROOT / "tests" / "test_workflow_e2e.py"
PRIOR_SHA256 = "a47588e380b8497955789988c5df16093d6f48e41fb916ba726de1d9e39c7581"
SOURCE_SHA256 = "3f8779c5b95228e84afedb0bca34aa11bc172ae8948b55063966cbc85674b827"
BASE_URL = os.environ.get("VO_TEST_URL", "http://127.0.0.1:8090")
LIVE_PAGE = f"{BASE_URL}/e2e-task1-dispatch-2026-08-11-034412.html"


class ContinuationPageParser(HTMLParser):
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
    parser = ContinuationPageParser()
    parser.feed(source if source is not None else PAGE.read_text(encoding="utf-8"))
    for element in parser.elements.values():
        element["text"] = " ".join(" ".join(element.pop("text_parts")).split())
    return parser


def literal_dict_fields(node):
    assert isinstance(node, ast.Dict)
    fields = {}
    for key_node, value_node in zip(node.keys, node.values):
        try:
            fields[ast.literal_eval(key_node)] = ast.literal_eval(value_node)
        except (ValueError, TypeError):
            continue
    return fields


def workflow_contract():
    tree = ast.parse(WORKFLOW_TEST.read_text(encoding="utf-8"))
    task_payload = None
    final_review = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and len(node.args) >= 2 and isinstance(node.args[1], ast.Dict):
            payload = literal_dict_fields(node.args[1])
            if payload.get("title") == "E2E Test Task 1":
                task_payload = payload
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id == "all_pass_data":
                final_review = [literal_dict_fields(item) for item in node.value.elts]
    assert task_payload is not None
    assert final_review is not None
    return task_payload, final_review


def test_continuation_metadata_matches_the_second_dispatch():
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
        "data-original-dispatch": "2026-08-11T03:44:08.522032+00:00",
        "data-backlog-return": "2026-08-11T03:44:12.576602+00:00",
        "data-dispatch": "2026-08-11T03:44:12.608084+00:00",
        "data-continuation-recorded": "2026-08-11T03:55:27.602005+00:00",
        "data-continuation-of": "2026-08-11T03:44:08.522032+00:00",
        "data-reuses-prior-evidence": "true",
        "data-prior-evidence-sha256": PRIOR_SHA256,
        "data-source-sha256": SOURCE_SHA256,
        "data-workflow-state": "redispatched-and-verified",
        "data-source-test": "tests/test_workflow_e2e.py",
    }


def test_work_log_events_are_chronological():
    attrs = parsed_page().elements["verification"]["attrs"]
    timeline = [
        datetime.fromisoformat(attrs[name])
        for name in (
            "data-task-created",
            "data-original-dispatch",
            "data-backlog-return",
            "data-dispatch",
            "data-continuation-recorded",
        )
    ]
    assert timeline == sorted(timeline)
    assert len(set(timeline)) == len(timeline)
    assert attrs["data-continuation-of"] == attrs["data-original-dispatch"]


def test_prior_evidence_and_source_contract_are_digest_linked():
    assert sha256(PRIOR_PAGE.read_bytes()).hexdigest() == PRIOR_SHA256
    assert sha256(WORKFLOW_TEST.read_bytes()).hexdigest() == SOURCE_SHA256
    root = parsed_page().elements["verification"]
    assert root["attrs"]["data-reuses-prior-evidence"] == "true"
    assert PRIOR_SHA256 in parsed_page().elements["audit-record"]["text"]


def test_source_contract_still_defines_both_items_and_final_passes():
    task_payload, final_review = workflow_contract()
    assert task_payload["description"] == "This is a test task for E2E verification"
    assert task_payload["assignee"] == "main"
    assert task_payload["priority"] == "high"
    assert task_payload["checklist"] == [
        {"text": "Verify item A", "done": False},
        {"text": "Verify item B", "done": False},
    ]
    assert [(item["text"], item["status"]) for item in final_review] == [
        ("Verify item A", "pass"),
        ("Verify item B", "pass"),
    ]


@pytest.mark.parametrize("element_id,item_name", [
    ("verify-item-a", "Verify item A"),
    ("verify-item-b", "Verify item B"),
])
def test_named_checklist_item_remains_explicitly_passed(element_id, item_name):
    item = parsed_page().elements[element_id]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence"] == "prior-dispatch-and-source-contract"
    assert item["text"] == f"{item_name} PASS"


def test_live_mount_serves_the_page_and_read_only_product_checks_pass():
    with urlopen(LIVE_PAGE, timeout=10) as response:
        served_source = response.read().decode("utf-8")
        assert response.status == 200
        assert response.headers.get_content_type() == "text/html"
    assert served_source == PAGE.read_text(encoding="utf-8")
    served_page = parsed_page(served_source)
    assert served_page.elements["continuation-status"]["text"] == "Both checklist items remain verified"

    with urlopen(f"{BASE_URL}/health", timeout=10) as response:
        health = json.load(response)
        assert response.status == 200
    with urlopen(f"{BASE_URL}/api/projects", timeout=10) as response:
        projects = json.load(response)
        assert response.status == 200
    assert health == {"ok": True, "status": "running"}
    assert projects["ok"] is True
    assert isinstance(projects["projects"], list)
