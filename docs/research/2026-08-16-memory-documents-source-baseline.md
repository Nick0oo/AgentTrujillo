# Clinical memory, embeddings, and private documents baseline

Date: 2026-08-16

## Decisions

- Clinical memory is a confirmed, provenance-rich child fact ledger. Chat/document extraction creates candidates only; sensitive facts require explicit guardian confirmation before retrieval can influence an answer.
- Semantic retrieval must structurally filter both `care_space_id` and `child_id` before similarity ordering. RLS is defense in depth, not the only scope control.
- Google Gemini API is the sole initial embedding provider. The existing database is fixed at 768 dimensions; provider output, task type, normalization, model/version, input digest, and embedding digest are pinned and stored.
- Documents stay in existing private Supabase buckets. The server assigns opaque scoped paths and short-lived tickets. Client/model input never chooses a bucket/path, and no public URL is created.
- OCR/extraction is untrusted draft data. It cannot directly create vaccine, medication, anthropometry, development, or memory facts.

## Verified primary documentation

- [Google Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings) lists stable `gemini-embedding-2` and `gemini-embedding-001`, supports configurable dimensions, and places responsibility for uploaded content/privacy on the developer. The implementation leaf must verify installed `@ai-sdk/google` capability and pin an evaluated stable model; it must not silently swap embedding spaces.
- [Vercel AI SDK embeddings](https://ai-sdk.dev/docs/ai-sdk-core/embeddings) defines `embed`/`embedMany`, provider options, usage, retries, and model dimensions.
- [Vercel Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) exposes `google.textEmbedding(...)` and Google task/output-dimension options. The roadmap uses separate `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY` task types with one compatibility manifest.
- [Supabase RAG with permissions](https://supabase.com/docs/guides/ai/rag-with-permissions) describes pgvector retrieval protected by PostgreSQL RLS. Agent Trujillo adds explicit composite scope predicates inside the RPC before distance ordering.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) confirms Storage uses RLS and denies operations unless policies allow them.
- [Supabase private-bucket downloads](https://supabase.com/docs/guides/storage/serving/downloads) notes signed URLs remain valid until expiry even after Auth-key rotation; therefore tickets must be short-lived, one-purpose, and never logged.
- [Supabase bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals) distinguishes private from public buckets and supports MIME/size restrictions at bucket level.

## Existing schema facts to preserve and harden

- `clinical_memory_embeddings.embedding` is `vector(768)` and the declared dimension is constrained to 768.
- `match_clinical_memory` currently accepts a child ID and must be replaced/hardened to require composite trusted scope and pre-similarity filtering.
- `documents` and `document_links` already exist; five buckets are private. Forward migrations harden them rather than editing applied migrations.

## Release gates

Embedding model or dimension changes require a new compatibility version, parallel re-index, parity evaluation, atomic active-version switch, and rollback—not in-place mixed vectors. Memory deletion must remove or tombstone source, chunks, vectors, summaries, caches, links, and derived retrieval eligibility. Document malware scanning/extraction must fail closed; an unavailable scanner never marks an object clean.
