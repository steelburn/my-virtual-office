import os
import re
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_ROOT = os.path.join(PROJECT_ROOT, "app")
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

import server  # noqa: E402
from providers.antigravity import AntigravityProvider  # noqa: E402
from providers.claude_code import ClaudeCodeProvider  # noqa: E402
from providers.codex import CodexProvider  # noqa: E402
from providers.hermes import HermesProvider  # noqa: E402
from providers.opencode import OpenCodeProvider  # noqa: E402
from providers.registry import ProviderManifest  # noqa: E402


class _ManifestRegistry:
    def __init__(self, manifest):
        self._manifest = manifest

    def manifest(self, _provider_id):
        return self._manifest


class ProviderSdkResourceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.status = self.root / "status"
        self.status.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def _manifest():
        return ProviderManifest(
            id="test-sdk",
            name="Test SDK",
            capabilities={
                "resourcesRead": True,
                "resourcesWrite": True,
                "skills": True,
            },
            settings_schema={"version": 1, "configKey": "test", "sections": []},
            resource_schema=[
                {
                    "id": "instructions",
                    "label": "Runtime instructions",
                    "paths": ["AGENTS.md"],
                    "runtimeActive": True,
                    "writable": True,
                    "deletable": False,
                },
                {
                    "id": "secrets",
                    "label": "Credentials",
                    "paths": ["auth.json", ".env"],
                    "runtimeActive": True,
                    "readable": False,
                    "writable": False,
                    "sensitive": True,
                    "managedBy": "Connections",
                },
                {
                    "id": "documents",
                    "label": "Documents",
                    "paths": ["docs/**/*.md"],
                    "runtimeActive": False,
                    "writable": True,
                    "deletable": True,
                },
                {
                    "id": "skills",
                    "label": "Project skills",
                    "paths": [".agents/skills/**/SKILL.md"],
                    "runtimeActive": True,
                    "writable": True,
                },
            ],
            skill_schema=[{
                "id": "agent",
                "label": "Project skills",
                "path": ".agents/skills",
                "scope": "agent",
                "runtimeActive": True,
                "writable": True,
                "format": "agentskills",
            }],
        )

    def _agent(self, workspace):
        return {
            "id": "test-agent",
            "statusKey": "test-agent",
            "providerKind": "test-sdk",
            "providerAgentId": "test-agent",
            "workspace": str(workspace),
            "capabilities": {
                "resourcesRead": True,
                "resourcesWrite": True,
                "skills": True,
            },
        }

    def test_builtin_manifests_expose_native_files_and_skill_roots(self):
        registry = server._get_provider_registry()
        expected_skill_paths = {
            "openclaw": "skills",
            "hermes": "skills",
            "codex": ".agents/skills",
            "claude-code": ".claude/skills",
            "opencode": ".opencode/skills",
            "antigravity": ".agents/skills",
        }
        manifests = {row["id"]: row for row in registry.manifests()}
        self.assertEqual(set(expected_skill_paths), set(manifests))
        for provider_id, skill_path in expected_skill_paths.items():
            manifest = manifests[provider_id]
            self.assertEqual(manifest["contractVersion"], "1.1")
            self.assertTrue(manifest["settingsSchema"])
            self.assertTrue(manifest["creationSchema"].get("fields"))
            self.assertTrue(manifest["resourceSchema"])
            self.assertEqual(manifest["skillSchema"][0]["path"], skill_path)
            all_paths = [path for item in manifest["resourceSchema"] for path in item.get("paths", [])]
            self.assertFalse({"*", "**", "**/*"}.intersection(all_paths))
        self.assertTrue(registry.conformance()["ok"])

    def test_provider_adapters_do_not_embed_developer_home_paths(self):
        provider_root = Path(APP_ROOT) / "providers"
        for filename in ("antigravity.py", "opencode.py"):
            content = (provider_root / filename).read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"/home/[A-Za-z0-9._-]+", content))

    def test_strict_resource_allowlist_hides_credentials_and_undeclared_files(self):
        workspace = self.root / "workspace"
        (workspace / "docs").mkdir(parents=True)
        (workspace / "AGENTS.md").write_text("instructions", encoding="utf-8")
        (workspace / "auth.json").write_text("TOP_SECRET", encoding="utf-8")
        (workspace / ".env").write_text("TOKEN=TOP_SECRET", encoding="utf-8")
        (workspace / "office-agent.json").write_text("metadata", encoding="utf-8")
        (workspace / "docs" / "safe.md").write_text("safe", encoding="utf-8")
        agent = self._agent(workspace)
        registry = _ManifestRegistry(self._manifest())
        with mock.patch.object(server, "_get_provider_registry", return_value=registry):
            rows = server._workspace_file_summaries("test-agent", agent)
            self.assertEqual({row["path"] for row in rows}, {"AGENTS.md", "docs/safe.md"})
            hidden = server._read_workspace_text_file("test-agent", agent, "auth.json")
            self.assertIn("hidden", hidden["error"])
            self.assertNotIn("TOP_SECRET", str(hidden))
            undeclared = server._read_workspace_text_file("test-agent", agent, "office-agent.json")
            self.assertIn("not exposed", undeclared["error"])
            denied_delete = server._delete_workspace_text_file("test-agent", agent, "AGENTS.md")
            self.assertIn("does not allow deleting", denied_delete["error"])

    def test_resource_create_backup_revision_and_symlink_escape(self):
        workspace = self.root / "workspace"
        outside = self.root / "outside"
        (workspace / "docs").mkdir(parents=True)
        outside.mkdir()
        agent = self._agent(workspace)
        registry = _ManifestRegistry(self._manifest())
        with mock.patch.object(server, "_get_provider_registry", return_value=registry), \
             mock.patch.object(server, "STATUS_DIR", str(self.status)):
            created = server._save_workspace_text_file("test-agent", agent, "docs/note.md", "one", create=True)
            self.assertTrue(created["ok"])
            updated = server._save_workspace_text_file("test-agent", agent, "docs/note.md", "two")
            self.assertTrue(updated["backupId"])
            history = server._list_workspace_file_revisions("test-agent", agent, "docs/note.md")
            self.assertEqual(len(history["revisions"]), 1)
            os.symlink(outside, workspace / "docs" / "escape")
            escaped = server._save_workspace_text_file(
                "test-agent", agent, "docs/escape/stolen.md", "no", create=True
            )
            self.assertIn("Symbolic-link", escaped["error"])

    def test_agent_skill_validation_metadata_backup_and_symlink_guard(self):
        workspace = self.root / "workspace"
        skills = workspace / ".agents" / "skills"
        skills.mkdir(parents=True)
        agent = self._agent(workspace)
        registry = _ManifestRegistry(self._manifest())
        valid = "---\nname: review\ndescription: Review work safely.\n---\n\n# Review\n"
        invalid = "# missing frontmatter\n"
        with mock.patch.object(server, "_get_provider_registry", return_value=registry), \
             mock.patch.object(server, "_find_agent_record", return_value=agent), \
             mock.patch.object(server, "refresh_agent_maps"), \
             mock.patch.object(server, "STATUS_DIR", str(self.status)):
            rejected = server._handle_skill_write("test-agent", "bad", {"content": invalid})
            self.assertEqual(rejected["code"], "invalid_skill")
            self.assertFalse((skills / "bad").exists())
            created = server._handle_skill_write("test-agent", "review", {"content": valid})
            self.assertTrue(created["ok"])
            hidden = skills / ".archive" / "legacy"
            hidden.mkdir(parents=True)
            (hidden / "SKILL.md").write_text(valid, encoding="utf-8")
            listed = server._handle_skill_list("test-agent")
            self.assertEqual(len(listed["skills"]), 1)
            self.assertEqual(listed["skills"][0]["rootLabel"], "Project skills")
            self.assertTrue(listed["skills"][0]["runtimeActive"])
            self.assertTrue(listed["skills"][0]["valid"])
            server._handle_skill_write("test-agent", "review", {"content": valid + "\nUpdated\n"})
            self.assertTrue(any((self.status / "resource-backups" / "test-agent" / "skills").rglob("SKILL.md")))
            outside = self.root / "outside-skills"
            outside.mkdir()
            os.symlink(outside, skills / "escape")
            escaped = server._handle_skill_write(
                "test-agent", "escape", {"content": valid.replace("name: review", "name: escape")}
            )
            self.assertIn("inside the declared skill root", escaped["error"])

    def test_skill_frontmatter_supports_multiline_descriptions(self):
        content = (
            "---\nname: multiline\ndescription: |\n"
            "  First line of the description.\n"
            "  Second line.\nversion: 1\n---\n"
        )
        name, description = server._parse_skill_frontmatter(content)
        self.assertEqual(name, "multiline")
        self.assertEqual(description, "First line of the description. Second line.")
        self.assertEqual(server._validate_skill_content(content), "")

    def test_skill_library_install_uses_provider_root_and_rejects_traversal(self):
        workspace = self.root / "workspace"
        (workspace / ".agents" / "skills").mkdir(parents=True)
        library_home = self.root / "library-home"
        agent = self._agent(workspace)
        registry = _ManifestRegistry(self._manifest())
        content = "---\nname: reusable\ndescription: Reusable test skill.\n---\n\n# Reusable\n"
        config = {"openclaw": {"homePath": str(library_home)}}
        with mock.patch.object(server, "_get_provider_registry", return_value=registry), \
             mock.patch.object(server, "_find_agent_record", return_value=agent), \
             mock.patch.object(server, "refresh_agent_maps"), \
             mock.patch.object(server, "VO_CONFIG", config), \
             mock.patch.object(server, "STATUS_DIR", str(self.status)):
            created = server._handle_skills_library_create({"name": "reusable", "content": content})
            self.assertTrue(created["ok"])
            applied = server._handle_skills_library_apply({"skill": "reusable", "agentId": "test-agent"})
            self.assertTrue(applied["ok"])
            self.assertTrue((workspace / ".agents" / "skills" / "reusable" / "SKILL.md").is_file())
            self.assertEqual(server._handle_skills_library_get("../escape")["_status"], 400)
            self.assertEqual(server._handle_skills_library_delete("../escape")["_status"], 400)

    def test_discovery_cache_retains_missing_agents_as_offline(self):
        cache_file = self.status / "provider-discovery-cache.json"
        live_agent = {
            "id": "test-agent",
            "statusKey": "test-agent",
            "providerKind": "test-sdk",
            "providerAgentId": "native-one",
            "name": "Native One",
        }
        registry = mock.Mock()
        registry.discover_agents.side_effect = [[live_agent], []]
        with mock.patch.object(server, "_get_provider_registry", return_value=registry), \
             mock.patch.object(server, "DISCOVERY_CACHE_FILE", str(cache_file)):
            first = server._discover_roster()
            second = server._discover_roster()
        self.assertTrue(first[0]["available"])
        self.assertFalse(second[0]["available"])
        self.assertEqual(second[0]["connectionState"], "offline")
        self.assertTrue(second[0]["offlineSince"])

    def test_new_native_agents_receive_framework_skill_directories(self):
        binary = "/bin/true"
        with mock.patch.dict(os.environ, {"VO_STATUS_DIR": str(self.status)}):
            hermes_home = self.root / "hermes"
            hermes_home.mkdir()
            providers = [
                (HermesProvider(home_path=str(hermes_home), binary=binary), "Hermes", "hermes-test", "skills"),
                (CodexProvider(home_path=str(self.root / "codex-home"), binary=binary, workspace_root=str(self.root / "codex")), "Codex", "codex-test", ".agents/skills"),
                (ClaudeCodeProvider(home_path=str(self.root / "claude-home"), binary=binary, workspace_root=str(self.root / "claude")), "Claude", "claude-test", ".claude/skills"),
                (OpenCodeProvider(home_path=str(self.root / "opencode-home"), binary=binary, workspace_root=str(self.root / "opencode")), "OpenCode", "opencode-test", ".opencode/skills"),
                (AntigravityProvider(home_path=str(self.root / "antigravity-home"), binary=binary, workspace_root=str(self.root / "antigravity")), "Antigravity", "antigravity-test", ".agents/skills"),
            ]
            for provider, name, profile, relative in providers:
                result = provider.create_agent(name=name, profile=profile)
                self.assertTrue(result["ok"], result)
                self.assertTrue((Path(result["workspace"]) / relative).is_dir(), (name, result))

    def test_resource_and_skill_reads_are_stable_under_concurrency(self):
        workspace = self.root / "workspace"
        (workspace / "docs").mkdir(parents=True)
        (workspace / ".agents" / "skills" / "review").mkdir(parents=True)
        (workspace / "AGENTS.md").write_text("instructions", encoding="utf-8")
        (workspace / "docs" / "safe.md").write_text("safe", encoding="utf-8")
        (workspace / ".agents" / "skills" / "review" / "SKILL.md").write_text(
            "---\nname: review\ndescription: Review work.\n---\n", encoding="utf-8"
        )
        agent = self._agent(workspace)
        registry = _ManifestRegistry(self._manifest())
        with mock.patch.object(server, "_get_provider_registry", return_value=registry), \
             mock.patch.object(server, "_find_agent_record", return_value=agent), \
             mock.patch.object(server, "refresh_agent_maps"):
            def inspect(_index):
                return (
                    len(server._workspace_file_summaries("test-agent", agent)),
                    len(server._handle_skill_list("test-agent")["skills"]),
                )

            with ThreadPoolExecutor(max_workers=12) as pool:
                results = list(pool.map(inspect, range(120)))
        self.assertEqual(set(results), {(3, 1)})


if __name__ == "__main__":
    unittest.main()
