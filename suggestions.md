# Feature suggestions archive — Involvex AI Agent

**Superseded by [`ROADMAP.md`](ROADMAP.md)** as the backlog source of truth.

This file keeps the original brainstorm (from v0.6.5 analysis) with status tags
so nothing is lost. Do not plan new work from this file alone — update
`ROADMAP.md` instead.

Status tags:

| Tag | Meaning |
| --- | --- |
| ✅ done | Shipped (see CHANGELOG / ROADMAP Done) |
| ⏭ v0.7 | Locked into v0.7 |
| ⏭ v0.8 | Locked into v0.8 |
| ⏸ later | Parked — see ROADMAP Later |
| ❌ won't | Explicitly out of scope unless requirements change |

---

## High-priority (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Streaming responses in Agent mode | ✅ done | Shipped in v0.8.0 |
| 2 | Per-site agent allow/deny list | ✅ done | Shipped in v0.8.0 |
| 3 | Multi-turn conversation memory | ⏸ later | |
| 4 | Custom system prompts | ✅ done | Shipped in v0.7.0 |
| 5 | Keyboard shortcuts | ✅ done | Shipped in v0.7.0 |

## Medium-priority (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 6 | Response regeneration | ✅ done | Shipped in v0.7.0 |
| 7 | Message pinning & bookmarks | ⏸ later | After regenerate UX lands |
| 8 | Context window management | ⏸ later | |
| 9 | Multi-language UI (i18n) | ⏸ later | |
| 10 | Voice input/output | ⏸ later | |

## Agent mode enhancements (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 11 | Expanded tool set | ✅ done (subset) | wait/scroll_to/extract in v0.8.0 |
| 12 | Agent workflow templates | ⏸ later | |
| 13 | Agent step visualization | ✅ done (subset) | Step bar + pause/cancel in v0.8.0 |
| 14 | Agent safety controls | ✅ done (subset) | Confirmations in v0.8.0 |

## Analytics & insights (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 15 | Usage analytics (opt-in local) | ⏸ later | Hygiene when capacity allows |
| 16 | Page content insights | ⏸ later | |

## Integration features (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 17 | Third-party integrations (Notion, etc.) | ⏸ later | Markdown export covers common case |
| 18 | Browser extension interoperability | ❌ won't | Fragile / permission-hostile |
| 19 | API / webhook / CLI | ⏸ later | MV3 constraints |

## UI/UX (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 20 | Dark/light theme toggle | ✅ done | Shipped in v0.7.0 |
| 21 | Responsive panel layout | ⏸ later | Partial mobile polish already shipped |
| 22 | Advanced markdown editor | ❌ won't | Out of scope for lean MV3 UX |
| 23 | Notification system | ⏸ later | |

## Security (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 24 | Enhanced CSP | ⏸ later | Incremental hygiene |
| 25 | Data encryption at rest | ⏸ later | |
| 26 | Granular privacy dashboard | ⏸ later | |

## Developer experience (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 27 | Plugin system / marketplace | ⏸ later | Conflicts with no-build ethos |
| 28 | Testing framework | ⏸ later | Prefer minimal, no-npm checks first |
| 29 | Developer documentation | ⏸ later | AGENTS.md + README cover basics |

## Mobile-specific (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 30 | Android Quick Settings tile / share | ❌ won't | Outside this extension repo |
| 31 | Offline capabilities | ⏸ later | Ollama path partially covers local models |

## Sync & collaboration (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 32 | Real-time collaboration | ⏸ later | |
| 33 | Version control for conversations | ⏸ later | |

## Performance (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 34 | Lazy loading / code splitting | ⏸ later | No bundler today |
| 35 | Caching system | ⏸ later | |
| 36 | Memory management / virtualization | ⏸ later | |

---

## Items that came from ROADMAP (not numbered above)

| Item | Status | Notes |
| --- | --- | --- |
| Gist chat history sync | ✅ done | Shipped in v0.6.0 |
| Prompt library already in settings Gist | ✅ done | Values sync with settings blob |
| Prompt-library Gist UX (`includePrompts` + merge) | ✅ done | Shipped in v0.7.0 |
| Screenshot-to-vision polish | ✅ done | Shipped in v0.7.0 |
| Native FastVLM on Android | ❌ won't | Outside this extension repo; PC bridge remains supported |
| MEGA backup backend | ⏸ later | Gist stays default |
| Custom theme marketplace / Zapier | ❌ won't | |

---

## Original priority matrix (historical)

Kept for context; **current schedule is ROADMAP v0.7 → v0.8 → Later**.

### Quick wins (were 1–2 days each)

1. Keyboard shortcuts → ✅ v0.7
2. Response regeneration → ✅ v0.7
3. Dark/light theme → ✅ v0.7
4. Custom system prompts → ✅ v0.7
5. Message pinning → later

### Medium effort (were 1–2 weeks each)

1. Streaming in agent mode → ✅ v0.8
2. Per-site agent allow/deny → ✅ v0.8
3. Advanced markdown editor → won't
4. Context window management → later
5. Basic analytics → later

### Long-term (were 1+ months each)

1. Multi-turn memory → later
2. Plugin system → later
3. Real-time collaboration → later
4. Offline capabilities → later
5. Android deep integration → won't (outside this repo)

---

*Archive last updated: July 2026. Edit ROADMAP.md for active planning.*
