import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
os.environ.setdefault("VO_STATUS_DIR", tempfile.mkdtemp(prefix="vo-hermes-tests-"))
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

import server  # noqa: E402
from providers.hermes import HermesProvider  # noqa: E402
from providers.registry import ProviderManifest  # noqa: E402


class FakeHistoryClient:
    def __init__(self, rows=None, fail=False):
        self.rows = rows or []
        self.fail = fail
        self.starts = []

    def is_available(self):
        return True

    def session_messages(self, session_id, limit=500, offset=0, order="oldest"):
        if self.fail:
            raise RuntimeError("history endpoint offline")
        return {"data": self.rows, "session_id": session_id}

    def start_run(self, message, **kwargs):
        self.starts.append((message, kwargs))
        return {"run_id": "real-looking-run-id"}


class FakeApprovalClient(FakeHistoryClient):
    def stream_run_events(self, run_id, timeout_sec=None):
        yield {
            "event": "approval.request",
            "run_id": run_id,
            "tool": "terminal",
            "command": "release-proof",
            "description": "Approval integration proof",
            "choices": ["once", "deny"],
        }

    def respond_approval(self, run_id, choice):
        self.approval_response = (run_id, choice)
        return {"run_id": run_id, "status": "cancelled" if choice == "deny" else "running"}


class ManifestRegistry:
    def __init__(self, manifest):
        self.value = manifest

    def manifest(self, _kind):
        return self.value


class HermesProductionIntegrationTests(unittest.TestCase):
    def test_balanced_api_slot_uses_gateway_sessions_and_keeps_cli_only_support(self):
        balanced = {
            "profile": "aster",
            "record": {
                "providerAgentId": "aster",
                "providerConnectionId": "aster",
                "localProfile": "default",
                "connectionModes": ["cli", "api"],
            },
        }
        cli_only = {
            "profile": "default",
            "record": {"providerAgentId": "default", "connectionModes": ["cli"]},
        }

        self.assertFalse(server._hermes_agent_ref_uses_local_sessions(balanced))
        self.assertTrue(server._hermes_agent_ref_uses_local_sessions(cli_only))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_native_history_keeps_three_reasoning_blocks_four_tools_and_results(self):
        session = {
            "id": "20260813_181512_528657",
            "title": "Hermes update",
            "messages": [
                {"id": "u1", "role": "user", "content": "Hey any updates on Hermes", "timestamp": "2026-08-13T18:15:12Z"},
                {
                    "id": "a1", "role": "assistant", "content": "",
                    "reasoning_content": "Planning updates clarification",
                    "timestamp": "2026-08-13T18:15:13Z",
                    "tool_calls": [{"id": "call-skill", "function": {"name": "skill_view", "arguments": "{\"name\":\"hermes\"}"}}],
                },
                {"id": "t1", "role": "tool", "tool_call_id": "call-skill", "content": "Hermes skill details", "timestamp": "2026-08-13T18:15:14Z"},
                {
                    "id": "a2", "role": "assistant", "content": "",
                    "reasoning_content": "Planning version retrieval via GitHub API",
                    "timestamp": "2026-08-13T18:15:15Z",
                    "tool_calls": [
                        {"id": "call-version", "function": {"name": "terminal", "arguments": "{\"command\":\"hermes --version\"}"}},
                        {"id": "call-releases", "function": {"name": "terminal", "arguments": "{\"command\":\"curl releases\"}"}},
                        {"id": "call-status", "function": {"name": "terminal", "arguments": "{\"command\":\"git status\"}"}},
                    ],
                },
                {"id": "t2", "role": "tool", "tool_call_id": "call-version", "content": "{\"exit_code\":127,\"error\":\"command not found\"}", "timestamp": "2026-08-13T18:15:16Z"},
                {"id": "t3", "role": "tool", "tool_call_id": "call-releases", "content": "{\"exit_code\":0,\"stdout\":\"v0.9.0\"}", "timestamp": "2026-08-13T18:15:17Z"},
                {"id": "t4", "role": "tool", "tool_call_id": "call-status", "content": "{\"exit_code\":0,\"stdout\":\"clean\"}", "timestamp": "2026-08-13T18:15:18Z"},
                {
                    "id": "a3", "role": "assistant", "content": "Hermes is current and healthy.",
                    "reasoning_content": "Comparing installed and released versions\nPreparing concise update",
                    "timestamp": "2026-08-13T18:15:19Z",
                },
            ],
        }
        rows = server._hermes_session_to_chat_messages(session, {"name": "Aster"})

        self.assertEqual(3, sum(1 for row in rows if row.get("thinking")))
        tools = [tool for row in rows for tool in row.get("tools", [])]
        self.assertEqual(4, len(tools))
        self.assertTrue(all(tool.get("result") for tool in tools))
        self.assertEqual("error", next(tool for tool in tools if tool["id"] == "call-version")["status"])
        self.assertEqual("Hermes is current and healthy.", rows[-1]["text"])
        self.assertEqual("a3", rows[-1]["id"])
        self.assertTrue(all(isinstance(row["ts"], int) for row in rows))

    def test_tool_completion_and_sse_replay_keep_start_command_details(self):
        started = server._hermes_event_tool_card({
            "event": "tool.started", "tool": "terminal",
            "preview": "printf VO_KEEP_ARGUMENTS",
        }, "running", fallback_id="tool-one")
        completed = server._hermes_event_tool_card({
            "event": "tool.completed", "tool": "terminal", "duration": 0.1,
        }, "done", fallback_id="tool-one")
        merged = server._merge_hermes_tool_card(started, completed)
        self.assertEqual("printf VO_KEEP_ARGUMENTS", merged["arguments"]["command"])
        self.assertEqual("printf VO_KEEP_ARGUMENTS", merged["args_preview"])
        self.assertEqual("done", merged["status"])

        meta = {"runtime": server._native_run_runtime()}
        payload = {"toolCard": started}
        server._native_run_emit(meta, "tool.started", payload)
        started["status"] = "done"
        self.assertEqual("running", meta["runtime"]["events"][0]["data"]["toolCard"]["status"])

    def test_completed_session_fetch_uses_authoritative_tool_result(self):
        client = FakeHistoryClient([
            {"id": "a1", "session_id": "session-rich", "role": "assistant", "content": "", "timestamp": 1,
             "tool_calls": [{"id": "call-rich", "function": {"name": "terminal", "arguments": "{\"command\":\"printf rich\"}"}}]},
            {"id": "t1", "session_id": "session-rich", "role": "tool", "tool_call_id": "call-rich", "tool_name": "terminal",
             "content": "{\"output\":\"rich\",\"exit_code\":0}", "timestamp": 2},
            {"id": "a2", "session_id": "session-rich", "role": "assistant", "content": "done", "timestamp": 3},
        ])
        rows = server._fetch_hermes_native_session_history(client, "session-rich", {"name": "Aster"})
        tool = next(tool for row in rows for tool in row.get("tools", []))
        self.assertIn("rich", tool["result"])
        self.assertEqual("printf rich", tool["arguments"]["command"])

    def test_new_native_run_does_not_resume_tracked_session(self):
        client = FakeHistoryClient([])
        agent = {"id": "hermes-test", "capabilities": {"sessionSwitch": True}}
        with mock.patch.object(server, "_get_hermes_session_id", return_value="tracked-old"):
            session_id, history = server._prepare_hermes_run_context(
                client, agent, "test", current_prompt="fresh", force_new=True,
            )
        self.assertNotEqual("tracked-old", session_id)
        self.assertTrue(session_id.startswith("vo-hermes-test-"))
        self.assertIsNone(history)
        self.assertEqual([], client.starts)

    def test_hermes_session_list_preserves_native_metadata(self):
        class Client:
            def list_sessions(self, limit=40):
                return {"data": [{
                    "id": "session-meta", "title": "Metadata proof",
                    "last_active": "2026-08-14T04:00:00Z",
                    "started_at": "2026-08-14T03:00:00Z",
                    "message_count": 14, "tool_call_count": 4, "model": "test-model",
                }]}

        agent_ref = {"profile": "aster", "record": {"providerAgentId": "aster"}}
        with mock.patch.object(server, "_hermes_api_client_for_profile", return_value=Client()), \
             mock.patch.object(server, "_get_hermes_session_id", return_value="session-meta"):
            payload = server._chat_sessions_list_hermes(agent_ref)
        row = payload["sessions"][0]
        self.assertEqual("2026-08-14T04:00:00Z", row["updatedAt"])
        self.assertEqual(14, row["messageCount"])
        self.assertEqual(4, row["toolCallCount"])
        self.assertEqual("test-model", row["model"])
        self.assertTrue(row["active"])

    def test_history_normalization_structured_rows_bounds_and_duplicate_prompt(self):
        rows = [
            {"role": "system", "content": "internal"},
            {"role": "tool", "content": "protocol"},
            {"role": "user", "content": [{"type": "text", "text": "first"}]},
            {"role": "assistant", "content": {"content": [{"text": "second"}]}},
            {"role": "assistant", "content": ""},
            {"role": "user", "content": "CURRENT"},
        ]
        client = FakeHistoryClient(rows)
        with mock.patch.object(server, "VO_CONFIG", {"hermes": {
            "runHistoryMaxMessages": 3,
            "runHistoryMaxChars": 4000,
            "runHistoryMaxMessageChars": 1000,
        }}):
            history, resolved = server._load_hermes_run_conversation_history(
                client, "same-session", require_history=True, current_prompt="CURRENT"
            )
        self.assertEqual(resolved, "same-session")
        self.assertEqual(history, [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
        ])
        self.assertNotIn("internal", str(history))
        self.assertNotIn("protocol", str(history))

    def test_history_limits_keep_only_the_newest_bounded_context(self):
        rows = [
            {"role": "user", "content": "oldest"},
            {"role": "assistant", "content": "middle-" + ("x" * 5000)},
            {"role": "user", "content": "newest"},
        ]
        with mock.patch.object(server, "VO_CONFIG", {"hermes": {
            "runHistoryMaxMessages": 2,
            "runHistoryMaxChars": 4000,
            "runHistoryMaxMessageChars": 6000,
        }}):
            history, _ = server._load_hermes_run_conversation_history(
                FakeHistoryClient(rows), "bounded-session", require_history=True
            )
        self.assertEqual(history, [{"role": "user", "content": "newest"}])
        self.assertNotIn("oldest", str(history))

    def test_selected_existing_session_is_hydrated_before_run_submission(self):
        client = FakeHistoryClient([
            {"role": "user", "content": "nonce VO-NONCE-123"},
            {"role": "assistant", "content": "acknowledged VO-NONCE-123"},
        ])
        agent = {
            "id": "hermes-test", "profile": "test", "connectionId": "test",
            "capabilities": {"sessionSwitch": True},
        }
        with mock.patch.object(server, "_get_hermes_agent", return_value=agent), \
             mock.patch.object(server, "_hermes_api_client_for_profile", return_value=client), \
             mock.patch.object(server, "_get_hermes_session_id", return_value="tracked-wrong"), \
             mock.patch.object(server, "_load_hermes_history", return_value=[]), \
             mock.patch.object(server, "_save_hermes_history"), \
             mock.patch.object(server, "_remember_hermes_active_run"), \
             mock.patch.object(server, "_set_hermes_session_id"), \
             mock.patch.object(server, "_publish_hermes_api_progress"):
            result = server._handle_hermes_run_start({
                "agentId": "hermes-test",
                "sessionId": "selected-same-session",
                "message": "What token did I ask you to remember?",
            })
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["sessionId"], "selected-same-session")
        self.assertEqual(client.starts[0][1]["session_id"], "selected-same-session")
        self.assertEqual(client.starts[0][1]["conversation_history"][0]["content"], "nonce VO-NONCE-123")

    def test_history_failure_prevents_submission_and_has_no_fallback(self):
        client = FakeHistoryClient(fail=True)
        agent = {"id": "hermes-test", "profile": "test", "capabilities": {"sessionSwitch": True}}
        with mock.patch.object(server, "_get_hermes_agent", return_value=agent), \
             mock.patch.object(server, "_hermes_api_client_for_profile", return_value=client), \
             mock.patch.object(server, "_get_hermes_session_id", return_value="existing"), \
             mock.patch.object(server, "_save_hermes_history") as save_history:
            result = server._handle_hermes_run_start({"agentId": "hermes-test", "message": "next"})
        self.assertEqual(result["code"], "session_history_unavailable")
        self.assertFalse(result["fallback"])
        self.assertEqual(client.starts, [])
        save_history.assert_not_called()

    def test_session_switch_accepts_successful_documented_messages_response(self):
        class Client:
            def get_session(self, session_id):
                return {"session": {"id": session_id, "title": "Continuity"}}

            def session_messages(self, session_id, limit=500, order="oldest"):
                return {
                    "data": [
                        {"role": "user", "content": "Remember VO-SWITCH-7"},
                        {"role": "assistant", "content": "ACK VO-SWITCH-7"},
                    ],
                    "session_id": session_id,
                    "_status": 200,
                }

        agent = {
            "id": "hermes-test", "statusKey": "hermes-test", "providerKind": "hermes",
            "profile": "test", "providerAgentId": "test", "name": "Hermes Test",
            "connectionModes": ["api"], "capabilities": {"sessionSwitch": True},
        }
        with mock.patch.object(server, "_chat_sessions_agent", return_value={
            "agentId": "hermes-test", "providerKind": "hermes", "profile": "test",
            "name": "Hermes Test", "record": agent,
        }), mock.patch.object(server, "_hermes_api_client_for_profile", return_value=Client()), \
             mock.patch.object(server, "_save_hermes_state"), \
             mock.patch.object(server, "_save_provider_history"), \
             mock.patch.object(server, "_save_provider_active_session"):
            result, status = server.handle_chat_session_switch("hermes-test", "same-session")
        self.assertEqual(status, 200)
        self.assertTrue(result["ok"])
        self.assertEqual(result["sessionId"], "same-session")
        self.assertEqual(result["sessionKey"], "hermes:test:same-session")
        self.assertEqual([row["text"] for row in result["messages"]], [
            "Remember VO-SWITCH-7", "ACK VO-SWITCH-7",
        ])

    def test_manual_session_selection_survives_timestamp_free_native_list(self):
        agent = {
            "id": "hermes-test", "statusKey": "hermes-test",
            "providerKind": "hermes", "providerAgentId": "test",
            "capabilities": {"sessions": True},
        }
        listed = {
            "ok": True,
            "sessions": [
                {"id": "newest-without-timestamp", "title": "Newest"},
                {"id": "selected-session", "title": "Selected"},
            ],
        }
        for source in ("manual-switch", "new-session", "sdk-run"):
            selected = {
                "providerKind": "hermes", "profile": "test",
                "sessionId": "selected-session", "selectedAt": 200.0,
                "source": source,
            }
            with self.subTest(source=source), \
                 mock.patch.object(server, "_provider_run_for_agent", return_value=None), \
                 mock.patch.object(server, "handle_chat_sessions_list", return_value=(listed, 200)), \
                 mock.patch.object(server, "_load_provider_active_session", return_value=selected), \
                 mock.patch.object(server, "handle_chat_session_switch") as switch:
                result = server._sync_provider_active_session(agent, force=True)
            self.assertEqual(result["sessionId"], "selected-session")
            switch.assert_not_called()

    def test_approval_event_and_deny_response_use_native_run_api(self):
        client = FakeApprovalClient()
        agent = {"id": "hermes-test", "statusKey": "hermes-test", "profile": "test"}
        progress = []
        with mock.patch.object(server, "_hermes_api_client_for_profile", return_value=client), \
             mock.patch.object(server, "_set_hermes_session_id"), \
             mock.patch.object(server, "_remember_hermes_approval_pending", side_effect=lambda value, **_kwargs: value), \
             mock.patch.object(server, "_publish_hermes_api_progress"), \
             mock.patch.object(server.gateway_presence, "set_provider_event"):
            result = server._handle_hermes_api_chat(
                agent, "test", "prove approval", "prove approval", 10,
                on_progress=progress.append,
                prepared_context=("approval-session", []),
            )
        self.assertFalse(result["ok"])
        self.assertEqual(result["approval"]["command"], "release-proof")
        self.assertTrue(any(item.get("approval") for item in progress))

        with mock.patch.object(server, "_get_hermes_agent", return_value=agent), \
             mock.patch.object(server, "_hermes_api_client_for_profile", return_value=client), \
             mock.patch.object(server, "_resolve_hermes_approval_pending", return_value=None), \
             mock.patch.object(server, "_load_hermes_history", return_value=[]), \
             mock.patch.object(server, "_save_hermes_history"), \
             mock.patch.object(server.gateway_presence, "set_provider_event"):
            denied = server._handle_hermes_approval_respond({
                "agentId": "hermes-test",
                "choice": "deny",
                "approval": result["approval"],
            })
        self.assertTrue(denied["ok"])
        self.assertEqual(client.approval_response, ("real-looking-run-id", "deny"))

    def test_new_session_ids_are_unique_when_no_session_is_selected(self):
        client = FakeHistoryClient()
        agent = {"capabilities": {"sessionSwitch": True}}
        with mock.patch.object(server, "_get_hermes_session_id", return_value=""):
            first, history1 = server._prepare_hermes_run_context(client, agent, "default")
            second, history2 = server._prepare_hermes_run_context(client, agent, "default")
        self.assertNotEqual(first, second)
        self.assertTrue(first.startswith("vo-hermes-default-"))
        self.assertIsNone(history1)
        self.assertIsNone(history2)

    def test_mounted_profile_mapping_and_real_policy(self):
        data = self.root / "hermes"
        (data / "profiles" / "cod").mkdir(parents=True)
        default = HermesProvider.inspect_mounted_profile("default", data_root=str(data), access="read-write")
        named = HermesProvider.inspect_mounted_profile("cod", data_root=str(data), access="read-only")
        disabled = HermesProvider.inspect_mounted_profile("cod", data_root=str(data), access="disabled")
        self.assertEqual(default["path"], str(data))
        self.assertTrue(default["readable"])
        self.assertEqual(named["path"], str(data / "profiles" / "cod"))
        self.assertTrue(named["readable"])
        self.assertFalse(named["writable"])
        self.assertFalse(disabled["readable"])

        outside = self.root / "outside"
        outside.mkdir()
        os.symlink(outside, data / "profiles" / "escape")
        escaped = HermesProvider.inspect_mounted_profile("escape", data_root=str(data), access="read-write")
        windows = HermesProvider.inspect_mounted_profile("default", data_root=r"C:\Users\Example\.hermes")
        self.assertFalse(escaped["available"])
        self.assertFalse(windows["available"])

        statvfs = mock.Mock(f_flag=getattr(os, "ST_RDONLY", 1))
        with mock.patch("providers.hermes.os.statvfs", return_value=statvfs):
            filesystem_read_only = HermesProvider.inspect_mounted_profile("cod", data_root=str(data), access="read-write")
        self.assertTrue(filesystem_read_only["readable"])
        self.assertFalse(filesystem_read_only["writable"])
        self.assertEqual(filesystem_read_only["access"], "read-only")

    def test_resource_security_absolute_hidden_secret_extension_and_symlink(self):
        workspace = self.root / "profile"
        (workspace / "workspace" / ".hidden").mkdir(parents=True)
        outside = self.root / "outside"
        outside.mkdir()
        (workspace / "workspace" / "safe.md").write_text("safe")
        (workspace / "workspace" / ".hidden" / "secret.md").write_text("hidden")
        (workspace / "auth.json").write_text("SECRET")
        (workspace / "workspace" / "bad.py").write_text("bad")
        os.symlink(outside, workspace / "workspace" / "escape")
        manifest = ProviderManifest(
            id="hermes", name="Hermes",
            capabilities={"resourcesRead": True, "resourcesWrite": True},
            resource_schema=[
                {"id": "workspace", "paths": ["workspace/**/*.md", "workspace/**/*.txt"], "readable": True, "writable": True},
                {"id": "config", "paths": ["auth.json", ".env"], "readable": False, "writable": False, "sensitive": True},
            ],
        )
        agent = {"providerKind": "hermes", "workspace": str(workspace), "capabilities": {"resourcesRead": True, "resourcesWrite": True}}
        with mock.patch.object(server, "_get_provider_registry", return_value=ManifestRegistry(manifest)):
            self.assertFalse(server._safe_workspace_relpath("/workspace/safe.md"))
            self.assertFalse(server._safe_workspace_relpath("C:/workspace/safe.md"))
            self.assertIn("not exposed", server._read_workspace_text_file("h", agent, "workspace/.hidden/secret.md")["error"])
            secret = server._read_workspace_text_file("h", agent, "auth.json")
            self.assertIn("hidden", secret["error"])
            self.assertNotIn("SECRET", str(secret))
            self.assertIn("not exposed", server._read_workspace_text_file("h", agent, "workspace/bad.py")["error"])
            escaped = server._save_workspace_text_file("h", agent, "workspace/escape/stolen.md", "no", create=True)
            self.assertIn("Symbolic-link", escaped["error"])

    def test_nested_skill_write_and_revision(self):
        skills = self.root / "profile" / "skills"
        skills.mkdir(parents=True)
        agent = {"id": "hermes-test", "providerKind": "hermes", "workspace": str(self.root / "profile"), "capabilities": {"resourcesRead": True, "resourcesWrite": True, "skills": True}}
        manifest = ProviderManifest(id="hermes", name="Hermes", capabilities=agent["capabilities"], skill_schema=[{
            "id": "skills", "label": "Hermes skills", "path": "skills", "writable": True, "runtimeActive": True,
        }])
        content = "---\nname: review\ndescription: Nested review.\n---\n\n# Review\n"
        with mock.patch.object(server, "_get_provider_registry", return_value=ManifestRegistry(manifest)), \
             mock.patch.object(server, "_find_agent_record", return_value=agent), \
             mock.patch.object(server, "refresh_agent_maps"), \
             mock.patch.object(server, "STATUS_DIR", str(self.root / "status")):
            created = server._handle_skill_write("hermes-test", "official/review", {"content": content})
            self.assertTrue(created["ok"], created)
            self.assertTrue((skills / "official" / "review" / "SKILL.md").is_file())
            listed = server._handle_skill_list("hermes-test")
            self.assertEqual(listed["skills"][0]["name"], "official/review")
            conflict = server._handle_skill_write("hermes-test", "official/review", {"content": content + "changed", "revision": "wrong"})
            self.assertEqual(conflict["code"], "revision_conflict")

    def test_compose_sidecar_is_pinned_private_and_separate(self):
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("nousresearch/hermes-agent:v2026.8.3", compose)
        self.assertIn('profiles: ["hermes"]', compose)
        self.assertIn("internal: true", compose)
        self.assertIn('expose:\n      - "8642"', compose)
        hermes_block = compose.split("  hermes:\n", 1)[1].split("\n  # Optional: Agent Browser", 1)[0]
        self.assertNotIn("ports:", hermes_block)
        self.assertNotIn("docker.sock", compose)

    def test_browser_forwards_selected_native_session(self):
        source = (APP / "chat.js").read_text(encoding="utf-8")
        self.assertIn("isNativeHermesSelected()", source)
        self.assertIn("sessionId:this.selectedProviderSessionId()", source)
        self.assertIn("sessionId: this.selectedProviderSessionId()", source)
        self.assertIn("newSessionPending: this.isPendingProviderSession()", source)
        self.assertIn("canonicalSessionKeyForOption", source)
        self.assertIn("optionMatchesSelectedAgent", source)
        self.assertIn("historyParams.set('sessionId', selectedSessionId)", source)
        load_agent_list = source.split("async loadAgentList()", 1)[1].split("isVisibleForPolling()", 1)[0]
        self.assertIn("this.loadHistory();", load_agent_list)
        server_source = (APP / "server.py").read_text(encoding="utf-8")
        self.assertIn('source="native-follow"', server_source)
        self.assertIn('"sessionKey": f"{provider_kind}:{profile}:{response_session_id}"', server_source)


if __name__ == "__main__":
    unittest.main()
