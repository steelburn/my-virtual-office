# Hermes Provider Adapter

Status: external native-gateway integration

## Architecture

Hermes is the agent runtime. Virtual Office is an authenticated client:

```text
Virtual Office → Hermes HTTP/SSE API → native Hermes profile gateway → native tools and sessions
```

Each Hermes profile owns its gateway process and API port in the environment
where Hermes is installed. Virtual Office does not start Hermes, run the Hermes
CLI, mount the Hermes home directory, create/delete profiles, or change Hermes
models and credentials.

This follows Hermes' documented API-server and profile model: the API server is
the real agent runtime, and tool calls execute on the machine that hosts it.

## Messaging Gateway platform mode

Virtual Office also includes a Hermes Messaging Gateway platform plugin at:

`integrations/hermes-platform/my_virtual_office/`

This is intentionally separate from native API Server connections. In this mode,
Hermes gateway polls Virtual Office as a messaging platform and posts replies
back into the office communication log. See
`docs/HERMES_PLATFORM_ADAPTER.md`.

## Configuration

Add one connection per native Hermes profile in Settings:

```json
{
  "hermes": {
    "enabled": true,
    "timeoutSec": 600,
    "connections": [
      {
        "id": "research",
        "name": "Research",
        "apiUrl": "http://host.docker.internal:8642",
        "apiKey": "server-key"
      }
    ]
  }
}
```

The equivalent environment setting is `VO_HERMES_CONNECTIONS_JSON`. The older
single `VO_HERMES_API_URL` and `VO_HERMES_API_KEY` values are accepted only as a
configuration-migration bridge.

The separate Messaging Gateway platform bridge uses
`VO_HERMES_PLATFORM_ENABLED`, `VO_HERMES_PLATFORM_TOKEN`, and
`VO_HERMES_PLATFORM_AGENT_ID` (or the matching `hermes.platform*` settings).

Connection IDs are Virtual Office routing identifiers. The native profile and
model shown in the UI are discovered from `/v1/capabilities` and `/v1/models`.
API keys remain server-side.

## Supported Hermes API surfaces

- `GET /health`
- `GET /v1/capabilities`
- `GET /v1/models`
- `POST /v1/runs`
- `GET /v1/runs/{run_id}/events`
- `POST /v1/runs/{run_id}/approval`
- `POST /v1/runs/{run_id}/stop`
- `GET /api/sessions`
- `GET /api/sessions/{session_id}`
- `GET /api/sessions/{session_id}/messages`
- `DELETE /api/sessions/{session_id}`

## Virtual Office endpoints

- `POST /api/hermes/test` tests every configured native connection.
- `POST /api/hermes/runs` starts a run on the selected connection.
- `GET /api/hermes/runs/{run_id}/events` proxies the native SSE stream.
- `POST /api/hermes/runs/{run_id}/stop` interrupts the native run.
- Hermes chat-session endpoints use Hermes' session REST API.
- Agent create/delete and Hermes model/auth mutation endpoints return `405` and
  explain that those operations belong in Hermes.

## Failure behavior

An unavailable native gateway produces a clear connection error. There is no
Desktop, CLI, or container-local fallback, because any such fallback would move
tool execution into the wrong environment and create a second Hermes runtime.

## References

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/profiles
- https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals
