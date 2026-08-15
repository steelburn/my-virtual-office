#!/usr/bin/env python3
"""Hermes atomic persistence, scoped approvals, reload, and retry tests."""

import json
import os
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock


_BOOT_STATUS = tempfile.TemporaryDirectory(prefix="vo-hermes-state-bootstrap-")
os.environ.setdefault("VO_STATUS_DIR", _BOOT_STATUS.name)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

import server  # noqa: E402


def _agent(agent_id):
    return {
        "id": agent_id,
        "statusKey": agent_id,
        "providerKind": "hermes",
        "profile": "shared",
        "providerAgentId": "shared",
        "connectionId": "connection-one",
        "providerConnectionId": "connection-one",
    }


class HermesStateConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vo-hermes-state-")
        self.status_patch = mock.patch.object(server, "STATUS_DIR", self.temp.name)
        self.status_patch.start()
        with server.HERMES_APPROVAL_LOCK:
            server.HERMES_APPROVAL_PENDING.clear()
        with server.HERMES_ACTIVE_RUNS_LOCK:
            server.HERMES_ACTIVE_RUNS.clear()

    def tearDown(self):
        with server.HERMES_APPROVAL_LOCK:
            server.HERMES_APPROVAL_PENDING.clear()
        with server.HERMES_ACTIVE_RUNS_LOCK:
            server.HERMES_ACTIVE_RUNS.clear()
        self.status_patch.stop()
        self.temp.cleanup()

    def test_concurrent_writers_are_atomic_and_lossless(self):
        profile = "concurrent"
        server._activate_hermes_session(profile, "session-one", [])

        def append(index):
            server._update_hermes_history(
                profile,
                lambda history: history + [{"role": "assistant", "text": f"writer-{index}"}],
            )

        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(append, range(24)))

        state = server._load_hermes_state(profile)
        self.assertEqual(24, len(state["messages"]))
        self.assertEqual({f"writer-{index}" for index in range(24)}, {row["text"] for row in state["messages"]})
        with open(server._hermes_history_path(profile), "r", encoding="utf-8") as handle:
            persisted = json.load(handle)
        self.assertEqual(24, len(persisted["messages"]))

    def test_same_approval_id_is_isolated_by_agent_and_session_and_reloads(self):
        with mock.patch.object(server, "_get_hermes_agent", side_effect=lambda key: _agent(str(key))):
            first = server._remember_hermes_approval_pending(
                {"id": "approval-same", "runId": "run-one"}, "agent-one", "shared", "session-one",
            )
            second = server._remember_hermes_approval_pending(
                {"id": "approval-same", "runId": "run-two"}, "agent-one", "shared", "session-two",
            )
            third = server._remember_hermes_approval_pending(
                {"id": "approval-same", "runId": "run-three"}, "agent-two", "shared", "session-one",
            )
            self.assertEqual("run-one", server._find_hermes_approval_pending("agent-one", "approval-same", "session-one")["runId"])
            self.assertEqual("run-two", server._find_hermes_approval_pending("agent-one", "approval-same", "session-two")["runId"])
            self.assertEqual("run-three", server._find_hermes_approval_pending("agent-two", "approval-same", "session-one")["runId"])

            with server.HERMES_APPROVAL_LOCK:
                server.HERMES_APPROVAL_PENDING.clear()
            reloaded = server._find_hermes_approval_pending("agent-one", "approval-same", "session-two")
            self.assertEqual("run-two", reloaded["runId"])
            resolved = server._resolve_hermes_approval_pending("agent-one", "approval-same", "session-two", "approve_once")
            self.assertEqual("approve_once", resolved["status"])
            self.assertIsNotNone(server._find_hermes_approval_pending("agent-one", "approval-same", "session-one"))
            self.assertIsNotNone(server._find_hermes_approval_pending("agent-two", "approval-same", "session-one"))
            self.assertEqual("pending", first["status"])
            self.assertEqual("pending", second["status"])
            self.assertEqual("pending", third["status"])

    def test_failed_upstream_response_keeps_pending_then_success_resolves(self):
        agent = _agent("agent-one")
        approval = {
            "id": "approval-retry",
            "provider": "hermes-api",
            "runId": "run-retry",
            "session_id": "session-retry",
        }

        class Client:
            calls = 0

            @classmethod
            def respond_approval(cls, _run_id, _choice):
                cls.calls += 1
                if cls.calls == 1:
                    return {"ok": False, "error": "temporary upstream failure"}
                return {"ok": True}

        with mock.patch.object(server, "_get_hermes_agent", return_value=agent), \
             mock.patch.object(server, "_hermes_api_client_for_profile", return_value=Client()):
            server._remember_hermes_approval_pending(approval, "agent-one", "shared", "session-retry")
            body = {
                "agentId": "agent-one", "approvalId": "approval-retry",
                "sessionId": "session-retry", "choice": "approve_once",
            }
            failed = server._handle_hermes_approval_respond(body)
            self.assertFalse(failed["ok"])
            self.assertIsNotNone(server._find_hermes_approval_pending("agent-one", "approval-retry", "session-retry"))
            succeeded = server._handle_hermes_approval_respond(body)
            self.assertTrue(succeeded["ok"])
            self.assertIsNone(server._find_hermes_approval_pending("agent-one", "approval-retry", "session-retry"))
            mirror = server._load_chat_session_mirror("hermes", "shared", "session-retry")
            cards = [row["approval"] for row in mirror if isinstance(row.get("approval"), dict)]
            self.assertIn("approved", cards[-1]["status"])

    def test_approval_and_interrupt_reuse_the_run_pinned_endpoint(self):
        agent = _agent("agent-one")
        endpoint = "https://hermes.example.test/profile/shared"
        approval = {
            "id": "approval-pinned", "provider": "hermes-api", "runId": "run-pinned",
            "session_id": "session-pinned",
        }
        server._remember_hermes_active_run({
            "runId": "run-pinned", "agentId": "agent-one", "profile": "shared",
            "sessionId": "session-pinned", "apiEndpointUrl": endpoint,
        })
        client = mock.Mock()
        client.respond_approval.return_value = {"ok": True}
        client.stop_run.return_value = {"ok": True}
        with mock.patch.object(server, "_get_hermes_agent", return_value=agent), \
             mock.patch.object(server, "_hermes_api_client_for_profile", return_value=client) as client_factory:
            server._remember_hermes_approval_pending(approval, "agent-one", "shared", "session-pinned")
            responded = server._handle_hermes_approval_respond({
                "agentId": "agent-one", "approvalId": "approval-pinned",
                "sessionId": "session-pinned", "choice": "approve_once",
            })
            interrupted = server._handle_hermes_interrupt({"agentId": "agent-one", "runId": "run-pinned"})

        self.assertTrue(responded["ok"])
        self.assertTrue(interrupted["ok"])
        self.assertEqual(2, client_factory.call_count)
        for call in client_factory.call_args_list:
            self.assertEqual(endpoint, call.kwargs["endpoint_url"])
        client.respond_approval.assert_called_once_with("run-pinned", "once")
        client.stop_run.assert_called_once_with("run-pinned")

    def test_terminal_run_expires_pending_card_durably(self):
        agent = _agent("agent-one")
        approval = {
            "id": "approval-expire", "provider": "hermes-api", "runId": "run-expire",
            "session_id": "session-expire",
        }
        with mock.patch.object(server, "_get_hermes_agent", return_value=agent):
            server._remember_hermes_approval_pending(approval, "agent-one", "shared", "session-expire")
            expired = server._expire_hermes_run_approvals(
                "agent-one", "shared", "session-expire", "run-expire",
            )
            self.assertEqual(1, len(expired))
            self.assertEqual("expired", expired[0]["status"])
            self.assertIsNone(server._find_hermes_approval_pending("agent-one", "approval-expire", "session-expire"))
            mirror = server._load_chat_session_mirror("hermes", "shared", "session-expire")
            cards = [row["approval"] for row in mirror if isinstance(row.get("approval"), dict)]
            self.assertEqual("expired", cards[-1]["status"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
