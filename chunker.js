// ~/fastapi_app/static/desktop/chunker.js
//
// Text chunking for Invantia Desktop
// Splits document text into ~2000-character chunks on sentence boundaries
// Maintains context by preserving complete sentences
//
// Chunking Strategy:
// - Target size: ~2000 characters per chunk
// - Break on sentence boundaries (periods, question marks, exclamation points)
// - Preserve paragraph structure where possible
// - Generate optional overlap for context continuity

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CHUNK_SIZE = 2000; // Target characters per chunk
const MIN_CHUNK_SIZE = 500;      // Minimum chunk size (to avoid tiny chunks)
const MAX_CHUNK_SIZE = 3000;     // Maximum chunk size (hard limit)
const OVERLAP_SIZE = 200;        // Characters to overlap between chunks (optional)

// Sentence ending patterns
const SENTENCE_ENDINGS = /[.!?]+[\s\n]/g;

// ============================================================================
// SENTENCE DETECTION
// ============================================================================

/**
 * Split text into sentences
 * Handles common abbreviations and edge cases
 * 
 * @param {string} text - Text to split
 * @returns {Array<string>} Array of sentences
 */
function splitIntoSentences(text) {
    // Common abbreviations that shouldn't trigger sentence breaks
    const abbreviations = [
        'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.',
        'Inc.', 'Ltd.', 'Corp.', 'Co.',
        'etc.', 'vs.', 'e.g.', 'i.e.',
        'U.S.', 'U.K.'
    ];
    
    // Temporarily replace abbreviations with placeholders
    let processedText = text;
    const placeholders = [];
    
    abbreviations.forEach((abbr, index) => {
        const placeholder = `__ABBR${index}__`;
        placeholders.push({ placeholder, abbr });
        processedText = processedText.replace(new RegExp(abbr.replace('.', '\\.'), 'g'), placeholder);
    });
    
    // Split on sentence endings
    const sentences = [];
    let currentSentence = '';
    
    for (let i = 0; i < processedText.length; i++) {
        const char = processedText[i];
        currentSentence += char;
        
        // Check if this is a sentence ending
        if (/[.!?]/.test(char)) {
            // Look ahead to see if next char is whitespace or newline
            if (i + 1 < processedText.length && /[\s\n]/.test(processedText[i + 1])) {
                // Complete sentence found
                currentSentence = currentSentence.trim();
                if (currentSentence.length > 0) {
                    sentences.push(currentSentence);
                }
                currentSentence = '';
            }
        }
    }
    
    // Add any remaining text as final sentence
    if (currentSentence.trim().length > 0) {
        sentences.push(currentSentence.trim());
    }
    
    // Restore abbreviations in sentences
    const restoredSentences = sentences.map(sentence => {
        let restored = sentence;
        placeholders.forEach(({ placeholder, abbr }) => {
            restored = restored.replace(new RegExp(placeholder, 'g'), abbr);
        });
        return restored;
    });
    
    return restoredSentences;
}

// ============================================================================
// CHUNKING FUNCTIONS
// ============================================================================

/**
 * Create chunks from text without overlap
 * Chunks are created on sentence boundaries
 * 
 * @param {string} text - Document text
 * @param {number} targetSize - Target chunk size in characters
 * @returns {Array<Object>} Array of chunk objects
 */
function createChunks(text, targetSize = DEFAULT_CHUNK_SIZE) {
    const sentences = splitIntoSentences(text);
    const chunks = [];
    
    let currentChunk = '';
    let chunkNumber = 0;
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        
        // Check if adding this sentence would exceed target size
        if (currentChunk.length > 0 && 
            currentChunk.length + sentence.length + 1 > targetSize &&
            currentChunk.length >= MIN_CHUNK_SIZE) {
            
            // Save current chunk
            chunks.push({
                chunkNumber: chunkNumber++,
                content: currentChunk.trim(),
                charCount: currentChunk.trim().length,
                sentenceCount: countSentences(currentChunk)
            });
            
            currentChunk = '';
        }
        
        // Add sentence to current chunk
        if (currentChunk.length > 0) {
            currentChunk += ' ';
        }
        currentChunk += sentence;
        
        // Check if chunk has reached maximum size (force split)
        if (currentChunk.length >= MAX_CHUNK_SIZE) {
            chunks.push({
                chunkNumber: chunkNumber++,
                content: currentChunk.trim(),
                charCount: currentChunk.trim().length,
                sentenceCount: countSentences(currentChunk)
            });
            
            currentChunk = '';
        }
    }
    
    // Add final chunk if there's remaining text
    if (currentChunk.trim().length > 0) {
        chunks.push({
            chunkNumber: chunkNumber++,
            content: currentChunk.trim(),
            charCount: currentChunk.trim().length,
            sentenceCount: countSentences(currentChunk)
        });
    }
    
    return chunks;
}

/**
 * Create chunks with overlap for context continuity
 * Used when building chat packages to maintain context
 * 
 * @param {string} text - Document text
 * @param {number} targetSize - Target chunk size
 * @param {number} overlapSize - Overlap size in characters
 * @returns {Array<Object>} Array of chunk objects with overlap
 */
function createChunksWithOverlap(text, targetSize = DEFAULT_CHUNK_SIZE, overlapSize = OVERLAP_SIZE) {
    const sentences = splitIntoSentences(text);
    const chunks = [];
    
    let chunkNumber = 0;
    let startSentenceIndex = 0;
    
    while (startSentenceIndex < sentences.length) {
        let currentChunk = '';
        let sentenceCount = 0;
        let endSentenceIndex = startSentenceIndex;
        
        // Build chunk up to target size
        for (let i = startSentenceIndex; i < sentences.length; i++) {
            const sentence = sentences[i];
            
            if (currentChunk.length > 0 && 
                currentChunk.length + sentence.length + 1 > targetSize) {
                break;
            }
            
            if (currentChunk.length > 0) {
                currentChunk += ' ';
            }
            currentChunk += sentence;
            sentenceCount++;
            endSentenceIndex = i;
        }
        
        // Save chunk
        chunks.push({
            chunkNumber: chunkNumber++,
            content: currentChunk.trim(),
            charCount: currentChunk.trim().length,
            sentenceCount: sentenceCount,
            startSentence: startSentenceIndex,
            endSentence: endSentenceIndex
        });
        
        // Calculate overlap: move start index back by sentences that fit in overlap size
        let overlapText = '';
        let overlapSentenceCount = 0;
        
        for (let i = endSentenceIndex; i >= startSentenceIndex; i--) {
            if (overlapText.length + sentences[i].length > overlapSize) {
                break;
            }
            overlapText = sentences[i] + ' ' + overlapText;
            overlapSentenceCount++;
        }
        
        // Move to next chunk start (with overlap)
        startSentenceIndex = endSentenceIndex + 1 - Math.max(1, overlapSentenceCount);
        
        // Prevent infinite loop
        if (startSentenceIndex <= endSentenceIndex - sentenceCount) {
            startSentenceIndex = endSentenceIndex + 1;
        }
    }
    
    return chunks;
}

/**
 * Get context chunks around a specific chunk
 * Returns N chunks before and after a given chunk number
 * 
 * @param {Array<Object>} allChunks - All chunks from document
 * @param {number} chunkNumber - Target chunk number
 * @param {number} beforeCount - Number of chunks before
 * @param {number} afterCount - Number of chunks after
 * @returns {Array<Object>} Array of chunks with context
 */
function getContextChunks(allChunks, chunkNumber, beforeCount = 2, afterCount = 2) {
    const contextChunks = [];
    
    const startIndex = Math.max(0, chunkNumber - beforeCount);
    const endIndex = Math.min(allChunks.length - 1, chunkNumber + afterCount);
    
    for (let i = startIndex; i <= endIndex; i++) {
        contextChunks.push({
            ...allChunks[i],
            isTarget: i === chunkNumber,
            isContext: i !== chunkNumber
        });
    }
    
    return contextChunks;
}

// ============================================================================
// CHUNK ANALYSIS
// ============================================================================

/**
 * Count sentences in text
 * 
 * @param {string} text - Text to analyze
 * @returns {number} Sentence count
 */
function countSentences(text) {
    const sentences = splitIntoSentences(text);
    return sentences.length;
}

/**
 * Get chunk statistics
 * 
 * @param {Array<Object>} chunks - Array of chunks
 * @returns {Object} Statistics object
 */
function getChunkStats(chunks) {
    if (chunks.length === 0) {
        return {
            totalChunks: 0,
            avgChunkSize: 0,
            minChunkSize: 0,
            maxChunkSize: 0,
            totalCharacters: 0
        };
    }
    
    const sizes = chunks.map(c => c.charCount);
    const totalChars = sizes.reduce((sum, size) => sum + size, 0);
    
    return {
        totalChunks: chunks.length,
        avgChunkSize: Math.round(totalChars / chunks.length),
        minChunkSize: Math.min(...sizes),
        maxChunkSize: Math.max(...sizes),
        totalCharacters: totalChars
    };
}

/**
 * Validate chunks
 * Checks for issues like empty chunks, excessive size variance
 * 
 * @param {Array<Object>} chunks - Array of chunks to validate
 * @returns {Object} Validation result with warnings
 */
function validateChunks(chunks) {
    const warnings = [];
    
    // Check for empty chunks
    const emptyChunks = chunks.filter(c => c.content.trim().length === 0);
    if (emptyChunks.length > 0) {
        warnings.push(`Found ${emptyChunks.length} empty chunks`);
    }
    
    // Check for oversized chunks
    const oversizedChunks = chunks.filter(c => c.charCount > MAX_CHUNK_SIZE);
    if (oversizedChunks.length > 0) {
        warnings.push(`Found ${oversizedChunks.length} oversized chunks (>${MAX_CHUNK_SIZE} chars)`);
    }
    
    // Check for undersized chunks (except last chunk)
    const undersizedChunks = chunks
        .filter((c, i) => i < chunks.length - 1 && c.charCount < MIN_CHUNK_SIZE);
    if (undersizedChunks.length > 0) {
        warnings.push(`Found ${undersizedChunks.length} undersized chunks (<${MIN_CHUNK_SIZE} chars)`);
    }
    
    return {
        valid: warnings.length === 0,
        warnings: warnings
    };
}

// ============================================================================
// CHUNK MERGING AND DEDUPLICATION
// ============================================================================

/**
 * Merge overlapping chunks into deduplicated list
 * Used when combining search results from multiple queries
 * 
 * @param {Array<Object>} chunks - Array of chunks (may have duplicates)
 * @returns {Array<Object>} Deduplicated and sorted chunks
 */
function deduplicateChunks(chunks) {
    const seen = new Set();
    const unique = [];
    
    chunks.forEach(chunk => {
        const key = `${chunk.documentId}-${chunk.chunkNumber}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(chunk);
        }
    });
    
    // Sort by document ID and chunk number
    unique.sort((a, b) => {
        if (a.documentId !== b.documentId) {
            return a.documentId - b.documentId;
        }
        return a.chunkNumber - b.chunkNumber;
    });
    
    return unique;
}

/**
 * Expand chunks to include surrounding context
 * Adds N chunks before and after each chunk in the list
 * 
 * @param {Array<Object>} chunks - Selected chunks
 * @param {Object} allChunksByDoc - Map of documentId -> all chunks
 * @param {number} beforeCount - Chunks to add before
 * @param {number} afterCount - Chunks to add after
 * @returns {Array<Object>} Expanded chunk list
 */
function expandChunksWithContext(chunks, allChunksByDoc, beforeCount = 2, afterCount = 2) {
    const expanded = [];
    
    chunks.forEach(chunk => {
        const docChunks = allChunksByDoc[chunk.documentId] || [];
        const contextChunks = getContextChunks(docChunks, chunk.chunkNumber, beforeCount, afterCount);
        expanded.push(...contextChunks);
    });
    
    // Deduplicate and sort
    return deduplicateChunks(expanded);
}

// ============================================================================
// EXPORT API
// ============================================================================

window.InvantiaChunker = {
    // Main chunking functions
    createChunks,
    createChunksWithOverlap,
    getContextChunks,
    
    // Sentence processing
    splitIntoSentences,
    
    // Analysis and validation
    countSentences,
    getChunkStats,
    validateChunks,
    
    // Chunk management
    deduplicateChunks,
    expandChunksWithContext,
    
    // Constants
    DEFAULT_CHUNK_SIZE,
    MIN_CHUNK_SIZE,
    MAX_CHUNK_SIZE,
    OVERLAP_SIZE
};
