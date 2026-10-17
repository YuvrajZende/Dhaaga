# Happenstance Clone — Requirements

**One-sentence problem statement:** A web app where a user connects their Google account, the system builds a person-profile network from their Gmail/Contacts/Calendar, and the user can search that network in plain English ("most promising AI founders in my network") to get AI-ranked person cards with a warm-intro path to each result.

**Purpose:** Learning / portfolio project. Real Google OAuth connectors for your own account. Web only. No production security/compliance obligations.

---

## 1. Functional Requirements

### A. Auth & data ingestion
1. **Sign in with Google** (OAuth 2.0, least-privilege read-only scopes).
2. **Connect sources:** Gmail, Google Contacts, Google Calendar — with per-source connect/disconnect toggles.
3. **Import contacts** into person profiles: name, email, avatar, company/title where derivable, deduplication across sources (same person in Gmail + Contacts + Calendar = one profile).
4. **Infer connection strength** per contact from interaction signals: email frequency/recency, direct vs CC'd, calendar meeting count/recency. Store a 0–100 score.
5. **Extract relationship context**: companies you exchanged email with, domains, meeting topics (optional, feeds search quality).
6. **Manual re-sync**: a refresh button per source; incremental sync (only new/changed data).
7. **Data controls**: "delete all my imported data" button; disconnecting a source removes its contribution.

### B. Natural-language search (the core)
8. **Plain-English query input**: "Most promising AI founders in my network."
9. **Query decomposition**: an LLM breaks the query into multiple underlying searches (semantic + structured filters, e.g. title contains "founder", company AI-related). Show progress feedback ("Ran 3 searches…").
10. **Semantic index**: every person profile is embedded (bio = name + title + company + interaction context) into a vector store.
11. **AI-ranked results table**: Person / Thinking (rationale) / Mutuals columns, ranked strongest-first.
12. **Per-result explanation**: one line of reasoning ("real momentum and operator pedigree").
13. **Person result cards**: name, title/company, one-line AI summary, mutual-connection chips, connection strength indicator.
14. **"Find more"**: generate additional results on demand.
15. **Search history**: recent queries list (cheap, useful).

### C. Warm path & intro drafts
16. **Warmest path detection**: for any result, show your best route — direct connection, or you → mutual → target (mutual = your strongest shared connection).
17. **Auto-drafted intro request**: a ready-to-send message to the mutual asking for the intro, editable in a composer.
18. **Export the draft**: copy-to-clipboard and mailto: link (no actual email sending in v1).

### D. Constellation graph
19. **Network map**: your network rendered as a force-directed graph — people as nodes (size = connection strength), edges between you and contacts (and strong contact↔contact edges).
20. **Path highlighting**: selecting a search result highlights the path you → mutual → target on the graph.
21. **Basic navigation**: pan, zoom, click a node to open its profile card.

### E. Friends & second-degree search
22. **Add friends** (other users of the app, by email/link).
23. **Opt-in network sharing**: a user explicitly enables "let friends search my network" (share = public profiles + embeddings, never raw emails).
24. **Second-degree search**: same NL search includes opt-in friends' networks; results show "via [friend]" provenance.
25. **Groups**: create/join groups (e.g., "YC batch"); group members' opt-in networks are pooled for search.

---

## 2. Non-Functional Requirements

| # | Constraint | Target | Notes / assumption |
|---|-----------|--------|--------------------|
| N1 | Scale | 1 primary user, ~50k contacts; 2nd-degree ≤ 1M person-edges with ≤ 10 test users | Brute-force in-memory vector search is fine at 50k; pgvector covers 2nd degree |
| N2 | Search latency | p95 < 5 s end-to-end, including LLM decomposition + ranking | LLM calls dominate; local vector pre-filter must be < 1 s |
| N3 | Data freshness | Stale up to 24 h is acceptable; sync is manual + a nightly job | Real-time push sync explicitly not required |
| N4 | Consistency | Eventual consistency everywhere; no requirement for read-your-write across sync | Search may miss a contact synced seconds ago |
| N5 | Availability | Single region, best effort — it's a portfolio app | No nines target |
| N6 | LLM cost | ≤ 5 sub-searches per query; cap result ranking to top ~100 candidates sent for reranking | Cost per search bounded |
| N7 | Privacy | Raw email bodies never persisted — only headers/metadata (sender, recipient, timestamps, subject hash). "Your data is never used to train models." | Mirrors the real product's posture |
| N8 | Security | OAuth tokens encrypted at rest; read-only Google scopes; no third-party analytics | Even as a portfolio app, don't store full mailboxes |
| N9 | Read:write ratio | Heavily read-dominated (~99:1 — many searches, rare syncs) | favors precomputed index over per-query joins |

---

## 3. Out of Scope (explicitly deferred)

- **Non-Google connectors** — LinkedIn, Twitter/X, Instagram, Outlook, Apple Contacts (no usable APIs and/or ToS problems; Google-only is already real data).
- **iPhone / native mobile app.**
- **Public REST API, MCP server, CLI.**
- **Actually sending emails / in-app messaging** — drafts only in v1.
- **SOC 2, billing, subscriptions, teams/admin** — personal project.
- **>2nd-degree reach** — no transitive "friend of friend" search.
- **Real-time sync** (webhooks/push) — nightly + manual is enough.
- **Email body content analysis** — metadata only (see N7).
- **Moderation, analytics dashboards, public profiles pages.**

---

## 4. Stated Assumptions

- You have (or will create) a Google account for testing and an LLM API key (Anthropic or OpenAI).
- The app supports a handful of accounts (you + ~5–10 test users for friends/groups); not hardened for public signup abuse.
- Friends' network sharing defaults to OFF; sharing grants search-index access to public profile data + connection strengths, never message content.
- Gmail import uses header/metadata scopes; full body ingestion is out of scope by design.

## 5. Core ranking (what v1 lives or dies by)

1. **NL search + AI ranking** — the product's identity.
2. **Warm path + intro drafts** — the reason results are actionable.
3. Constellation graph — differentiator, build after the above works.
4. Friends & groups (2nd degree) — last; needs test users and sharing infra.

Suggested build order: **ingest → dedupe/score → embed/index → search pipeline → result cards → warm path → graph → 2nd degree.**
