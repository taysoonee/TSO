# Skill: TSO Token Efficiency (Frugal Ingest)

This skill defines the architectural standards for "Frugal Ingestion" within the Taylor's Schools Second Brain. Follow these patterns to ensure maximum intelligence throughput with minimum token waste.

## The Frugal Ingest Pattern

### 1. The Single-Turn Batch (Preferred)
Instead of iterating through files in a loop, collect all pending files and submit them in a single, high-density prompt.
- **Tooling**: Use `python3 TSO/scripts/frugal_ingest_k12.py`.
- **Structure**: Wrap files in XML tags `<document name="...">...</document>`.
- **Benefit**: Reduces baseline context cost (Ledger, SITREP) from N-times to 1-time.

### 2. Deterministic Sanitisation Shield
Never use LLM instructions to strip private data (Cat, XE, Plates). This wastes tokens on logic that can be performed deterministically.
- **Implementation**: Run a regex post-processor on all LLM outputs before disk-write.
- **Reference**: See `sanitize_content()` in `TSO/scripts/frugal_ingest_k12.py`.

### 3. Context Caching for Large Baselines
If your baseline context (SITREP + Ledger + Guidelines) exceeds 32,768 tokens, you MUST use Gemini Context Caching.
- **Implementation**:
  ```python
  client.caches.create(model="gemini-1.5-pro", config=types.CreateCachedContentConfig(contents=baseline, ttl=...))
  ```

### 4. Smart Triage (Flash-Lite)
Always use the cheapest model (`gemini-3.1-flash-lite`) to decide which files require more expensive models (`gemini-3.1-pro-preview`).
- **Triage Logic**:
  - `BATCH`: For structured data extraction (Fees, Dates).
  - `SINGLE`: For strategic synthesis (Competitor moves, MOE policy).

## Audit Mandate
Every architectural change to `TSO/` must be reviewed by a `token_auditor` subagent to ensure compliance with this skill.
