// ~/fastapi_app/static/desktop/search.js
// Query Engine v2.3 - Hybrid Scoring System with Topic Grouping

(function() {
  'use strict';

  // =========================================================================
  // SCORING CONFIGURATION
  // =========================================================================
  
  const SCORING_CONFIG = {
    // Weight for original query terms
    originalTermWeight: 100,
    
    // Weight for high-similarity expanded terms
    semanticWeight: 30,
    
    // Weight for term proximity (terms close together)
    proximityWeight: 50,
    
    // Minimum similarity threshold for high-quality expansions
    highSimilarityThreshold: 0.7,
    
    // Minimum score threshold (chunks below this are excluded)
    minimumScoreThreshold: 30,
    
    // Proximity distance (characters) for bonus
    proximityDistance: 200
  };

  // =========================================================================
  // QUERY EXECUTION
  // =========================================================================
  
  async function executeQuery(queryStructure) {
    console.log('Query Engine v2.3: Executing query with scoring', queryStructure);
    
    try {
      const normalizedQuery = normalizeQueryStructure(queryStructure);
      const allChunks = await fetchChunksForQuery(normalizedQuery);
      
      console.log(`Query Engine: Retrieved ${allChunks.length} total chunks`);
      
      // Execute each block (topic) independently and collect scored results
      const topicResults = [];
      
      for (let i = 0; i < normalizedQuery.blocks.length; i++) {
        const block = normalizedQuery.blocks[i];
        
        console.log(`\n=== Processing Topic ${block.topicId}: "${block.topicQuestion}" ===`);
        
        const scoredChunks = await executeBlockWithScoring(block, allChunks);
        
        topicResults.push({
          topicId: block.topicId,
          topicQuestion: block.topicQuestion,
          chunks: scoredChunks,
          totalMatches: scoredChunks.length
        });
        
        console.log(`Topic ${block.topicId}: ${scoredChunks.length} chunks above threshold`);
      }
      
      // Combine results maintaining topic grouping
      const combinedChunks = combineTopicResults(topicResults);
      
      console.log(`Query Engine: ${combinedChunks.length} total chunks after scoring`);
      
      // Create super chunks respecting topic boundaries
      const allSuperChunks = createSuperChunksWithTopics(
        topicResults,
        normalizedQuery.maxCharsPerSuperChunk,
        normalizedQuery.allTopics
      );
      
      console.log(`Query Engine: Created ${allSuperChunks.length} super chunk(s) total`);
      
      // Apply limit if requested
      console.log('Debug - Checking limit:', {
        limitSuperChunks: normalizedQuery.limitSuperChunks,
        maxSuperChunksPerTopic: normalizedQuery.maxSuperChunksPerTopic,
        willLimit: normalizedQuery.limitSuperChunks && normalizedQuery.maxSuperChunksPerTopic
      });
      
      let finalSuperChunks = allSuperChunks;
      if (normalizedQuery.limitSuperChunks && normalizedQuery.maxSuperChunksPerTopic) {
        finalSuperChunks = limitSuperChunksPerTopic(
          allSuperChunks,
          topicResults.length,
          normalizedQuery.maxSuperChunksPerTopic
        );
        console.log(`Query Engine: Limited to ${finalSuperChunks.length} super chunk(s) (${normalizedQuery.maxSuperChunksPerTopic} per topic)`);
      }
      
      // Format for LLM
      const formattedSuperChunks = await formatSuperChunks(
        finalSuperChunks,
        normalizedQuery.allTopics
      );
      
      return {
        query: normalizedQuery,
        totalChunks: combinedChunks.length,
        topicResults: topicResults,
        superChunks: formattedSuperChunks,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Query Engine: Execution error', error);
      throw error;
    }
  }

  // =========================================================================
  // QUERY NORMALIZATION
  // =========================================================================
  
  function normalizeQueryStructure(query) {
    if (!query.version || query.version === '1.0' || query.version === '2.0') {
      console.log(`Query Engine: Converting v${query.version || '1.0'} to v2.3 format`);
      
      return {
        ...query,
        version: '2.3',
        blocks: (query.blocks || []).map((block, index) => ({
          ...block,
          topicId: block.topicId || index + 1,
          topicQuestion: block.topicQuestion || `Topic ${index + 1}`,
          inclusionConcepts: block.inclusionConcepts || [],
          exclusionConcepts: block.exclusionConcepts || []
        })),
        allTopics: query.allTopics || []
      };
    }
    
    return query;
  }

  // =========================================================================
  // CHUNK RETRIEVAL
  // =========================================================================
  
  async function fetchChunksForQuery(queryStructure) {
    let chunks = [];
    
    if (queryStructure.sourceType === 'documents') {
      for (const docId of queryStructure.documentIds) {
        const docChunks = await window.InvantiaDB.getChunksByDocument(docId);
        chunks = chunks.concat(docChunks);
      }
    } else if (queryStructure.sourceType === 'collection') {
      chunks = await window.InvantiaDB.getChunksByCollection(queryStructure.collectionId);
    }
    
    return chunks;
  }

  // =========================================================================
  // BLOCK EXECUTION WITH SCORING
  // =========================================================================
  
  async function executeBlockWithScoring(block, searchableChunks) {
    console.log(`Scoring ${searchableChunks.length} chunks for topic ${block.topicId}`);
    
    if (!block.inclusionConcepts || block.inclusionConcepts.length === 0) {
      console.warn('No inclusion concepts provided');
      return [];
    }
    
    const concept = block.inclusionConcepts[0]; // Single concept with all terms
    
    // Score each chunk
    const scoredChunks = searchableChunks.map(chunk => {
      const score = scoreChunk(chunk, concept);
      return {
        ...chunk,
        relevanceScore: score.totalScore,
        scoreDetails: score
      };
    });
    
    // Filter by minimum threshold
    const qualifyingChunks = scoredChunks.filter(
      c => c.relevanceScore >= SCORING_CONFIG.minimumScoreThreshold
    );
    
    // Sort by score (descending)
    qualifyingChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`  - ${qualifyingChunks.length} chunks above threshold (${SCORING_CONFIG.minimumScoreThreshold})`);
    if (qualifyingChunks.length > 0) {
      console.log(`  - Top score: ${qualifyingChunks[0].relevanceScore.toFixed(1)}`);
      console.log(`  - Lowest score: ${qualifyingChunks[qualifyingChunks.length - 1].relevanceScore.toFixed(1)}`);
    }
    
    // Apply spatial filter if specified
    if (block.spatialCategory !== 'auto') {
      return filterBySpatialCategory(qualifyingChunks, block.spatialCategory);
    }
    
    return qualifyingChunks;
  }

  // =========================================================================
  // CHUNK SCORING (Hybrid Approach)
  // =========================================================================
  
  function scoreChunk(chunk, concept) {
    const content = chunk.content.toLowerCase();
    const terms = concept.terms || [];
    const originalTerms = concept.originalTerms || [];
    const termMetadata = concept.termMetadata || {};
    
    let originalTermScore = 0;
    let semanticScore = 0;
    let proximityScore = 0;
    
    const matchedTerms = [];
    const matchedOriginalTerms = [];
    
    // Score each term match
    terms.forEach(term => {
      const termLower = String(term).toLowerCase();
      if (content.includes(termLower)) {
        matchedTerms.push(term);
        
        const metadata = termMetadata[term] || { similarity: 0.5, isOriginal: false };
        
        if (metadata.isOriginal || originalTerms.includes(term)) {
          // Original query term - highest weight
          originalTermScore += SCORING_CONFIG.originalTermWeight;
          matchedOriginalTerms.push(term);
        } else if (metadata.similarity >= SCORING_CONFIG.highSimilarityThreshold) {
          // High-similarity expansion
          semanticScore += SCORING_CONFIG.semanticWeight * metadata.similarity;
        } else {
          // Lower-similarity expansion
          semanticScore += SCORING_CONFIG.semanticWeight * metadata.similarity * 0.5;
        }
      }
    });
    
    // Proximity bonus: Check if matched terms appear close together
    if (matchedTerms.length >= 2) {
      proximityScore = calculateProximityScore(content, matchedTerms);
    }
    
    const totalScore = originalTermScore + semanticScore + proximityScore;
    
    return {
      totalScore: totalScore,
      originalTermScore: originalTermScore,
      semanticScore: semanticScore,
      proximityScore: proximityScore,
      matchedTerms: matchedTerms,
      matchedOriginalTerms: matchedOriginalTerms,
      matchCount: matchedTerms.length
    };
  }

  function calculateProximityScore(content, matchedTerms) {
    // Find positions of all matched terms
    const positions = [];
    
    matchedTerms.forEach(term => {
      const termLower = String(term).toLowerCase();
      let index = content.indexOf(termLower);
      while (index !== -1) {
        positions.push(index);
        index = content.indexOf(termLower, index + 1);
      }
    });
    
    if (positions.length < 2) return 0;
    
    positions.sort((a, b) => a - b);
    
    // Find minimum distance between any two terms
    let minDistance = Infinity;
    for (let i = 0; i < positions.length - 1; i++) {
      const distance = positions[i + 1] - positions[i];
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    
    // Award proximity bonus based on distance
    if (minDistance <= SCORING_CONFIG.proximityDistance) {
      const proximityRatio = 1 - (minDistance / SCORING_CONFIG.proximityDistance);
      return SCORING_CONFIG.proximityWeight * proximityRatio;
    }
    
    return 0;
  }

  // =========================================================================
  // SPATIAL FILTERING
  // =========================================================================
  
  function filterBySpatialCategory(chunks, category) {
    const variance = calculateSpatialVariance(chunks);
    const pattern = detectSpatialPattern(variance, chunks.length);
    
    console.log(`  - Spatial pattern: ${pattern}, variance: ${variance.toFixed(1)}`);
    
    if (category === 'concentrated' && pattern === 'concentrated') {
      return chunks;
    } else if (category === 'spread' && pattern === 'spread') {
      return chunks;
    } else if (category === 'concentrated' || category === 'spread') {
      console.log(`  - Spatial filter removed chunks (expected ${category}, got ${pattern})`);
      return [];
    }
    
    return chunks;
  }

  function calculateSpatialVariance(chunks) {
    if (chunks.length === 0) return 0;
    if (chunks.length === 1) return 0;
    
    const positions = chunks.map(c => c.chunkNumber);
    const mean = positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
    const squaredDiffs = positions.map(pos => Math.pow(pos - mean, 2));
    const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / positions.length;
    
    return Math.sqrt(variance);
  }

  function detectSpatialPattern(variance, chunkCount) {
    if (chunkCount === 0) return 'none';
    if (chunkCount === 1) return 'single';
    
    if (variance < 10) return 'concentrated';
    if (variance > 50) return 'spread';
    
    return 'moderate';
  }

  // =========================================================================
  // TOPIC RESULT COMBINATION
  // =========================================================================
  
  function combineTopicResults(topicResults) {
    const allChunks = [];
    const seenIds = new Set();
    
    topicResults.forEach(topicResult => {
      topicResult.chunks.forEach(chunk => {
        if (!seenIds.has(chunk.id)) {
          allChunks.push(chunk);
          seenIds.add(chunk.id);
        }
      });
    });
    
    return allChunks;
  }

  // =========================================================================
  // SUPER CHUNK LIMITING
  // =========================================================================
  
  function limitSuperChunksPerTopic(allSuperChunks, numTopics, maxPerTopic) {
    if (numTopics === 1) {
      // Simple case: single topic, just take first N super chunks
      return allSuperChunks.slice(0, maxPerTopic);
    }
    
    // Multiple topics: need to track which super chunks belong to which topic
    // Super chunks are already ordered by topic, so we can count as we go
    
    const result = [];
    const topicCounts = new Map(); // topicId -> count
    
    for (const superChunk of allSuperChunks) {
      // Each super chunk has one or more topic sections
      // Check the first topic to determine which topic this super chunk primarily belongs to
      if (superChunk.topics.length === 0) continue;
      
      const primaryTopicId = superChunk.topics[0].topicId;
      const currentCount = topicCounts.get(primaryTopicId) || 0;
      
      if (currentCount < maxPerTopic) {
        result.push(superChunk);
        topicCounts.set(primaryTopicId, currentCount + 1);
      } else {
        console.log(`  Skipping super chunk for topic ${primaryTopicId} (already have ${maxPerTopic})`);
      }
    }
    
    return result;
  }

  // =========================================================================
  // SUPER CHUNK CREATION WITH TOPICS
  // =========================================================================
  
  function createSuperChunksWithTopics(topicResults, maxCharsPerSuperChunk, allTopics) {
    const superChunks = [];
    
    // Calculate header size (only in first super chunk)
    const headerText = formatChatPackageHeader(allTopics);
    const headerChars = headerText.length;
    
    console.log(`Creating super chunks with ${maxCharsPerSuperChunk} char limit`);
    console.log(`Header size: ${headerChars} chars`);
    
    // Current super chunk being built
    let currentChars = 0;
    let currentTopics = [];
    let isFirstSuperChunk = true;
    
    // Process each topic
    for (let topicIndex = 0; topicIndex < topicResults.length; topicIndex++) {
      const topicResult = topicResults[topicIndex];
      
      if (topicResult.chunks.length === 0) continue;
      
      console.log(`  Processing topic ${topicIndex + 1}: "${topicResult.topicQuestion}" (${topicResult.chunks.length} chunks)`);
      
      // Sort chunks chronologically
      const sortedChunks = sortChunksChronologically(topicResult.chunks);
      
      // Topic section for current super chunk
      let currentTopicSection = {
        topicId: topicResult.topicId,
        topicQuestion: topicResult.topicQuestion,
        chunks: [],
        isContinuation: false
      };
      
      const topicHeaderText = `\n[[topic ${topicIndex + 1}: ${topicResult.topicQuestion}]]\n\n`;
      const topicHeaderChars = topicHeaderText.length;
      
      // Add each chunk
      for (const chunk of sortedChunks) {
        // Calculate size of this chunk when formatted
        const chunkFormatted = `[[chunk ${chunk.chunkNumber}]] (score: ${chunk.relevanceScore?.toFixed(1) || '?'})\n${chunk.content}\n\n`;
        const chunkChars = chunkFormatted.length;
        
        // Calculate what total would be if we add this chunk
        let requiredSpace = chunkChars;
        
        // If this is first chunk in topic section, include topic header
        if (currentTopicSection.chunks.length === 0) {
          requiredSpace += topicHeaderChars;
        }
        
        // If this is first super chunk, include package header
        const headerSpace = isFirstSuperChunk ? headerChars : 0;
        
        const totalIfAdded = headerSpace + currentChars + requiredSpace;
        
        // Check if adding this chunk would exceed limit
        if (totalIfAdded > maxCharsPerSuperChunk && (currentTopics.length > 0 || currentTopicSection.chunks.length > 0)) {
          // Would exceed - need to close current super chunk
          
          // Save current topic section if it has chunks
          if (currentTopicSection.chunks.length > 0) {
            currentTopics.push(currentTopicSection);
          }
          
          // Save super chunk
          const superChunk = {
            topics: currentTopics,
            totalChars: currentChars + headerSpace,
            isFirst: isFirstSuperChunk
          };
          superChunks.push(superChunk);
          console.log(`    Closed super chunk ${superChunks.length}: ${superChunk.totalChars} chars, ${currentTopics.length} topic section(s)`);
          
          // Start new super chunk
          currentChars = 0;
          currentTopics = [];
          isFirstSuperChunk = false;
          
          // Start new topic section (continuation)
          currentTopicSection = {
            topicId: topicResult.topicId,
            topicQuestion: topicResult.topicQuestion,
            chunks: [],
            isContinuation: true
          };
          
          // Now add the chunk that didn't fit
          currentTopicSection.chunks.push(chunk);
          currentChars += topicHeaderChars + chunkChars;
          
        } else {
          // Fits in current super chunk
          currentTopicSection.chunks.push(chunk);
          
          // Update character count
          if (currentTopicSection.chunks.length === 1) {
            // First chunk in section - count header
            currentChars += topicHeaderChars;
          }
          currentChars += chunkChars;
        }
      }
      
      // Topic complete - add to current super chunk
      if (currentTopicSection.chunks.length > 0) {
        currentTopics.push(currentTopicSection);
      }
    }
    
    // Save final super chunk
    if (currentTopics.length > 0) {
      const headerSpace = isFirstSuperChunk ? headerChars : 0;
      const superChunk = {
        topics: currentTopics,
        totalChars: currentChars + headerSpace,
        isFirst: isFirstSuperChunk
      };
      superChunks.push(superChunk);
      console.log(`    Closed super chunk ${superChunks.length}: ${superChunk.totalChars} chars, ${currentTopics.length} topic section(s)`);
    }
    
    console.log(`  Created ${superChunks.length} super chunks total`);
    
    return superChunks;
  }

  // =========================================================================
  // CHRONOLOGICAL SORTING
  // =========================================================================
  
  function sortChunksChronologically(chunks) {
    return chunks.slice().sort((a, b) => {
      if (a.documentId !== b.documentId) {
        return a.documentId - b.documentId;
      }
      return a.chunkNumber - b.chunkNumber;
    });
  }

  // =========================================================================
  // FORMATTING FOR LLM
  // =========================================================================
  
  function formatChatPackageHeader(allTopics) {
    let header = '[[chat package]]\n';
    header += '[[Only respond with OK until all Super Chunks have been provided to you.]]\n\n';
    header += '[[paste all super chunks sequentially]]\n\n';
    header += '[[Answer questions ONLY from the provided content and tell user if other content is needed.]]\n\n';
    header += 'Questions:\n';
    allTopics.forEach((question, idx) => {
      header += `  Q${idx + 1}: ${question}\n`;
    });
    header += '\n';
    return header;
  }

  async function formatSuperChunks(superChunks, allTopics) {
    const formatted = [];
    
    for (let i = 0; i < superChunks.length; i++) {
      const superChunk = superChunks[i];
      const content = await formatSuperChunkContent(
        superChunk,
        i + 1,
        superChunks.length,
        i === 0 ? allTopics : null
      );
      
      const chunkCount = superChunk.topics.reduce((sum, t) => sum + t.chunks.length, 0);
      
      formatted.push({
        index: i,
        chunkCount: chunkCount,
        charCount: content.length,
        formattedContent: content
      });
    }
    
    return formatted;
  }

  async function formatSuperChunkContent(superChunk, superChunkNumber, totalSuperChunks, allTopics) {
    let output = '';
    
    // Header (only in first super chunk)
    if (superChunk.isFirst && allTopics) {
      output += formatChatPackageHeader(allTopics);
    }
    
    // Super chunk marker
    output += `[[super chunk ${superChunkNumber} of ${totalSuperChunks}]]\n`;
    if (superChunkNumber > 1) {
      output += '[[continued from previous super chunk]]\n';
    }
    output += '\n';
    
    // Format each topic section
    for (const topicSection of superChunk.topics) {
      const continuationMarker = topicSection.isContinuation ? ' (continued)' : '';
      output += `[[topic: ${topicSection.topicQuestion}${continuationMarker}]]\n\n`;
      
      // Get document name for first chunk
      const firstChunk = topicSection.chunks[0];
      const doc = await window.InvantiaDB.getDocument(firstChunk.documentId);
      output += `[[document: ${doc.name}]]\n\n`;
      
      // Add chunks
      for (const chunk of topicSection.chunks) {
        output += `[[chunk ${chunk.chunkNumber}]]`;
        
        // Add score for debugging
        if (chunk.relevanceScore) {
          output += ` (score: ${chunk.relevanceScore.toFixed(1)})`;
        }
        
        output += `\n${chunk.content}\n\n`;
      }
    }
    
    // Super chunk footer
    output += `[[/super chunk ${superChunkNumber}]]\n`;
    
    // Package footer (only in last super chunk)
    if (superChunkNumber === totalSuperChunks) {
      output += '\n[[/chat package]]';
    }
    
    return output;
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  
  window.InvantiaSearch = {
    executeQuery: executeQuery,
    SCORING_CONFIG: SCORING_CONFIG // Expose for tuning
  };

  console.log('Query Engine v2.3 (Hybrid Scoring + Topic Grouping) loaded');

})();
