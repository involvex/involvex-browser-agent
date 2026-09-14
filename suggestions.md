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
| 🆕 proposed | New candidate (Sept 2026, numbered #39–#53, see below) |

Effort: `S` = 1–2 days, `M` = 3–7 days, `L` = 2+ weeks. Numbers are sequential and stable — never reuse.

---

## High-priority (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Streaming responses in Agent mode | ✅ done | Shipped in v0.8.0 |
| 2 | Per-site agent allow/deny list | ✅ done | Shipped in v0.8.0 |
| 3 | Multi-turn conversation memory | ⏸ later | |
| 37 | JSON output parsing improvement in agent mode | ✅ done | Shipped in v0.8.0 (fenced/non-fenced + outer-quote unwrap + format-nudge retry) |
| 38 | Agent "continue" after step limit | ✅ done | Shipped in v0.8.0 (Continue button, convo + page context preserved) |
| 4 | Custom system prompts | ✅ done | Shipped in v0.7.0 |
| 5 | Keyboard shortcuts | ✅ done | Shipped in v0.7.0 |

## Medium-priority (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 6 | Response regeneration | ✅ done | Shipped in v0.7.0 |
| 7 | Message pinning & bookmarks | ✅ done | Pins assistant messages with 📌/★; persists via localStorage; count shown in panel bar |
| 8 | Context window management UI | ✅ done | Context window management UI implemented with token estimates + section picker in panel; useful after vision/RAG polish |
| 9 | Multi-language UI (i18n) | ⏸ later | |
| 10 | Voice input/output | ⏸ later | |

## Agent mode enhancements (original)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 11 | Expanded tool set | ✅ done (subset) | wait/scroll_to/extract in v0.8.0 |
| 12 | Agent workflow templates | ⏸ later | |
| 13 | Agent step visualization | ✅ done (subset) | Step bar + pause/cancel in v0.8.0 |
| 14 | Agent safety controls | ✅ done (subset) | Confirmations in v0.8.0 |
| 15 | Parse action JSON robustness | ✅ done | Duplicate of #37 — merged, shipped in v0.8.0 |
| 16 | Agent continue after step limit | ✅ done | Duplicate of #38 — merged, shipped in v0.8.0 |

## Analytics & insights (original)

> Note: original IDs reused #15/#16 — relabeled #15b/#16b to keep numbers stable.

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 15b | Usage analytics (opt-in local) | ⏸ later | Hygiene when capacity allows |
| 16b | Page content insights | ⏸ later | |

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
| 35 | Caching system | ✅ done | In-memory + localStorage cache for page content; reduces redundant extractions on repeated asks |
| 36 | Memory management / virtualization | ✅ done | History message limit (last 50 messages) auto-trims oldest; prevents unbounded growth |

---

## Items that came from ROADMAP (not numbered above)

| Item | Status | Notes |
| --- | --- | --- |
| Gist chat history sync | ✅ done | Shipped in v0.6.0 |
| Prompt library already in settings Gist | ✅ done | Values sync with settings blob |
| Prompt-library Gist UX (`includePrompts` + merge) | ✅ done | Shipped in v0.7.0 |
| Screenshot-to-vision polish | ✅ done | Shipped in v0.7.0 |
| File backup & restore (JSON export/import) | ✅ done | Shipped in v0.8.0 (includes API keys, unlike Gist) |
| Agent JSON resilience (outer-quote unwrap) | ✅ done | Shipped in v0.8.0 |
| Agent debug panel (raw output details) | ✅ done | Shipped in v0.8.0 (up to 2000 chars) |
| Keyboard shortcut bar in panel | ✅ done | Shipped in v0.8.0 (hidden on narrow mobile) |
| ADB push auto-packages | ✅ done | Shipped in v0.8.0 (`adb-update.ps1` runs packager first) |
| Native FastVLM on Android | ❌ won't | Outside this extension repo; PC bridge remains supported |
| MEGA backup backend | ⏸ later | Gist stays default |
| Custom theme marketplace / Zapier | ❌ won't | |

---

## New candidates (post-v0.8, Sept 2026)

Numbers #39–#53 are sequential and stable. Status `🆕 proposed → Later` means
candidate for `ROADMAP.md Later` — not scheduled until capacity appears.
#47 / #48 / #51 are filed into ROADMAP Later per approval.

| # | Feature | Status | Effort | Notes |
| --- | --- | --- | --- | --- |
| 39 | Stop generation button | 🆕 proposed → Later | S | AbortController for Ask streaming; panel Stop/Cancel affordance |
| 40 | Copy-code button on code blocks | 🆕 proposed → Later | S | Pure panel.js/CSS; per `<pre><code>` copy affordance |
| 41 | Token estimate + cost meter in panel | 🆕 proposed → Later | S | Reuses usage meter + `getModelPricing`; high trust value |
| 42 | In-conversation search (scoped Ctrl+F) | 🆕 proposed → Later | S | History search is global; this is in-chat filtering |
| 43 | Response language selector | 🆕 proposed → Later | S | Cheaper than full i18n; precedes parked #9 |
| 44 | Retry failed request with backoff | 🆕 proposed → Later | S | Small wrapper in providers.js for flaky gateways |
| 45 | Provider health / Load-models error hint | 🆕 proposed → Later | S | Reduce empty-model-list confusion; Ollama CORS hint (`OLLAMA_ORIGINS`) |
| 46 | Summarize / ELI5 / Translate templates | 🆕 proposed → Later | S | Reuses prompt library; no new infra |
| 47 | Image / file attachment to prompt | 🆕 proposed → Later | M | Reuse vision path (`buildUserMessage`); 1280px/JPEG-0.72; Ask-only V1; strip dataURLs before session save; needs Anthropic mapping + Gemini-stream image fix |
| 48 | PDF / long-doc summarization flow | 🆕 proposed → Later | M | New `src/pdf.js` regex extractor (no pdf.js dep); ≤10MB; reuse RAG chunks + 12k cap; honest fallback for scanned/encrypted |
| 49 | Chat folders / tags + bulk delete | 🆕 proposed → Later | M | 50-chat cap exists; organization does not |
| 50 | Per-provider model params UI (temp/top-p) | 🆕 proposed → Later | M | Custom prompts exist; no sampling control yet |
| 51 | Agent recipe / workflow templates (subset) | 🆕 proposed → Later | M | 3 built-ins (summarize+extract, form-fill, compare links) via `AGENT_RECIPES` in prompts.js; reuse `runAgent` loop, 8-step cap, confirmations |
| 52 | Selection bubble polish (mobile-safe) | 🆕 proposed → Later | M | Selection actions exist; no floating bubble |
| 53 | Backup verify + restore dry-run | 🆕 proposed → Later | M | Gist + file backup exist; no integrity check |

---

## Original priority matrix (HISTORICAL)

Kept for context; **current schedule is ROADMAP v0.8.0 → Later**.
Do not schedule from this section — see “New candidates” above and ROADMAP Later.

### Quick wins (were 1–2 days each)

1. Keyboard shortcuts → ✅ v0.7
2. Response regeneration → ✅ v0.7
3. Dark/light theme → ✅ v0.7
4. Custom system prompts → ✅ v0.7
5. Message pinning → ✅ done

### Medium effort (were 1–2 weeks each)

1. Streaming in agent mode → ✅ v0.8
2. Per-site agent allow/deny → ✅ v0.8
3. Advanced markdown editor → won't
4. Context window management → ✅ done
5. Basic analytics → later
6. Conversation virtualization → ✅ done
7. Minimal automated tests → ✅ done

### Long-term (were 1+ months each)

1. Multi-turn memory → later
2. Plugin system → later
3. Real-time collaboration → later
4. Offline capabilities → later
5. Android deep integration → won't (outside this repo)

### Quick wins (Sept 2026 — from #39–#46)

1. #39 Stop generation → Later (S)
2. #40 Copy-code button → Later (S)
3. #41 Token/cost meter → Later (S)
4. #43 Response language selector → Later (S)
5. #45 Provider health + Ollama CORS hint → Later (S)

### High-prio next (Sept 2026 — schedule when capacity allows)

1. #47 Image attachment → Later (M)
2. #48 PDF summarization → Later (M)
3. #50 Model params UI → Later (M)
4. #51 Agent recipes subset → Later (M)

---

*Archive last updated: September 2026. Active planning stays in ROADMAP.md.*
