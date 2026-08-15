from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHAT_JS = (ROOT / "app" / "chat.js").read_text(encoding="utf-8")
STYLE_CSS = (ROOT / "app" / "style.css").read_text(encoding="utf-8")
INDEX_HTML = (ROOT / "app" / "index.html").read_text(encoding="utf-8")


def test_mobile_chat_does_not_globally_freeze_the_office_page():
    assert "chat-mobile-scroll-locked" not in CHAT_JS
    assert "chat-mobile-scroll-locked" not in STYLE_CSS
    assert "--chat-mobile-scroll-offset" not in STYLE_CSS


def test_mobile_chat_contains_only_boundary_gestures():
    assert "function installMobileChatTouchContainment(root)" in CHAT_JS
    assert "const wouldLeaveSurface" in CHAT_JS
    assert "if (wouldLeaveSurface && event.cancelable) event.preventDefault();" in CHAT_JS
    assert "installMobileChatTouchContainment(this.root);" in CHAT_JS


def test_mobile_chat_keeps_native_scrolling_inside_scroll_surfaces():
    assert "MOBILE_CHAT_SCROLL_SURFACE_SELECTOR" in CHAT_JS
    assert ".chat-messages, .chat-sessions-list, .chat-input" in CHAT_JS
    assert "event.stopPropagation();" in CHAT_JS


def test_mobile_chat_does_not_autofocus_the_composer():
    assert "if (!shouldUseSingleWindowMobileLayout()) primaryWindow.input.focus();" in CHAT_JS
    assert "if (!shouldUseSingleWindowMobileLayout()) windowInstance?.input?.focus();" in CHAT_JS


def test_mobile_resize_closes_desktop_secondary_windows():
    assert "function enforceSingleWindowMobileLayout()" in CHAT_JS
    assert "setSecondaryPanelOpen(slotNum, false);" in CHAT_JS
    resize_block = CHAT_JS.split("function _syncChatLayoutAfterViewportResize()", 1)[1]
    assert "enforceSingleWindowMobileLayout();" in resize_block.split("window.addEventListener('resize'", 1)[0]


def test_mobile_scroll_region_assets_are_cache_busted_together():
    assert 'style.css?v=20260814-provider-markdown-1' in INDEX_HTML
    assert 'chat.js?v=20260814-agent-preview-r1' in INDEX_HTML
