# Virtual Office Provider Contract

Contract version: `1.1`

The Virtual Office core routes agent operations through a provider registry. A
future provider can be installed as an extension without adding provider-name
branches to `server.py`, `game.js`, or `chat.js`.

## Design rules

- Providers own native discovery, authentication, lifecycle calls, and native
  profile synchronization.
- The registry owns stable identity, capability negotiation, normalization, and
  operation dispatch.
- The UI reads provider manifests and agent capabilities. It does not assume
  that every provider behaves like OpenClaw.
- Native files remain authoritative for existing agents. Virtual Office does
  not rewrite them during discovery.
- Unsupported features must be declared as `false`; they are hidden or
  disabled instead of emulated silently.
- Provider secrets and credentials never belong in manifests or browser
  responses.

## Extension discovery

The server loads Python modules named `vo_provider_*.py` from:

1. `/data/provider-extensions`
2. Each directory in `VO_PROVIDER_EXTENSION_DIRS`

An extension exports:

```python
def build_provider(context):
    return MyProvider(context)
```

It may return one provider or a list of providers. The object must expose a
`manifest` attribute containing a `ProviderManifest`.

## Minimal provider

```python
from providers.registry import ProviderManifest


class ExampleProvider:
    manifest = ProviderManifest(
        id="example",
        name="Example Runtime",
        description="Example external agent framework",
        icon="🧩",
        category="agent-runtime",
        provider_type="framework",
        capabilities={
            "discover": True,
            "health": True,
            "chat": True,
            "agentCreate": False,
            "agentDelete": False,
            "profileEdit": False,
            "resourcesRead": False,
            "resourcesWrite": False,
            "sessions": False,
        },
        creation_schema={},
        resource_schema=[],
    )

    def test(self):
        return {
            "ok": True,
            "installed": True,
            "authOk": True,
            "version": "1.0",
        }

    def discover_agents(self):
        return [{
            "providerAgentId": "researcher",
            "name": "Researcher",
            "role": "Research agent",
            "emoji": "🔎",
            "workspace": "/absolute/provider/workspace",
        }]

    def send_chat_message(
        self,
        profile,
        message,
        session_id=None,
        timeout_sec=None,
        on_progress=None,
        files=None,
    ):
        return {
            "ok": True,
            "reply": "Provider reply",
            "sessionId": session_id or "native-session-id",
            "tools": [],
        }
```

Run `GET /api/providers/conformance` after installation. A provider that fails
the contract remains visible in diagnostics but should not be treated as ready.

## Required operations

Capabilities determine which operations are required.

| Capability | Provider operation |
|---|---|
| `health` | `test()` |
| `discover` | `discover_agents()` |
| `chat` | `send_chat_message(profile, message, ...)` |
| `sessions` | `list_sessions(profile, limit=40)` |
| `interrupt` | `interrupt(profile)` |
| `agentCreate` | `create_agent(**fields)` |
| `agentDelete` | `delete_agent(profile)` |
| `profileEdit` | `update_profile(profile, patch)` |

Session create, switch, and delete operations are optional:

- `create_session(profile)`
- `export_session(profile, session_id)` or `read_session(...)`
- `delete_session(profile, session_id)`

When a provider supports fresh conversations but does not allocate a session
until the first message, Virtual Office can clear its local history as the
`sessionCreate` behavior.

## Capability names

The `1.0` contract recognizes:

```text
discover health chat streaming sessions sessionCreate sessionDelete
sessionSwitch interrupt approvals agentCreate agentDelete profileEdit
resourcesRead resourcesWrite skills models projects meetings agentToAgent
attachments tools
```

Capabilities are per provider by default. A discovered agent may supply
`capabilityOverrides` for a connection or native agent that is more limited.

Examples:

- A read-only remote connection sets `resourcesWrite: false`.
- A CLI without persistent sessions sets all session capabilities to `false`.
- A provider without native approval events sets `approvals: false`.

## Canonical agent fields

Discovery returns native rows. The registry adds:

```json
{
  "id": "provider-native-id",
  "statusKey": "provider:native-id",
  "providerKind": "provider",
  "providerType": "framework",
  "providerAgentId": "native-id",
  "providerConnectionId": "default",
  "profile": "native-id",
  "name": "Display name",
  "role": "Agent role",
  "emoji": "🤖",
  "workspace": "/absolute/path",
  "capabilities": {}
}
```

Stable ownership is `providerKind + providerConnectionId + providerAgentId`.
Prefixes are display conventions only; routing never depends on them.

## Creation schema

`creationSchema` drives the New Agent form. Example:

```python
creation_schema={
    "fields": [
        {"name": "name", "label": "Name", "type": "text", "required": True},
        {"name": "role", "label": "Role", "type": "text", "required": True},
        {"name": "emoji", "label": "Emoji", "type": "text"},
        {"name": "prompt", "label": "Standing Prompt", "type": "textarea"},
        {"name": "profile", "label": "Native ID", "type": "text"},
        {"name": "model", "label": "Model", "type": "text"},
    ]
}
```

Provider-specific fields can be added to the schema without changing the
frontend.

## Resource and skill schemas

`resourceSchema` tells the Agent Desk which resources are meaningful:

```python
resource_schema=[
    {
        "id": "identity",
        "label": "Identity",
        "paths": ["IDENTITY.md"],
        "runtimeActive": True,
        "writable": True,
    },
    {
        "id": "nativeAgent",
        "label": "Native agent definition",
        "paths": [".framework/agents/*.yaml"],
        "runtimeActive": True,
        "writable": True,
    },
]
```

The Agent Desk provides:

- path-scoped file access;
- previewed diffs;
- atomic writes;
- SHA revision conflict detection;
- automatic backups;
- history and restore;
- traversal rejection;
- capability-driven read-only behavior.

`skillSchema` separately declares native AgentSkill roots. Skill roots must
point to directories that contain `<skill-name>/SKILL.md`. Virtual Office
validates AgentSkills frontmatter before writes, confines every path and
realpath to the declared root, and creates recoverable backups before
overwrites or deletes. Credential-bearing and undeclared files are never
returned to the browser.

`update_profile()` must synchronize every native file that represents the same
identity or prompt. It should return the paths changed and backup identifier.

## Native auto-detection

Provider detection and agent detection are separate:

1. Virtual Office loads enabled provider manifests.
2. Each provider scans only its configured native roots or remote API.
3. Native rows are normalized and deduplicated by provider ownership.
4. Missing agents become unavailable; they are not silently deleted.
5. Discovery is read-only.

Providers should combine managed workspaces and native definitions. A native
agent found outside Virtual Office must appear without a central code change.

## Standard responses

Successful operation:

```json
{"ok": true}
```

Unsupported operation:

```json
{
  "ok": false,
  "code": "not_supported",
  "error": "Provider does not support operation"
}
```

Chat result:

```json
{
  "ok": true,
  "reply": "text",
  "sessionId": "native-id",
  "tools": [
    {
      "id": "call-id",
      "name": "read",
      "status": "completed",
      "arguments": {},
      "result": ""
    }
  ]
}
```

Health should distinguish installation from readiness:

```json
{
  "ok": true,
  "installed": true,
  "authOk": true,
  "ready": true,
  "version": "1.2.3",
  "error": ""
}
```

An installed but unauthenticated provider may still allow agent creation and
native file editing while chat remains unavailable.

## Validation checklist

Before enabling a provider:

1. Run `/api/providers/conformance`.
2. Confirm native agent discovery and stable IDs across restarts.
3. Create a namespaced real agent.
4. Confirm every declared capability works.
5. Confirm unsupported controls are hidden or rejected cleanly.
6. Test profile synchronization against actual native files.
7. Test file preview, save, conflict, backup, restore, and traversal rejection.
8. Test chat, tool events, sessions, interrupt, attachments, projects,
   meetings, and agent-to-agent communication when declared.
9. Confirm authentication failures are concise and actionable.
10. Delete the test agent and verify native cleanup.
