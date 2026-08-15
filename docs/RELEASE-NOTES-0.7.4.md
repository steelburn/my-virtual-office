# My Virtual Office v0.7.4 — Preview Bubbles & Rich Provider Telemetry

## Highlights

- Adds agent-anchored Preview Bubbles for workspace files, URLs, and configured browser viewers without leaving the office scene.
- Supports image, Markdown, HTML, source code, PDF, audio, and video previews with compact and expanded window controls.
- Keeps multiple previews readable with collision-aware placement, camera-aware scaling, configurable size and content zoom, hide/restore controls, and reload persistence.
- Delivers responsive desktop and mobile layouts with matching dark and light theme support.

## Provider chat and session reliability

- Preserves provider reasoning/commentary and the full tool lifecycle, including input, output, completion, failure, approval, cancellation, and restored-history state.
- Routes API-backed Hermes, Codex, Claude Code, OpenClaw, and extension providers through their supported native or shared transports while retaining safe fallbacks for CLI-only integrations.
- Keeps session ownership isolated per chat window so concurrent agents and conversations do not overwrite one another.
- Improves session creation, switching, hydration, and post-run reconciliation across live streams and browser reloads.
- Uses one sanitized Markdown pipeline for streamed, finalized, and restored messages across providers, including headings, lists, task lists, tables, blockquotes, code, links, and images.

## Connectivity and security

- Resolves provider endpoints across container-local, host, and explicitly configured deployments while treating authentication failures as terminal instead of silently falling back to another endpoint.
- Proxies supported OpenClaw browser RPC and event traffic through same-origin server endpoints by default, keeping the Gateway credential out of browser configuration payloads.
- Confines file previews to declared agent roots and rejects traversal, symlink escapes, hidden files, credential files, private keys, and unsupported content.
- Preserves API-key redaction and existing secret values when settings are saved with an empty secret field.

## Verification

- Passed the complete automated suite: 192 tests passed, 3 skipped, and all 14 subtests passed.
- Passed focused Preview Bubble, Markdown, chat-event, provider-session, endpoint-resolution, approval, cancellation, and concurrency coverage.
- Passed desktop and narrow mobile browser validation, multi-preview collision checks, camera zoom, themes, persistence, reload, and all supported preview types.
- Passed JavaScript syntax, Python compilation, Compose validation, source/deployment parity, health, browser-console, severe-log, and restart checks.

## Compatibility note

Browser previews require the browser integration to be enabled and configured for the active license. Deployments without that capability show the supported configuration fallback; file and URL previews remain available.

## Upgrade

Use source tag `v0.7.4`, rebuild the Virtual Office service, and preserve the existing `vo-data` and provider data volumes.

The automated multi-architecture container image is not currently available for this tag. The `v0.7.3` image remains the latest published registry image until automated package publishing resumes.

## Rollback

Pin `ghcr.io/eliautobot/my-virtual-office:0.7.3` (or check out tag `v0.7.3`) and recreate only the Virtual Office service. Preserve all persistent data volumes.
