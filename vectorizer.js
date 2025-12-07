// ~/fastapi_app/static/desktop/vectorizer.js
// Lightweight Client-Side Semantic Search via Local Co-Occurrence Vectorization

(function() {
  'use strict';

  // =========================================================================
  // CONFIGURATION
  // =========================================================================
  
  const CONFIG = {
    // Window size for co-occurrence (±N tokens around each term)
    windowSize: 7,
    
    // Minimum term frequency to include in vectors
    minFrequency: 2,
    
    // Maximum terms to consider (memory management)
    maxTerms: 10000,
    
    // Minimum similarity threshold for expansion
    minSimilarity: 0.3,
    
    // Maximum expanded terms per query term
    maxExpansions: 5,
    
    // Common stopwords to ignore
    stopwords: new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
      'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
      'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
      'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
      'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
      'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
      'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
      'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had',
      'were', 'said', 'did', 'having', 'may', 'should', 'does', 'am'
    ])
  };

  // =========================================================================
  // TOKENIZATION
  // =========================================================================
  
  /**
   * Tokenize text into words and multi-word phrases
   */
  function tokenize(text) {
    // Convert to lowercase
    text = text.toLowerCase();
    
    // Extract tokens (words and numbers)
    // Preserve hyphenated terms and phrases
    const tokens = [];
    
    // Match words, numbers, and hyphenated terms
    const wordPattern = /\b[a-z][a-z0-9\-]*\b/g;
    let match;
    
    while ((match = wordPattern.exec(text)) !== null) {
      const token = match[0];
      
      // Skip stopwords
      if (CONFIG.stopwords.has(token)) continue;
      
      // Skip very short tokens
      if (token.length < 2) continue;
      
      tokens.push({
        term: token,
        position: match.index
      });
    }
    
    return tokens;
  }

  /**
   * Extract multi-word phrases (bigrams and trigrams)
   */
  function extractPhrases(tokens) {
    const phrases = [];
    
    // Bigrams (2-word phrases)
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i].term} ${tokens[i + 1].term}`;
      phrases.push({
        term: bigram,
        position: tokens[i].position,
        type: 'bigram'
      });
    }
    
    // Trigrams (3-word phrases)
    for (let i = 0; i < tokens.length - 2; i++) {
      const trigram = `${tokens[i].term} ${tokens[i + 1].term} ${tokens[i + 2].term}`;
      phrases.push({
        term: trigram,
        position: tokens[i].position,
        type: 'trigram'
      });
    }
    
    return phrases;
  }

  // =========================================================================
  // CO-OCCURRENCE MATRIX BUILDING
  // =========================================================================
  
  /**
   * Build co-occurrence matrix from document text
   */
  function buildCoOccurrenceMatrix(text) {
    console.log('Vectorizer: Building co-occurrence matrix...');
    
    // Tokenize
    const tokens = tokenize(text);
    console.log(`Vectorizer: Extracted ${tokens.length} tokens`);
    
    // Extract phrases
    const phrases = extractPhrases(tokens);
    
    // Combine tokens and phrases
    const allTerms = [...tokens, ...phrases];
    
    // Count term frequencies
    const termFreq = new Map();
    allTerms.forEach(item => {
      const count = termFreq.get(item.term) || 0;
      termFreq.set(item.term, count + 1);
    });
    
    // Filter by minimum frequency
    const validTerms = allTerms.filter(item => 
      termFreq.get(item.term) >= CONFIG.minFrequency
    );
    
    console.log(`Vectorizer: ${validTerms.length} terms after frequency filter`);
    
    // Build co-occurrence matrix using sliding window
    const coOccurrence = new Map();
    
    for (let i = 0; i < validTerms.length; i++) {
      const centerTerm = validTerms[i].term;
      
      if (!coOccurrence.has(centerTerm)) {
        coOccurrence.set(centerTerm, new Map());
      }
      
      const centerVector = coOccurrence.get(centerTerm);
      
      // Look at surrounding terms within window
      const windowStart = Math.max(0, i - CONFIG.windowSize);
      const windowEnd = Math.min(validTerms.length - 1, i + CONFIG.windowSize);
      
      for (let j = windowStart; j <= windowEnd; j++) {
        if (i === j) continue; // Skip self
        
        const contextTerm = validTerms[j].term;
        
        // Increment co-occurrence count
        const count = centerVector.get(contextTerm) || 0;
        centerVector.set(contextTerm, count + 1);
      }
    }
    
    console.log(`Vectorizer: Built matrix for ${coOccurrence.size} terms`);
    
    return {
      matrix: coOccurrence,
      termFrequencies: termFreq,
      totalTerms: validTerms.length
    };
  }

  // =========================================================================
  // VECTOR SIMILARITY
  // =========================================================================
  
  /**
   * Calculate cosine similarity between two sparse vectors
   */
  function cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2) return 0;
    if (vec1.size === 0 || vec2.size === 0) return 0;
    
    // Calculate dot product
    let dotProduct = 0;
    for (const [term, count1] of vec1.entries()) {
      if (vec2.has(term)) {
        dotProduct += count1 * vec2.get(term);
      }
    }
    
    // Calculate magnitudes
    let mag1 = 0;
    for (const count of vec1.values()) {
      mag1 += count * count;
    }
    mag1 = Math.sqrt(mag1);
    
    let mag2 = 0;
    for (const count of vec2.values()) {
      mag2 += count * count;
    }
    mag2 = Math.sqrt(mag2);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    return dotProduct / (mag1 * mag2);
  }

  /**
   * Find most similar terms to a query term
   */
  function findSimilarTerms(queryTerm, coOccurrenceData, maxResults = 5) {
    const { matrix } = coOccurrenceData;
    
    queryTerm = queryTerm.toLowerCase();
    
    // Get vector for query term
    const queryVector = matrix.get(queryTerm);
    if (!queryVector) {
      return []; // Term not in vocabulary
    }
    
    // Calculate similarity to all other terms
    const similarities = [];
    
    for (const [term, termVector] of matrix.entries()) {
      if (term === queryTerm) continue; // Skip self
      
      const similarity = cosineSimilarity(queryVector, termVector);
      
      if (similarity >= CONFIG.minSimilarity) {
        similarities.push({ term, similarity });
      }
    }
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return top N
    return similarities.slice(0, maxResults);
  }

  // =========================================================================
  // QUERY EXPANSION
  // =========================================================================
  
  /**
   * Expand a user query with semantically similar terms
   */
  async function expandQuery(queryText, documentId) {
    console.log('Vectorizer: Expanding query:', queryText);
    
    // Get vectors for document
    const vectors = await window.InvantiaDB.getVectors(documentId);
    
    if (!vectors) {
      console.warn('Vectorizer: No vectors found for document', documentId);
      // Return query terms without expansion
      const tokens = tokenize(queryText);
      return tokens.map(t => ({
        originalTerm: t.term,
        expandedTerms: [t.term],
        similarities: [1.0]
      }));
    }
    
    // Tokenize query
    const queryTokens = tokenize(queryText);
    const queryPhrases = extractPhrases(queryTokens);
    const allQueryTerms = [...queryTokens, ...queryPhrases];
    
    // Get unique terms
    const uniqueTerms = [...new Set(allQueryTerms.map(t => t.term))];
    
    console.log('Vectorizer: Query terms:', uniqueTerms);
    
    // Expand each term
    const expandedConcepts = [];
    
    for (const term of uniqueTerms) {
      const similar = findSimilarTerms(term, vectors, CONFIG.maxExpansions);
      
      const concept = {
        originalTerm: term,
        expandedTerms: [term, ...similar.map(s => s.term)],
        similarities: [1.0, ...similar.map(s => s.similarity)]
      };
      
      expandedConcepts.push(concept);
      
      console.log(`Vectorizer: "${term}" → ${concept.expandedTerms.length} terms`);
    }
    
    return expandedConcepts;
  }

  /**
   * Expand query across multiple documents
   */
  async function expandQueryMultiDoc(queryText, documentIds) {
    console.log('Vectorizer: Expanding query across', documentIds.length, 'documents');
    
    // Collect all expansions from all documents
    const allExpansions = new Map();
    
    for (const docId of documentIds) {
      const docExpansions = await expandQuery(queryText, docId);
      
      // Merge expansions
      for (const concept of docExpansions) {
        const term = concept.originalTerm;
        
        if (!allExpansions.has(term)) {
          allExpansions.set(term, {
            originalTerm: term,
            expandedTerms: new Set([term]),
            similarities: new Map([[term, 1.0]])
          });
        }
        
        const merged = allExpansions.get(term);
        
        // Add new expanded terms
        concept.expandedTerms.forEach((expandedTerm, idx) => {
          merged.expandedTerms.add(expandedTerm);
          
          // Keep highest similarity if term appears multiple times
          const existingSim = merged.similarities.get(expandedTerm) || 0;
          const newSim = concept.similarities[idx];
          if (newSim > existingSim) {
            merged.similarities.set(expandedTerm, newSim);
          }
        });
      }
    }
    
    // Convert back to array format
    const result = [];
    for (const [term, data] of allExpansions.entries()) {
      const expandedArray = Array.from(data.expandedTerms);
      const similaritiesArray = expandedArray.map(t => data.similarities.get(t) || 0);
      
      result.push({
        originalTerm: term,
        expandedTerms: expandedArray,
        similarities: similaritiesArray
      });
    }
    
    return result;
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  
  window.InvantiaVectorizer = {
    buildCoOccurrenceMatrix,
    expandQuery,
    expandQueryMultiDoc,
    tokenize,
    
    // Expose for testing/debugging
    findSimilarTerms,
    cosineSimilarity,
    CONFIG
  };

  console.log('Vectorizer module loaded');

})();
