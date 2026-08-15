import os
import sys
import tempfile
import unittest
from unittest import mock


APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app"))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from providers import codex


class _FakeClient:
    def __init__(self, provider, cwd, timeout_sec):
        self.provider = provider
        self.cwd = cwd
        self.timeout_sec = timeout_sec
        self.profile = ""
        self.thread_id = ""
        self.turn_id = ""
        self.approval_callback = None
        self.closed = False
        self.messages = []

    def initialize(self):
        return {"result": {}}

    def request(self, method, params=None, **kwargs):
        if method == "thread/start":
            return {"result": {"thread": {"id": "thread-stream-test"}}}
        if method == "thread/resume":
            return {"result": {"thread": {"id": params["threadId"]}}}
        if method == "turn/start":
            return {"result": {"turn": {"id": "turn-stream-test"}}}
        raise AssertionError(method)

    def next_message(self, timeout=0.5):
        return self.messages.pop(0) if self.messages else None

    def poll(self):
        return None

    def stderr_text(self):
        return ""

    def interrupt(self):
        return {"ok": True}

    def handle_server_request(self, msg):
        return False

    def close(self):
        self.closed = True


class CodexStreamAdapterTests(unittest.TestCase):
    def test_start_stream_returns_live_reader_and_normalizes_terminal_event(self):
        with tempfile.TemporaryDirectory() as workspace:
            provider = codex.CodexProvider(
                binary="/bin/true",
                workspace_root=workspace,
                main_workspace=workspace,
            )
            with mock.patch.object(codex, "CodexAppServerClient", _FakeClient):
                run = provider.start_chat_stream("main", "Reply once")
            self.assertIsInstance(run, codex.CodexAppStreamRun)
            self.assertEqual(run.thread_id, "thread-stream-test")
            self.assertEqual(run.turn_id, "turn-stream-test")
            run.client.messages.extend([
                {
                    "method": "item/agentMessage/delta",
                    "params": {"threadId": run.thread_id, "turnId": run.turn_id, "delta": "done"},
                },
                {
                    "method": "turn/completed",
                    "params": {
                        "threadId": run.thread_id,
                        "turnId": run.turn_id,
                        "turn": {"id": run.turn_id, "status": "completed", "items": []},
                    },
                },
            ])
            delta = run.next_event()
            terminal = run.next_event()
            self.assertEqual(delta["event"], "message.delta")
            self.assertEqual(delta["delta"], "done")
            self.assertEqual(terminal["event"], "run.completed")
            self.assertTrue(terminal["ok"])
            self.assertEqual(terminal["reply"], "done")
            run.close()
            self.assertTrue(run.client.closed)

    def test_state_preserves_token_usage_in_stream_events(self):
        state = codex.CodexAppRunState()
        msg = {
            "method": "thread/tokenUsage/updated",
            "params": {"threadId": "thread-1", "tokenUsage": {"total": {"totalTokens": 42}}},
        }
        state.handle_message(msg)
        event = state.event_from_message(msg)
        self.assertEqual(event["event"], "usage.updated")
        self.assertEqual(event["tokenUsage"]["total"]["totalTokens"], 42)


if __name__ == "__main__":
    unittest.main()
