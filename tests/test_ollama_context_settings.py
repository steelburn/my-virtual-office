import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))
SPEC = importlib.util.spec_from_file_location("virtual_office_server", APP_DIR / "server.py")
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class OllamaContextSettingsTests(unittest.TestCase):
    def test_plain_model_list_does_not_invent_context_metadata(self):
        self.assertEqual(
            SERVER._parse_model_entries("alpha\nbeta"),
            [{"id": "alpha", "name": "alpha"}, {"id": "beta", "name": "beta"}],
        )

    def test_show_metadata_uses_architecture_context_and_larger_modelfile_override(self):
        self.assertEqual(
            SERVER._extract_ollama_context_window({"model_info": {"x.context_length": 131072}}),
            131072,
        )
        self.assertEqual(
            SERVER._extract_ollama_context_window({
                "model_info": {"x.context_length": 131072},
                "parameters": "temperature 0.2\nnum_ctx 262144",
            }),
            262144,
        )

    def test_ollama_api_base_accepts_standard_and_v1_urls(self):
        self.assertEqual(SERVER._ollama_api_base("http://localhost:11434/"), "http://localhost:11434")
        self.assertEqual(SERVER._ollama_api_base("https://ollama.example.test/v1"), "https://ollama.example.test")

    def test_auto_mode_uses_advertised_context_and_removes_runtime_override(self):
        existing = [{
            "id": "example",
            "name": "example",
            "contextWindow": 100000,
            "maxTokens": 8192,
            "params": {"num_ctx": 100000, "temperature": 0.2},
        }]
        models, error = SERVER._merge_provider_models(
            existing,
            [{"id": "example", "contextMode": "auto"}],
            is_ollama=True,
            ollama_contexts={"example": {"contextWindow": 131072}},
        )
        self.assertEqual(error, "")
        self.assertEqual(models[0]["contextWindow"], 131072)
        self.assertEqual(models[0]["params"], {"temperature": 0.2})

    def test_manual_mode_aligns_openclaw_budget_and_ollama_num_ctx(self):
        models, error = SERVER._merge_provider_models(
            [],
            [{"id": "example", "contextMode": "manual", "contextWindow": 65536}],
            is_ollama=True,
            ollama_contexts={"example": {"contextWindow": 131072}},
        )
        self.assertEqual(error, "")
        self.assertEqual(models[0]["contextWindow"], 65536)
        self.assertEqual(models[0]["params"]["num_ctx"], 65536)

    def test_manual_mode_rejects_limits_above_model_capacity(self):
        models, error = SERVER._merge_provider_models(
            [],
            [{"id": "example", "contextMode": "manual", "contextWindow": 200000}],
            is_ollama=True,
            ollama_contexts={"example": {"contextWindow": 131072}},
        )
        self.assertIsNone(models)
        self.assertIn("cannot exceed", error)

    def test_non_ollama_provider_preserves_existing_metadata(self):
        existing = [{
            "id": "example",
            "name": "Display Name",
            "contextWindow": 32768,
            "maxTokens": 4096,
            "params": {"temperature": 0.3},
        }]
        models, error = SERVER._merge_provider_models(
            existing,
            [{"id": "example", "name": "example"}],
        )
        self.assertEqual(error, "")
        self.assertEqual(models[0]["contextWindow"], 32768)
        self.assertEqual(models[0]["maxTokens"], 4096)
        self.assertEqual(models[0]["params"], {"temperature": 0.3})

    def test_provider_save_writes_auto_and_manual_modes_to_openclaw_config(self):
        original_config_path = SERVER.CONFIG_PATH
        original_query = SERVER._query_ollama_context_windows
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "openclaw.json"
            config_path.write_text(json.dumps({
                "models": {
                    "providers": {
                        "company-ollama": {
                            "baseUrl": "https://ollama.example.test:11434",
                            "api": "ollama",
                            "models": [
                                {"id": "auto-model", "name": "auto-model", "contextWindow": 100000, "params": {"num_ctx": 100000}},
                                {"id": "manual-model", "name": "manual-model", "contextWindow": 100000, "params": {"num_ctx": 100000}},
                            ],
                        }
                    }
                },
                "agents": {"defaults": {"models": {}}},
            }))
            try:
                SERVER.CONFIG_PATH = str(config_path)
                SERVER._query_ollama_context_windows = lambda *args, **kwargs: {
                    "auto-model": {"contextWindow": 131072},
                    "manual-model": {"contextWindow": 262144},
                }
                handler = object.__new__(SERVER.OfficeHandler)
                handler._signal_gateway = lambda restart=False: {"ok": True}
                result = handler._handle_save_custom_provider({
                    "provider": "company-ollama",
                    "baseUrl": "https://ollama.example.test:11434",
                    "api": "ollama",
                    "models": [
                        {"id": "auto-model", "contextMode": "auto"},
                        {"id": "manual-model", "contextMode": "manual", "contextWindow": 65536},
                    ],
                })
                self.assertTrue(result["ok"], result)
                saved = json.loads(config_path.read_text())["models"]["providers"]["company-ollama"]["models"]
                self.assertEqual(saved[0]["contextWindow"], 131072)
                self.assertNotIn("num_ctx", saved[0].get("params", {}))
                self.assertEqual(saved[1]["contextWindow"], 65536)
                self.assertEqual(saved[1]["params"]["num_ctx"], 65536)
            finally:
                SERVER.CONFIG_PATH = original_config_path
                SERVER._query_ollama_context_windows = original_query


if __name__ == "__main__":
    unittest.main()
