# Hermes Provider Adapter

Status: production authenticated API integration with optional mounted resources

## Architecture

Hermes remains the agent runtime. Virtual Office is an authenticated client and resource editor:

```text
chat/runs/sessions/models/approvals/cancel
Virtual Office ── authenticated HTTP/SSE ──> Hermes runtime

declared profile/workspace/skill sources
Virtual Office ── confined bind mount ─────> Hermes profile data
```

These transports are independent. Virtual Office never needs a second Hermes CLI, a Docker socket, or `docker exec`. Existing native and external API gateways remain supported.

## Conversation continuity

Hermes `session_id` persists and addresses a session, but `/v1/runs` does not automatically insert earlier turns. Before every continuing run, Virtual Office calls the authenticated Sessions API and sends bounded `conversation_history`.

Only non-empty `user` and `assistant` text is retained. Structured text content is normalized; tool-protocol, internal, and empty rows are excluded. Limits are controlled by:

- `VO_HERMES_CONTEXT_MAX_MESSAGES` (default 120)
- `VO_HERMES_CONTEXT_MAX_MESSAGE_CHARS` (default 32,000)
- `VO_HERMES_CONTEXT_MAX_CHARS` (default 120,000)

The current prompt is not duplicated. If an explicitly selected existing session supports history but cannot be hydrated, Virtual Office returns `session_history_unavailable` before submitting a run. New sessions and older Hermes endpoints without Sessions capability retain compatibility behavior. Native Hermes and universal Provider SDK sends use the same logic.

## Runtime connections

Add one connection per Hermes gateway in **Settings → Integrations → Hermes**:

```json
{
  "hermes": {
    "enabled": true,
    "resourceRoot": "/data/hermes",
    "resourceAccess": "read-write",
    "connections": [{
      "id": "default",
      "name": "Hermes",
      "apiUrl": "http://hermes:8642",
      "apiKey": "server-key",
      "resourceAccess": "inherit"
    }]
  }
}
```

Named connections map below `resourceRoot/profiles/<id>`. The default connection maps to `resourceRoot`. Set `resourcePath` on a connection when its routing ID differs from its native profile directory. Keys stay server-side and API responses redact them.

## Mounted resource policies

- `read-write`: declared resources may be edited; atomic replacement preserves existing ownership/mode and new files inherit the mounted owner.
- `read-only`: resources can be read but writes are rejected.
- `disabled`: no mounted profile resources are exposed.
- `inherit`: per-connection policy inherits the global policy.

Docker `:ro` is detected and always overrides a requested read-write policy. Diagnostics distinguish missing mounts, permission failures, and actual read-only filesystems.

Allowed resources are SOUL, identity/profile Markdown, workspace Markdown/text, and complete nested skill sources under `skills/<category>/<skill>/SKILL.md` (flat skills remain compatible). Requests reject absolute paths, traversal, undeclared files, unsupported extensions, wildcard-hidden files, and symlinks escaping the profile root. Credentials such as `config.yaml`, `auth.json`, and `.env` are declared sensitive and never readable.

## Optional dedicated Compose sidecar

Set a strong `VO_HERMES_API_KEY`, configure the connection URL as `http://hermes:8642`, then run:

```bash
docker compose --profile hermes up -d
```

The sidecar is deliberately pinned to `nousresearch/hermes-agent:v2026.8.3`, has persistent `/opt/data`, and joins only the internal `hermes-internal` network. Port 8642 is exposed to sibling containers but never published to the host. The Virtual Office and Hermes services are separate; rebuilding/recreating Virtual Office does not replace Hermes. Set `VO_HERMES_UID` and `VO_HERMES_GID` to the host bind owner.

## Supported surfaces

- authenticated health/capabilities/models/skills metadata
- run submission, SSE, status, approvals, stop/cancel/interrupt
- session create/list/read/messages/switch/delete (when advertised by Hermes)
- tool, reasoning/thinking, approval, and activity rendering
- mounted SOUL/profile/workspace resources and nested skill source editing

Whole Hermes profile lifecycle and native model/auth mutation remain administrator operations because the HTTP API does not expose complete profile lifecycle endpoints.

## Known limitation

Cross-container file/image attachment handoff is not implemented. The Hermes capability contract therefore does not advertise attachments. Use text chat or arrange a separately secured shared-media transport.

The separate Hermes Messaging Gateway platform plugin remains documented in `docs/HERMES_PLATFORM_ADAPTER.md`.
