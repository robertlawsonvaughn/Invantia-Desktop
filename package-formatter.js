// ~/fastapi_app/static/desktop/package-formatter.js
//
// Chat Package Formatter for Invantia Desktop
// Generates formatted "chat packages" for pasting into external LLMs
// Handles multi-part splitting when content exceeds character limits
//
// Package Format:
// [[chat package]]
// Instructions: Use the following chunks to answer the question...
// [[document: Doc Name]]
// [[chunk 5]]...[[/chunk]]
// [[/document]]
// [[my question]]...[[/my question]]
// [[/chat package]]

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_PACKAGE_SIZE = 95000;  // Character limit per package part
const PART_HEADER_SIZE = 500;    // Reserved for headers/footers

// ============================================================================
// PACKAGE GENERATION
// ============================================================================

/**
 * Generate a chat package from search results
 * 
 * @param {Array<Object>} chunks - Chunks to include
 * @param {string} userQuestion - User's question
 * @returns {Object} Chat package (single or multi-part)
 */
function generateChatPackage(chunks, userQuestion = '') {
    // Group chunks by document
    const chunksByDocument = groupChunksByDocument(chunks);
    
    // Build package content
    let packageContent = buildPackageHeader();
    
    // Add document sections
    for (const [docId, docChunks] of Object.entries(chunksByDocument)) {
        packageContent += buildDocumentSection(docId, docChunks);
    }
    
    // Add user question
    packageContent += buildQuestionSection(userQuestion);
    
    // Add package footer
    packageContent += buildPackageFooter();
    
    // Check if splitting is needed
    if (packageContent.length > MAX_PACKAGE_SIZE) {
        return splitPackage(chunksByDocument, userQuestion);
    }
    
    return {
        isSplit: false,
        totalParts: 1,
        parts: [packageContent],
        characterCount: packageContent.length
    };
}

/**
 * Build package header with instructions
 * 
 * @returns {string} Header text
 */
function buildPackageHeader() {
    return `[[chat package]]

Instructions: The following chunks contain relevant content from your documents.
Use this information to answer the question at the end.

`;
}

/**
 * Build package footer
 * 
 * @returns {string} Footer text
 */
function buildPackageFooter() {
    return `\n[[/chat package]]`;
}

/**
 * Build document section with chunks
 * 
 * @param {number} docId - Document ID
 * @param {Array<Object>} chunks - Chunks from this document
 * @returns {string} Formatted document section
 */
function buildDocumentSection(docId, chunks) {
    if (chunks.length === 0) {
        return '';
    }
    
    const docName = chunks[0].documentName || `Document ${docId}`;
    let section = `[[document: ${docName}]]\n`;
    
    // Sort chunks by chunk number
    const sortedChunks = chunks.sort((a, b) => a.chunkNumber - b.chunkNumber);
    
    // Add each chunk
    sortedChunks.forEach(chunk => {
        section += `\n[[chunk ${chunk.chunkNumber}]]\n`;
        section += chunk.content;
        section += `\n[[/chunk]]\n`;
    });
    
    section += `\n[[/document]]\n\n`;
    
    return section;
}

/**
 * Build question section
 * 
 * @param {string} question - User's question
 * @returns {string} Formatted question section
 */
function buildQuestionSection(question) {
    if (!question || question.trim().length === 0) {
        question = 'Please analyze the above content and provide insights.';
    }
    
    return `[[my question]]\n${question.trim()}\n[[/my question]]\n`;
}

// ============================================================================
// MULTI-PART SPLITTING
// ============================================================================

/**
 * Split package into multiple parts
 * 
 * @param {Object} chunksByDocument - Chunks grouped by document
 * @param {string} userQuestion - User's question
 * @returns {Object} Multi-part package
 */
function splitPackage(chunksByDocument, userQuestion) {
    const parts = [];
    let currentPart = '';
    let currentSize = 0;
    const docIds = Object.keys(chunksByDocument);
    
    // Reserve space for headers and footers
    const maxPartContent = MAX_PACKAGE_SIZE - PART_HEADER_SIZE;
    
    for (const docId of docIds) {
        const docChunks = chunksByDocument[docId];
        const docSection = buildDocumentSection(docId, docChunks);
        
        // Check if adding this document would exceed limit
        if (currentSize + docSection.length > maxPartContent && currentPart.length > 0) {
            // Save current part and start new one
            parts.push(currentPart);
            currentPart = '';
            currentSize = 0;
        }
        
        // Check if single document is too large (needs further splitting)
        if (docSection.length > maxPartContent) {
            // Split document chunks into smaller groups
            const splitDocParts = splitDocumentChunks(docId, docChunks, maxPartContent);
            splitDocParts.forEach(part => {
                if (currentPart.length > 0) {
                    parts.push(currentPart);
                    currentPart = '';
                    currentSize = 0;
                }
                parts.push(part);
            });
        } else {
            currentPart += docSection;
            currentSize += docSection.length;
        }
    }
    
    // Save final part
    if (currentPart.length > 0) {
        parts.push(currentPart);
    }
    
    // Add headers, footers, and question to each part
    const formattedParts = parts.map((part, index) => {
        const partNumber = index + 1;
        const totalParts = parts.length;
        
        let formatted = `[[chat package - Part ${partNumber} of ${totalParts}]]\n\n`;
        
        if (partNumber === 1) {
            formatted += `Instructions: This is a multi-part chat package. `;
            formatted += `Please paste all ${totalParts} parts sequentially before responding.\n\n`;
        } else {
            formatted += `Continued from Part ${partNumber - 1}...\n\n`;
        }
        
        formatted += part;
        
        // Add question only to last part
        if (partNumber === totalParts) {
            formatted += buildQuestionSection(userQuestion);
        }
        
        formatted += `\n[[/chat package - Part ${partNumber} of ${totalParts}]]`;
        
        return formatted;
    });
    
    return {
        isSplit: true,
        totalParts: formattedParts.length,
        parts: formattedParts,
        characterCount: formattedParts.reduce((sum, part) => sum + part.length, 0)
    };
}

/**
 * Split a single document's chunks into multiple parts
 * 
 * @param {number} docId - Document ID
 * @param {Array<Object>} chunks - Document chunks
 * @param {number} maxSize - Maximum size per part
 * @returns {Array<string>} Array of part strings
 */
function splitDocumentChunks(docId, chunks, maxSize) {
    const parts = [];
    let currentChunks = [];
    let currentSize = 0;
    
    chunks.forEach(chunk => {
        const chunkFormatted = `\n[[chunk ${chunk.chunkNumber}]]\n${chunk.content}\n[[/chunk]]\n`;
        
        if (currentSize + chunkFormatted.length > maxSize && currentChunks.length > 0) {
            // Save current part
            parts.push(buildDocumentSection(docId, currentChunks));
            currentChunks = [];
            currentSize = 0;
        }
        
        currentChunks.push(chunk);
        currentSize += chunkFormatted.length;
    });
    
    // Save final part
    if (currentChunks.length > 0) {
        parts.push(buildDocumentSection(docId, currentChunks));
    }
    
    return parts;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Group chunks by document ID
 * 
 * @param {Array<Object>} chunks - All chunks
 * @returns {Object} Chunks grouped by documentId
 */
function groupChunksByDocument(chunks) {
    const grouped = {};
    
    chunks.forEach(chunk => {
        if (!grouped[chunk.documentId]) {
            grouped[chunk.documentId] = [];
        }
        grouped[chunk.documentId].push(chunk);
    });
    
    return grouped;
}

// ============================================================================
// CLIPBOARD OPERATIONS
// ============================================================================

let currentPackage = null;

/**
 * Copy chat package to clipboard
 * Handles single or multi-part packages
 * 
 * @param {Object} packageData - Package data from generateChatPackage
 * @param {number} partIndex - Part index (0-based) for multi-part
 */
function copyChatPackage(packageData = null, partIndex = 0) {
    // Use stored package if none provided
    if (!packageData) {
        packageData = currentPackage;
    }
    
    if (!packageData) {
        alert('No chat package available to copy');
        return;
    }
    
    // Store for later use
    currentPackage = packageData;
    
    // Get the part to copy
    const textToCopy = packageData.parts[partIndex];
    
    // Copy to clipboard
    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            if (packageData.isSplit) {
                alert(`Part ${partIndex + 1} of ${packageData.totalParts} copied to clipboard!`);
            } else {
                alert('Chat package copied to clipboard!');
            }
        })
        .catch(error => {
            console.error('Failed to copy to clipboard:', error);
            // Fallback: show in modal for manual copy
            showCopyModal(textToCopy);
        });
}

/**
 * Show modal with text for manual copying
 * Fallback when clipboard API fails
 * 
 * @param {string} text - Text to display
 */
function showCopyModal(text) {
    const modal = document.createElement('div');
    modal.className = 'copy-modal';
    modal.innerHTML = `
        <div class="copy-modal-content">
            <h3>Copy Chat Package</h3>
            <p>Please manually select and copy the text below:</p>
            <textarea readonly style="width: 100%; height: 400px; font-family: monospace;">${text}</textarea>
            <button onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// ============================================================================
// PACKAGE DISPLAY
// ============================================================================

/**
 * Display chat package in UI with copy buttons
 *
 * For both single and multi-part packages, each part is shown
 * as a "Super Chunk" accordion card, collapsed by default.
 *
 * @param {Object} packageData - Package data
 * @param {string} containerId - Container element ID
 */
function displayChatPackage(packageData, containerId) {
    // Prefer explicit containerId, then desktop_home id, then old default
    const targetId = containerId || "chatPackageDisplay";
    let container = document.getElementById(targetId);

    if (!container) {
        container = document.getElementById("chat-package-display");
    }
    if (!container) {
        console.error(`Container not found: ${targetId} or chat-package-display`);
        return;
    }

    currentPackage = packageData; // store for copyPart()

    const totalParts = packageData.parts.length;
    const totalChars = packageData.characterCount ?? packageData.parts.reduce((s, p) => s + p.length, 0);

    let html = `<div class="chat-package-container">
        <h3>Chat Package Ready</h3>
        <p class="muted">
          ${totalChars.toLocaleString()} total characters in ${totalParts} super chunk${totalParts > 1 ? "s" : ""}.
          Paste each super chunk sequentially into your AI chat.
        </p>
    `;

    // Render each part as a collapsible Super Chunk card
    packageData.parts.forEach((partText, index) => {
        const partLen = partText.length;
        const superChunkIndex = index + 1;

        html += `
        <div class="superchunk-card">
          <div class="superchunk-header" onclick="toggleSuperChunk(this)">
            <div class="superchunk-title">
              Super Chunk ${superChunkIndex} of ${totalParts}
            </div>
            <div class="superchunk-meta">
              ${partLen.toLocaleString()} characters
            </div>
            <div class="superchunk-toggle">+</div>
          </div>
          <div class="superchunk-body">
            <pre>${escapeHtml(partText)}</pre>
            <button class="btn btn-primary btn-sm"
                    onclick="InvantiaPackageFormatter.copyPart(${index}); event.stopPropagation();">
              📋 Copy Super Chunk ${superChunkIndex}
            </button>
          </div>
        </div>`;
    });

    html += `</div>`;

    container.innerHTML = html;
}


/**
 * Escape HTML for safe display
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// EXPORT API
// ============================================================================

window.InvantiaPackageFormatter = {
    // Main generation
    generateChatPackage,
    
    // Clipboard operations
    copyChatPackage,
    copyPart: (index) => copyChatPackage(currentPackage, index),
    
    // Display
    displayChatPackage,
    
    // Building blocks (for testing/customization)
    buildPackageHeader,
    buildDocumentSection,
    buildQuestionSection,
    buildPackageFooter,
    
    // Constants
    MAX_PACKAGE_SIZE
};
