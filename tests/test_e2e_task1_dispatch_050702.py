"""Continuation checks for the 2026-08-08 05:07:02 E2E task dispatch."""

from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-08-050702.html"
PRIOR_PAGE = ROOT / "app" / "e2e-task1-dispatch-2026-08-08-050658.html"
PRIOR_SHA256 = "a9e1cc891a22ab0171da1f491e654d1e2f1bb4163e4bfae89959b5efeadc7252"


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


def parsed_page():
    parser = ContinuationPageParser()
    parser.feed(PAGE.read_text(encoding="utf-8"))
    for element in parser.elements.values():
        element["text"] = " ".join(" ".join(element.pop("text_parts")).split())
    return parser


def test_continuation_metadata_matches_second_dispatch():
    assert PAGE.is_file()
    root = parsed_page().elements["verification"]
    assert root["attrs"]["data-project"] == "E2E-Test-Pipeline"
    assert root["attrs"]["data-task"] == "E2E Test Task 1"
    assert root["attrs"]["data-result"] == "pass"
    assert root["attrs"]["data-dispatch"] == "2026-08-08T05:07:02.164571+00:00"
    assert root["attrs"]["data-continuation-of"] == "2026-08-08T05:06:58.085467+00:00"
    assert root["attrs"]["data-reuses-prior-evidence"] == "true"
    assert "High Priority" in root["text"]


def test_prior_dispatch_evidence_is_intact_and_digest_linked():
    assert PRIOR_PAGE.is_file()
    assert sha256(PRIOR_PAGE.read_bytes()).hexdigest() == PRIOR_SHA256
    audit = parsed_page().elements["audit-record"]
    assert PRIOR_SHA256 in audit["text"]
    assert "4/4 focused tests passed" in audit["text"]
    assert "Destructive workflow driver skipped; no Docker restart" in audit["text"]


def test_verify_item_a_remains_explicitly_passed():
    item = parsed_page().elements["verify-item-a"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence-source"] == "prior-dispatch"
    assert item["text"] == "Verify item A PASS"


def test_verify_item_b_remains_explicitly_passed():
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["attrs"]["data-evidence-source"] == "prior-dispatch"
    assert item["text"] == "Verify item B PASS"
