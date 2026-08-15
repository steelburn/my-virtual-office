"""Contract checks for the E2E Test Task 1 browser evidence page."""

import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen


PAGE = Path(__file__).resolve().parents[1] / "app" / "e2e-task1-verification.html"
LIVE_PAGE = os.environ.get(
    "E2E_TASK1_URL", "http://127.0.0.1:8090/e2e-task1-verification.html"
)


class VerificationPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = {}
        self._current_id = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self._current_id = element_id
            self._text = []
            self.elements[element_id] = {"tag": tag, "attrs": attributes, "text": ""}

    def handle_data(self, data):
        if self._current_id:
            self._text.append(data)

    def handle_endtag(self, tag):
        if self._current_id and self.elements[self._current_id]["tag"] == tag:
            self.elements[self._current_id]["text"] = " ".join("".join(self._text).split())
            self._current_id = None
            self._text = []


def parsed_page():
    parser = VerificationPageParser()
    parser.feed(PAGE.read_text(encoding="utf-8"))
    return parser


def test_verification_page_exists_and_records_overall_pass():
    assert PAGE.is_file()
    assert '<link rel="icon" href="data:image/svg+xml,' in PAGE.read_text(encoding="utf-8")
    root = parsed_page().elements["verification"]
    assert root["attrs"]["data-project"] == "E2E-Test-Pipeline"
    assert root["attrs"]["data-task"] == "E2E Test Task 1"
    assert root["attrs"]["data-result"] == "pass"
    assert root["attrs"]["data-dispatch"] == "2026-08-08T05:06:27.374060+00:00"
    assert root["attrs"]["data-served-route"] == "/e2e-task1-verification.html"


def test_verification_page_records_current_dispatch():
    dispatch = parsed_page().elements["dispatch-record"]
    assert "2026-08-08 05:06:27 UTC" in dispatch["text"]
    assert "9/9 assertions passed" in dispatch["text"]
    assert "Live route verification: HTTP 200" in dispatch["text"]


def test_verify_item_a_passes():
    item = parsed_page().elements["verify-item-a"]
    assert item["attrs"]["data-result"] == "pass"
    assert "Verify item A" in item["text"]
    assert "PASS" in item["text"]


def test_verify_item_b_passes():
    item = parsed_page().elements["verify-item-b"]
    assert item["attrs"]["data-result"] == "pass"
    assert "Verify item B" in item["text"]
    assert "PASS" in item["text"]


def test_live_server_serves_the_verified_page():
    with urlopen(LIVE_PAGE, timeout=10) as response:
        served_page = response.read().decode("utf-8")
        content_type = response.headers.get_content_type()

    assert response.status == 200
    assert content_type == "text/html"
    assert served_page == PAGE.read_text(encoding="utf-8")
