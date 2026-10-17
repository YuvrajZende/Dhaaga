# Happensten — AI Relationship Graph & Semantic Network Search

> **Find anyone in your private network and warm mutual paths using natural language.**  
> Built with Next.js 16 (App Router), Neon Postgres with `pgvector` (`halfvec384`), local ONNX embeddings (`all-MiniLM-L6-v2`), and OpenRouter LLM reranking.

---

## 🌟 Overview

**Happensten** is a private, intelligent relationship graph that turns scattered contacts across Google Workspace, LinkedIn, X, Instagram, Facebook, and personal notes into an AI-searchable directory. 

Instead of searching by exact keyword or scrolling through contact lists, users can search by intent, activities, and skills:
- *"I am looking for a mate who can cook for me"*
- *"Musician for my birthday party who plays acoustic guitar"*
- *"AI researchers or backend engineers at early-stage startups"*
- *"Friend in my network who knows French pastry baking"*

---

## 🏗️ Architecture & Pipeline

```
                                 User Query
                                     │
                                     ▼
                        Query Decomposition & Intent
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌───────────────────────────┐                       ┌──────────────────────┐
│   Intent Extraction       │                       │  Sub-Search Planning │
│   - activity: "cooking"   │                       │  - Semantic (k=400)  │
│   - relationship: "mate"  │                       │  - Structured filter │
│   - location: null        │                       └──────────┬───────────┘
└──────────┬────────────────┘                                  │
           └─────────────────────────┬─────────────────────────┘
                                     │
                                     ▼
                         Hybrid Candidate Fan-out
                      (Local Vector + Relational DB)
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       Vector Similarity                       Metadata Filtering
   (pgvector halfvec cosine)               (hobbies, skills, bio notes)
                 └───────────────────┬───────────────────┘
                                     │
                                     ▼
                        Warm-Path Mutual Discovery
                     (Highest weighted trust edges)
                                     │
                                     ▼
                           LLM Candidate Reranker
                 (Activity Match + Connection Fit = Score)
                                     │
                                     ▼
                        Real-time SSE Event Stream
                         (Planning → Results → Cards)
```

---

## 🚀 Key Features

### 1. Multi-Source Ingestion Pipeline
- **Google Workspace**: Direct OAuth 2.0 incremental sync with encrypted token rotation (`AES-256-GCM`).
- **LinkedIn**: CSV archive parser handling preamble notes and canonical email enrichment.
- **X (Twitter)**: Export archive parser (`following.js`) with client-side zip support.
- **Instagram**: JSON/ZIP export parser for following and connections.
- **Facebook**: Meta export parser for friends list.
- **Personal Notes & Hobbies**: CSV/JSON upload and quick-add form capturing personal hobbies, career notes, and skills for hyper-accurate semantic matching.

### 2. Intent-Driven Semantic Search
- **Structured Intent Extraction**: Extracts core activity, role/relationship, location, and constraints.
- **Local ONNX Embeddings**: Free, private, and deterministic embeddings generated locally using `@huggingface/transformers` (`all-MiniLM-L6-v2`, 384 dimensions).
- **Metadata Filtering**: Direct boosts for contacts with explicit matching hobbies, skills, or titles.
- **Multi-Dimensional Reranking**: Composite match scores (`activityMatch` + `connectionFit`) with human-readable rationale chips.

### 3. Warm Path Discovery & Outreach
- **Trust Edge Weights**: Automatic strength scoring based on interaction signals and shared threads.
- **Mutual Introductions**: Traverses mutual connections to recommend the warmest bridge path.
- **AI Intro Draft Composer**: 1-click tailored introduction drafts ready to send via email.

---

## 🔒 Security & Privacy Model

- **Multi-Tenant Isolation**: Contacts and embeddings are strictly isolated by `owner_user_id`. No user can read, query, or modify another user's address book.
- **Tenant-Scoped Decomposition Cache**: Cache keys are scoped by `sha256(userId + ":" + normQuery)`, preventing cross-tenant disclosure of network company domains or private context.
- **Network Sharing Authorization**: Shared-network searches strictly verify accepted friendships and require explicit `sharingEnabled: true` opt-in. Spoofed friend IDs are purged automatically.
- **Encrypted Tokens at Rest**: OAuth tokens are encrypted with AES-256-GCM using authenticated additional data (`AAD`).
- **Fail-Closed Cron Endpoints**: Maintenance and sweeper cron endpoints strictly reject requests when `CRON_SECRET` is unset or invalid.

---

## 🛠️ Quickstart Guide

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Postgres Database**: Neon Postgres or standard PostgreSQL with `pgvector` extension enabled (`halfvec` support).
- **OpenRouter API Key**: For LLM query decomposition and candidate reranking.

### 2. Environment Configuration
Create a `.env` file in the project root:

```env
# Database (Postgres with pgvector)
DATABASE_URL="postgresql://user:password@ep-round-pooler.us-east-2.aws.neon.tech/happensten?sslmode=require"

# LLM Provider (OpenRouter)
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openrouter/free" # Or google/gemma-2-9b-it:free, qwen/qwen-2.5-7b-instruct:free

# Auth & Encryption
SESSION_SECRET="your-32-byte-hex-session-secret"
TOKEN_ENCRYPTION_KEY="your-32-byte-hex-encryption-key"

# Cron Security (Production sweeps fail closed if unset)
CRON_SECRET="production-cron-secret-token"

# Google OAuth (Optional for Google Sync)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"
```

### 3. Database Migration
Ensure the database schema and extensions are created:

```bash
npm run db:migrate
```

### 4. Running the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Test Suites

Run the automated test suites:

```bash
# Run all core tests + security and isolation tests
npm test

# Run security, tenant isolation, and authorization boundary tests
npm run test:security

# Run Phase 3 search and decomposition tests
npm run test:phase3

# Run Phase 4 graph and warm-path tests
npm run test:phase4

# Run Phase 5 import and archive parser tests
npm run test:imports
```

---

## 📂 Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router (pages and API routes)
│   │   ├── api/
│   │   │   ├── cron/           # Fail-closed maintenance cron jobs
│   │   │   ├── import/         # LinkedIn, X, IG, FB, Personal CSV importers
│   │   │   ├── people/         # Contact profiles and inline enrichment
│   │   │   └── search/         # SSE streaming search endpoint
│   │   ├── onboarding/         # Source connection and data upload dashboard
│   │   └── search/             # Interactive search experience UI
│   ├── components/
│   │   ├── onboarding/         # Ingestion cards (Google, LinkedIn, Personal, etc.)
│   │   ├── person/             # Contact profile editor & private notes
│   │   └── search/             # Result cards, warm-path viz, draft composer
│   └── lib/
│       ├── db/                 # Drizzle ORM schema, repositories, and migrations
│       ├── embed/              # ONNX embedding model (all-MiniLM-L6-v2) & worker queue
│       ├── import/             # Archive parsers (CSV, JSON, ZIP)
│       ├── llm/                # OpenRouter client & circuit breaker
│       ├── search/             # Decomposition, fan-out, RRF ranking, SSE
│       └── warmpath/           # Trust calculation and mutual path selector
└── tests/                      # Unit, integration, security & benchmark tests
```

---

## 📄 License
MIT License. Created for private, intelligent relationship discovery.
