"""Contract checks for the 2026-08-08 05:06:58 E2E task dispatch artifact."""

from html.parser import HTMLParser
from pathlib import Path


PAGE = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "e2e-task1-dispatch-2026-08-08-050658.html"
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


def parsed_page():
    parser = DispatchPageParser()
    parser.feed(PAGE.read_text(encoding="utf-8"))
    for element in parser.elements.values():
        element["text"] = " ".join(" ".join(element.pop("text_parts")).split())
    return parser


def test_dispatch_metadata_matches_assignment():
    assert PAGE.is_file()
    root = parsed_page().elements["verification"]
    assert root["attrs"]["data-project"] == "E2E-Test-Pipeline"
    assert root["attrs"]["data-task"] == "E2E Test Task 1"
    assert root["attrs"]["data-result"] == "pass"
    assert root["attrs"]["data-dispatch"] == "2026-08-08T05:06:58.085467+00:00"
    assert "High Priority" in root["text"]


def test_verify_item_a_is_explicitly_passed():
    item = parsed_page().elements["verify-item-a"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["text"] == "Verify item A PASS"


def test_verify_item_b_is_explicitly_passed():
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert item["text"] == "Verify item B PASS"


def test_dispatch_page_records_runtime_evidence():
    text = PAGE.read_text(encoding="utf-8")
    assert "9/9 assertions passed" in text
    assert "Product health</dt><dd>HTTP 200" in text
    assert "Projects API</dt><dd>HTTP 200" in text
