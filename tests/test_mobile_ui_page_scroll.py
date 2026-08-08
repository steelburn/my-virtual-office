from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI_CSS = (ROOT / "app" / "ui-modern.css").read_text(encoding="utf-8")


def _mobile_block():
    return UI_CSS.split("@media (max-width: 900px)", 1)[1]


def test_mobile_uses_one_document_scroller():
    mobile = _mobile_block()
    assert "html {\n    overflow-y: auto;" in mobile
    assert "body {\n    min-height: 100dvh;\n    overflow: visible;" in mobile


def test_mobile_ui_owns_native_vertical_page_gestures():
    mobile = _mobile_block()
    assert ".toolbar,\n  .sidebar {\n    touch-action: pan-y;" in mobile
    assert "body {\n    min-height: 100dvh;\n    overflow: visible;\n    touch-action: pan-y;" in mobile
