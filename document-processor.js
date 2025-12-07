// ~/fastapi_app/static/desktop/document-processor.js
//
// Document processing for Invantia Desktop
// Parses PDFs (pdf.js), DOCX (mammoth.js), and TXT files
// Extracts plain text for chunking and indexing
// Phase 2: Builds semantic vectors for intelligent search
//
// External Dependencies:
// - pdf.js (Mozilla PDF parsing library)
// - mammoth.js (DOCX to HTML/text converter)

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPPORTED_FILE_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt'
};

// ============================================================================
// FILE VALIDATION
// ============================================================================

/**
 * Check if a file type is supported
 * 
 * @param {File} file - File object from input
 * @returns {boolean} True if supported
 */
function isFileTypeSupported(file) {
    return Object.keys(SUPPORTED_FILE_TYPES).includes(file.type) || 
           file.name.endsWith('.txt') ||
           file.name.endsWith('.pdf') ||
           file.name.endsWith('.docx');
}

/**
 * Get file type identifier
 * 
 * @param {File} file - File object
 * @returns {string} File type (pdf, docx, txt)
 */
function getFileType(file) {
    if (file.name.endsWith('.pdf')) return 'pdf';
    if (file.name.endsWith('.docx')) return 'docx';
    if (file.name.endsWith('.txt')) return 'txt';
    return SUPPORTED_FILE_TYPES[file.type] || 'unknown';
}

// ============================================================================
// PDF PROCESSING (using pdf.js)
// ============================================================================

/**
 * Extract text from PDF file
 * Uses pdf.js library (must be loaded in HTML)
 * 
 * @param {File} file - PDF file
 * @param {Function} progressCallback - Optional progress callback (percent)
 * @returns {Promise<string>} Extracted text
 */
async function processPDF(file, progressCallback = null) {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if pdf.js is loaded
            if (typeof pdfjsLib === 'undefined') {
                reject(new Error('pdf.js library not loaded'));
                return;
            }
            
            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            const totalPages = pdf.numPages;
            let fullText = '';
            
            // Extract text from each page
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Concatenate text items with spaces
                const pageText = textContent.items
                    .map(item => item.str)
                    .join(' ');
                
                fullText += pageText + '\n\n';
                
                // Report progress
                if (progressCallback) {
                    const percent = Math.round((pageNum / totalPages) * 100);
                    progressCallback(percent);
                }
            }
            
            resolve(fullText.trim());
            
        } catch (error) {
            console.error('Error processing PDF:', error);
            reject(error);
        }
    });
}

// ============================================================================
// DOCX PROCESSING (using mammoth.js)
// ============================================================================

/**
 * Extract text from DOCX file
 * Uses mammoth.js library (must be loaded in HTML)
 * 
 * @param {File} file - DOCX file
 * @returns {Promise<string>} Extracted text
 */
async function processDOCX(file) {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if mammoth.js is loaded
            if (typeof mammoth === 'undefined') {
                reject(new Error('mammoth.js library not loaded'));
                return;
            }
            
            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Extract text using mammoth
            const result = await mammoth.extractRawText({ arrayBuffer });
            
            resolve(result.value);
            
        } catch (error) {
            console.error('Error processing DOCX:', error);
            reject(error);
        }
    });
}

// ============================================================================
// TXT PROCESSING
// ============================================================================

/**
 * Read text from TXT file
 * Simple file reader for plain text
 * 
 * @param {File} file - TXT file
 * @returns {Promise<string>} File content
 */
async function processTXT(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            resolve(e.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read text file'));
        };
        
        reader.readAsText(file);
    });
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process a document file and extract text
 * Automatically detects file type and uses appropriate processor
 * 
 * @param {File} file - File to process
 * @param {Function} progressCallback - Optional progress callback
 * @param {Function} statusCallback - Optional status message callback
 * @returns {Promise<Object>} Result object with text and metadata
 */
async function processDocument(file, progressCallback = null, statusCallback = null) {
    return new Promise(async (resolve, reject) => {
        try {
            // Validate file type
            if (!isFileTypeSupported(file)) {
                reject(new Error(`Unsupported file type: ${file.type}`));
                return;
            }
            
            const fileType = getFileType(file);
            let text = '';
            
            // Process based on file type
            statusCallback?.(`Processing ${fileType.toUpperCase()}...`);
            
            if (fileType === 'pdf') {
                text = await processPDF(file, progressCallback);
            } else if (fileType === 'docx') {
                text = await processDOCX(file);
            } else if (fileType === 'txt') {
                text = await processTXT(file);
            } else {
                reject(new Error(`Unknown file type: ${fileType}`));
                return;
            }
            
            // Clean up text
            statusCallback?.('Cleaning text...');
            text = cleanText(text);
            
            // Return result with metadata
            resolve({
                text: text,
                metadata: {
                    fileName: file.name,
                    fileType: fileType,
                    fileSize: file.size,
                    processedDate: new Date().toISOString(),
                    characterCount: text.length,
                    wordCount: countWords(text)
                }
            });
            
        } catch (error) {
            console.error('Error processing document:', error);
            reject(error);
        }
    });
}

/**
 * Process document and save to IndexedDB with vectors (Phase 2)
 * Complete workflow: extract text → chunk → save → build vectors
 * 
 * @param {File} file - File to process
 * @param {Function} progressCallback - Progress callback
 * @param {Function} statusCallback - Status message callback
 * @returns {Promise<number>} Document ID
 */
async function processAndSaveDocument(file, progressCallback = null, statusCallback = null) {
    try {
        // Step 1: Extract text
        statusCallback?.(`Processing ${file.name}...`);
        progressCallback?.(10);
        
        const result = await processDocument(file, (percent) => {
            // Scale progress: 10-50% for text extraction
            progressCallback?.(10 + Math.round(percent * 0.4));
        }, statusCallback);
        
        // Step 2: Create chunks
        statusCallback?.('Creating chunks...');
        progressCallback?.(60);
        
        const chunks = window.InvantiaChunker.createChunks(result.text);
        console.log(`Created ${chunks.length} chunks from ${file.name}`);
        
        // Step 3: Save document
        statusCallback?.('Saving document...');
        progressCallback?.(70);
        
        const docId = await window.InvantiaDB.addDocument({
            name: file.name,
            content: result.text,
            fileType: result.metadata.fileType,
            size: result.metadata.fileSize
        });
        
        console.log(`Document saved with ID: ${docId}`);
        
        // Step 4: Save chunks
        statusCallback?.('Saving chunks...');
        progressCallback?.(80);
        
        for (const chunk of chunks) {
            await window.InvantiaDB.addChunk({
                documentId: docId,
                chunkNumber: chunk.chunkNumber,
                content: chunk.content,
                charCount: chunk.charCount
            });
        }
        
        console.log(`Saved ${chunks.length} chunks for document ${docId}`);
        
        // Step 5: Build vectors (Phase 2 - Semantic Search)
        try {
            if (window.InvantiaVectorizer) {
                statusCallback?.('Building semantic index...');
                progressCallback?.(90);
                
                console.log(`Building vectors for document ${docId}...`);
                const vectorData = window.InvantiaVectorizer.buildCoOccurrenceMatrix(result.text);
                
                await window.InvantiaDB.addVectors(docId, vectorData);
                console.log(`✓ Built vectors for document ${docId}`);
                
                progressCallback?.(95);
            } else {
                console.warn('Vectorizer not available - skipping vector building');
            }
        } catch (vectorError) {
            console.error('Error building vectors:', vectorError);
            // Don't fail the entire upload if vectorization fails
            console.warn('Continuing without vectors...');
        }
        
        // Complete
        statusCallback?.('Complete!');
        progressCallback?.(100);
        
        console.log(`✓ Processed: ${file.name} (${chunks.length} chunks)`);
        
        return docId;
        
    } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        throw error;
    }
}

// ============================================================================
// TEXT CLEANING AND UTILITIES
// ============================================================================

/**
 * Clean extracted text
 * Removes excessive whitespace, normalizes line breaks
 * 
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    // Remove null characters
    text = text.replace(/\0/g, '');
    
    // Normalize line breaks (convert all to \n)
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove excessive blank lines (more than 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Trim each line
    text = text.split('\n').map(line => line.trim()).join('\n');
    
    // Remove leading/trailing whitespace
    text = text.trim();
    
    return text;
}

/**
 * Count words in text
 * 
 * @param {string} text - Text to count
 * @returns {number} Word count
 */
function countWords(text) {
    // Split on whitespace and filter out empty strings
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return words.length;
}

/**
 * Estimate reading time in minutes
 * Assumes average reading speed of 200 words per minute
 * 
 * @param {string} text - Text to analyze
 * @returns {number} Estimated reading time in minutes
 */
function estimateReadingTime(text) {
    const wordCount = countWords(text);
    const readingSpeed = 200; // words per minute
    return Math.ceil(wordCount / readingSpeed);
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process multiple documents
 * 
 * @param {FileList|Array} files - Files to process
 * @param {Function} progressCallback - Callback for overall progress
 * @returns {Promise<Array>} Array of processed document results
 */
async function processDocuments(files, progressCallback = null) {
    const results = [];
    const totalFiles = files.length;
    
    for (let i = 0; i < totalFiles; i++) {
        try {
            const result = await processDocument(files[i]);
            results.push({
                success: true,
                file: files[i].name,
                result: result
            });
        } catch (error) {
            results.push({
                success: false,
                file: files[i].name,
                error: error.message
            });
        }
        
        // Report overall progress
        if (progressCallback) {
            const percent = Math.round(((i + 1) / totalFiles) * 100);
            progressCallback(percent, i + 1, totalFiles);
        }
    }
    
    return results;
}

// ============================================================================
// EXPORT API
// ============================================================================

window.InvantiaDocProcessor = {
    // Main processing functions
    processDocument,
    processDocuments,
    processAndSaveDocument,  // New in Phase 2
    
    // Individual processors
    processPDF,
    processDOCX,
    processTXT,
    
    // Validation
    isFileTypeSupported,
    getFileType,
    
    // Utilities
    cleanText,
    countWords,
    estimateReadingTime,
    
    // Constants
    SUPPORTED_FILE_TYPES
};
