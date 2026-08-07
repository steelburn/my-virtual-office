import os
import sys
import unittest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_ROOT = os.path.join(PROJECT_ROOT, "app")
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

from providers.opencode import OpenCodeProvider  # noqa: E402
from server import _provider_session_messages  # noqa: E402


class ProviderChatNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.tool_part = {
            "type": "tool",
            "tool": "bash",
            "callID": "call-1",
            "state": {
                "status": "completed",
                "input": {"command": "pwd"},
                "output": "/data/opencode-main\n",
            },
        }

    def test_opencode_live_tool_uses_nested_state(self):
        tool = OpenCodeProvider._event_tool({"part": self.tool_part})
        self.assertEqual(tool["status"], "done")
        self.assertEqual(tool["arguments"], {"command": "pwd"})
        self.assertEqual(tool["result"], "/data/opencode-main\n")

    def test_exported_session_preserves_tools_and_hides_reasoning(self):
        payload = {
            "session": {
                "messages": [
                    {
                        "info": {"role": "assistant", "time": {"created": 123}},
                        "parts": [
                            {"type": "reasoning", "text": "PRIVATE_PROVIDER_REASONING"},
                            self.tool_part,
                            {"type": "text", "text": "OPENCODE_UI_OK"},
                        ],
                    }
                ]
            }
        }
        messages = _provider_session_messages(payload, "opencode", "session-1", "OpenCode")
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["text"], "OPENCODE_UI_OK")
        self.assertNotIn("PRIVATE_PROVIDER_REASONING", messages[0]["text"])
        self.assertEqual(messages[0]["tools"][0]["status"], "done")
        self.assertEqual(messages[0]["tools"][0]["arguments"], {"command": "pwd"})


if __name__ == "__main__":
    unittest.main()
