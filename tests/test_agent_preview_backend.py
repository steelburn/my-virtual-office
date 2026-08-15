import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


_SERVER_DATA_DIR = tempfile.TemporaryDirectory(prefix="vo-preview-server-")
(Path(_SERVER_DATA_DIR.name) / "openclaw").mkdir()
os.environ.setdefault("VO_STATUS_DIR", _SERVER_DATA_DIR.name)
os.environ.setdefault("VO_CONFIG", str(Path(_SERVER_DATA_DIR.name) / "vo-config.json"))
os.environ.setdefault("VO_OPENCLAW_PATH", str(Path(_SERVER_DATA_DIR.name) / "openclaw"))
os.environ.setdefault("VO_CODEX_INCLUDE_NATIVE_AGENTS", "0")
os.environ.setdefault("VO_CLAUDE_CODE_INCLUDE_NATIVE_AGENTS", "0")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = PROJECT_ROOT / "app"
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

import server  # noqa: E402


class AgentPreviewBackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vo-preview-")
        self.root = Path(self.temp.name) / "workspace"
        self.root.mkdir()
        self.agent = {
            "id": "test-agent", "statusKey": "test-agent", "providerKind": "test-sdk", "workspace": str(self.root),
        }
        server._agent_preview_records.clear()
        server._agent_preview_serial = 0

    def tearDown(self):
        self.temp.cleanup()

    def agent_patch(self):
        return mock.patch.object(server, "_find_agent_record", return_value=self.agent)

    def test_settings_normalization(self):
        self.assertEqual({"displayMode": "consistent", "size": "large", "contentZoom": 100}, server._normalize_preview_bubble_settings(None))
        self.assertEqual({"displayMode": "world", "size": "small", "contentZoom": 200}, server._normalize_preview_bubble_settings({
            "displayMode": "world", "size": "small", "contentZoom": 450,
        }))

    def test_descriptor_supports_files_and_workdirs(self):
        project = self.root / "project" / "site"
        project.mkdir(parents=True)
        (project / "index.html").write_text("<h1>Live work</h1>", encoding="utf-8")
        with self.agent_patch():
            ok, result, status = server.get_agent_preview_descriptor("test-agent", "site/index.html", str(self.root / "project"))
        self.assertTrue(ok)
        self.assertEqual(200, status)
        self.assertEqual("html", result["preview"]["kind"])
        self.assertEqual("project/site/index.html", result["preview"]["path"])
        self.assertTrue(result["preview"]["version"])

    def test_rejects_escape_symlink_secret_and_unsupported(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (outside / "stolen.md").write_text("outside", encoding="utf-8")
        os.symlink(outside, self.root / "escape")
        (self.root / ".env").write_text("TOKEN=DO_NOT_EXPOSE", encoding="utf-8")
        (self.root / "archive.zip").write_bytes(b"PK\x03\x04")
        with self.agent_patch():
            for requested, code in [("../outside/stolen.md", "workspace_escape"), ("escape/stolen.md", "workspace_escape"),
                                    (".env", "sensitive_path"), ("archive.zip", "unsupported_file"), ("/etc/passwd", "workspace_escape")]:
                _full, _descriptor, error = server._resolve_agent_preview_file("test-agent", requested)
                self.assertEqual(code, error["error"]["code"], requested)
                self.assertNotIn("DO_NOT_EXPOSE", str(error))

    def test_type_specific_size_limit(self):
        (self.root / "huge.txt").write_bytes(b"x" * (server.AGENT_PREVIEW_TEXT_MAX_BYTES + 1))
        with self.agent_patch():
            _full, _descriptor, error = server._resolve_agent_preview_file("test-agent", "huge.txt")
        self.assertEqual("file_too_large", error["error"]["code"])
        self.assertEqual(413, error["_status"])

    def test_provider_neutral_publish_and_cursor_feed(self):
        (self.root / "report.md").write_text("# Report\n", encoding="utf-8")
        with self.agent_patch():
            ok, first, status = server.publish_agent_preview({"agentId": "test-agent", "kind": "file", "path": "report.md"})
            self.assertTrue(ok)
            self.assertEqual(201, status)
            ok, second, status = server.publish_agent_preview({"agentId": "test-agent", "kind": "browser"})
            self.assertTrue(ok)
            self.assertEqual(201, status)
        feed = server.list_agent_previews(0)
        self.assertEqual(["file", "browser"], [row["target"]["kind"] for row in feed["previews"]])
        self.assertEqual([], server.list_agent_previews(second["preview"]["serial"])["previews"])
        self.assertGreaterEqual(feed["cursor"], first["preview"]["serial"])

    def test_publish_rejects_unsafe_url(self):
        ok, result, status = server.publish_agent_preview({"agentId": "test-agent", "kind": "url", "url": "javascript:alert(1)"})
        self.assertFalse(ok)
        self.assertEqual(400, status)
        self.assertEqual("invalid_url", result["error"]["code"])


if __name__ == "__main__":
    unittest.main()
