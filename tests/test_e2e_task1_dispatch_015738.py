"""Continuation checks for the 2026-08-11 01:57:38 E2E task dispatch."""

import os
from datetime import datetime
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-015738.html"
PRIOR_PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-11-015734.html"
PRIOR_SHA256 = "9b29e08a48ed3c914decdf753e381e23c2f799320c543d4806d0619bde90d2d6"
LIVE_PAGE = os.environ.get(
    "E2E_TASK1_CONTINUATION_URL",
    "http://127.0.0.1:8090/e2e-task1-dispatch-2026-08-11-015738.html",
)


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
        "data-task-created": "2026-08-11T01:57:34.343322+00:00",
        "data-original-dispatch": "2026-08-11T01:57:34.365343+00:00",
        "data-backlog-return": "2026-08-11T01:57:38.421193+00:00",
        "data-dispatch": "2026-08-11T01:57:38.449516+00:00",
        "data-continuation-of": "2026-08-11T01:57:34.365343+00:00",
        "data-reuses-prior-evidence": "true",
        "data-prior-evidence-sha256": PRIOR_SHA256,
        "data-workflow-state": "redispatched",
        "data-source-test": "tests/test_workflow_e2e.py",
    }


def test_work_log_events_are_chronological():
    attrs = parsed_page().elements["verification"]["attrs"]
    created = datetime.fromisoformat(attrs["data-task-created"])
    original_dispatch = datetime.fromisoformat(attrs["data-original-dispatch"])
    backlog_return = datetime.fromisoformat(attrs["data-backlog-return"])
    continuation_dispatch = datetime.fromisoformat(attrs["data-dispatch"])
    assert created < original_dispatch < backlog_return < continuation_dispatch
    assert attrs["data-continuation-of"] == attrs["data-original-dispatch"]


def test_prior_dispatch_evidence_is_intact_and_digest_linked():
    assert PRIOR_PAGE.is_file()
    assert sha256(PRIOR_PAGE.read_bytes()).hexdigest() == PRIOR_SHA256
    root = parsed_page().elements["verification"]
    audit = parsed_page().elements["audit-record"]
    assert root["attrs"]["data-reuses-prior-evidence"] == "true"
    assert root["attrs"]["data-prior-evidence-sha256"] == PRIOR_SHA256
    assert PRIOR_SHA256 in audit["text"]
    assert "Destructive workflow driver skipped" in audit["text"]


def test_verify_item_a_remains_explicitly_passed():
    item = parsed_page().elements["verify-item-a"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence-source"] == "prior-dispatch-and-source-contract"
    assert item["text"] == "Verify item A PASS"


def test_verify_item_b_remains_explicitly_passed():
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence-source"] == "prior-dispatch-and-source-contract"
    assert item["text"] == "Verify item B PASS"


def test_live_mount_serves_the_exact_accessible_continuation_page():
    with urlopen(LIVE_PAGE, timeout=10) as response:
        served_source = response.read().decode("utf-8")
        status = response.status
        content_type = response.headers.get_content_type()

    assert status == 200
    assert content_type == "text/html"
    assert served_source == PAGE.read_text(encoding="utf-8")
    page = parsed_page(served_source)
    continuation_status = page.elements["continuation-status"]
    assert continuation_status["attrs"]["role"] == "status"
    assert continuation_status["attrs"]["aria-label"] == "Continuation verification passed"
    assert continuation_status["text"] == "Continuation verification passed"
