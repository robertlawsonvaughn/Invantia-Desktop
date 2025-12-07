# Intelligent Corpus Reduction: Old Wine in New Bottles

## The Problem: Too Much Context for Modern LLMs

Large Language Models have revolutionized how we interact with information, but they face a fundamental constraint: context window limits. Even with massive 100k+ token windows, processing entire document collections becomes impractical. More critically, flooding an LLM with irrelevant content degrades response quality through what researchers call "lost in the middle" effects—the model struggles to identify and use the truly relevant passages when buried in noise.

The solution? **Intelligent corpus reduction**: systematically reducing large document sets to precisely the content needed to answer specific queries. This isn't new thinking—it's a return to principles developed decades ago, adapted for the LLM era.

## The Classical Foundation: Vector Space Models (1970s-1980s)

Invantia's approach builds on the **Vector Space Model** (VSM), pioneered by Gerard Salton at Cornell in the 1970s for the SMART information retrieval system. The core insight was elegant: represent documents and queries as vectors in a high-dimensional space where each dimension corresponds to a term. Similarity becomes a geometric problem—documents "close" to the query vector are likely relevant.

Salton introduced **term weighting** schemes, most famously TF-IDF (Term Frequency-Inverse Document Frequency), which elevated important terms while downweighting common words. A term appearing frequently in one document but rarely across the collection must be significant for that document's topic. This simple heuristic proved remarkably effective and remains foundational to modern search.

## The Statistical Turn: Co-occurrence and Context (1990s)

The next evolution recognized that terms don't exist in isolation—they appear in **contexts**. If "configure" and "GPS" frequently appear near each other across documents, they're semantically related. This insight led to co-occurrence analysis and techniques like **Latent Semantic Analysis** (LSA, 1990), which used singular value decomposition to discover latent semantic structures.

Invantia implements a simple but effective co-occurrence matrix: for each term, track which other terms appear within a fixed window (±7 tokens). When a user searches for "configure GPS," the system expands the query with contextually related terms like "setup," "initialization," "navigation," and "positioning"—terms that frequently co-occur in the document corpus. This **query expansion** dramatically improves recall without requiring neural networks or external embeddings.

## Why Not Modern Embeddings?

One might ask: why use co-occurrence matrices when we have sophisticated transformer-based embeddings? The answer reveals a key design philosophy: **privacy, transparency, and computational efficiency**.

Modern embedding models require:
- Sending documents to external APIs (privacy concern)
- Large model downloads (computational overhead)  
- Black-box transformations (lack of auditability)

Invantia's co-occurrence approach runs entirely client-side in the browser, requires no external services, and produces explainable results. When "configure" expands to "setup," users can verify this relationship in their own documents. For legal and accounting firms—Invantia's target market—this transparency and privacy are non-negotiable.

## Hybrid Scoring: Combining Precision and Recall

The core innovation isn't the individual techniques—it's their **orchestration** for corpus reduction. Invantia employs a hybrid scoring system that balances multiple signals:

**Original Query Terms (100 points each)**: Exact matches to user-entered terms receive maximum weight. If someone asks about "GPS configuration," chunks containing both terms rank highest.

**Semantically Expanded Terms (30 points × similarity)**: Co-occurrence-based expansions contribute proportionally to their similarity score. A term with 0.8 similarity contributes 24 points.

**Proximity Bonus (up to 50 points)**: Terms appearing close together (within 200 characters) receive additional weight. This rewards passages where concepts are discussed together, not just mentioned separately.

This creates a **ranking cascade**: chunks with all original terms and tight clustering rank first (precision), while chunks with related terms still surface (recall). The minimum threshold (30 points) filters noise while preserving relevant content.

## From Chunks to Super Chunks: Respecting LLM Limits

After scoring and ranking, Invantia performs **intelligent packaging**: grouping the top-scored chunks into "super chunks" that fit within the target LLM's context window (30k for free accounts, 100k for paid). This respects the reality that users don't paste individual 2000-character chunks—they need coherent, sized payloads ready for their AI provider.

Critically, super chunks maintain **topic boundaries**. If a user asks multiple questions, results for each topic are grouped separately, creating a structured package that helps the LLM understand the organizational logic.

## The Philosophy: Deterministic Reduction Over Black-Box Retrieval

Modern RAG (Retrieval-Augmented Generation) systems often use neural retrievers—embedding models that map queries and documents to dense vectors, then retrieve by cosine similarity. This works but has drawbacks:

- **Non-deterministic**: Same query may return different results
- **Unauditable**: Why did this chunk rank #3? Hard to explain
- **Resource-intensive**: Requires GPU inference or API calls
- **Privacy-leaking**: Documents leave the user's control

Invantia's classical approach is:

- **Deterministic**: Same query, same documents → same results
- **Auditable**: Scoring is transparent—original terms, expanded terms, proximity
- **Lightweight**: Pure JavaScript, runs in-browser
- **Privacy-preserving**: Documents never leave the device

## Standing on the Shoulders of Giants

What Invantia demonstrates is that fundamental principles from the golden age of information retrieval (1970s-1990s) remain profoundly relevant. Salton's vector space model, TF-IDF weighting, co-occurrence analysis, query expansion—these weren't superseded by deep learning; they were **validated**.

The innovation is recognizing that for corpus reduction—the specific task of taking large document sets and reducing them to LLM-sized relevant subsets—you don't need the latest neural architecture. You need:

1. **Query understanding** (semantic expansion via co-occurrence)
2. **Relevance ranking** (hybrid scoring with multiple signals)
3. **Intelligent packaging** (super chunks respecting LLM limits)

These are solved problems. The "new" part is applying them to the LLM workflow, creating a bridge between classical IR and modern AI chat interfaces.

## Conclusion: Old Methods, New Context

Invantia's approach isn't revolutionary—it's **evolutionary**. It takes proven techniques from information retrieval's rich history and applies them to a new problem: preparing document corpora for LLM consumption. In doing so, it demonstrates that sometimes the best path forward is a well-traveled road from the past.

The vector space model is 50 years old. Co-occurrence analysis is 35 years old. But for the task of intelligent corpus reduction—finding the needle in the haystack and presenting it to an AI in a digestible format—these classical methods remain remarkably effective.

As the saying goes: "There's nothing new under the sun." Invantia proves that in the age of transformer models and billion-parameter networks, sometimes the oldest ideas are still the best ones.

---

**References & Further Reading:**

- Salton, G., Wong, A., & Yang, C. S. (1975). "A vector space model for automatic indexing." *Communications of the ACM*, 18(11), 613-620.
- Salton, G., & Buckley, C. (1988). "Term-weighting approaches in automatic text retrieval." *Information Processing & Management*, 24(5), 513-523.
- Deerwester, S., Dumais, S. T., Furnas, G. W., Landauer, T. K., & Harshman, R. (1990). "Indexing by latent semantic analysis." *Journal of the American Society for Information Science*, 41(6), 391-407.
- Church, K. W., & Hanks, P. (1990). "Word association norms, mutual information, and lexicography." *Computational Linguistics*, 16(1), 22-29.
