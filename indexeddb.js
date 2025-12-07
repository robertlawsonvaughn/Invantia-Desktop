// ~/fastapi_app/static/desktop/indexeddb.js
//
// IndexedDB management for Invantia Desktop
// Handles local browser database for documents, chunks, collections, and vectors
//
// Database Schema:
// - documents: {id, name, description, userDefinedId, content, uploadDate, fileType, size}
// - chunks: {id, documentId, collectionId, chunkNumber, content, charCount}
// - collections: {id, name, description, createdDate}
// - vectors: {documentId, matrix, termFrequencies, totalTerms, created} [Phase 2]

const DB_NAME = 'InvantiaDesktopDB';
const DB_VERSION = 2;  // Incremented for vector storage

let db = null;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

/**
 * Initialize IndexedDB database
 * Creates object stores for documents, chunks, collections, and vectors
 * 
 * @returns {Promise<IDBDatabase>} Database instance
 */
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB initialized successfully');
            resolve(db);
        };
        
        // Create object stores on first run or version upgrade
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Documents store
            if (!db.objectStoreNames.contains('documents')) {
                const docStore = db.createObjectStore('documents', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                docStore.createIndex('name', 'name', { unique: false });
                docStore.createIndex('uploadDate', 'uploadDate', { unique: false });
                docStore.createIndex('userDefinedId', 'userDefinedId', { unique: false });
            }
            
            // Chunks store
            if (!db.objectStoreNames.contains('chunks')) {
                const chunkStore = db.createObjectStore('chunks', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                chunkStore.createIndex('documentId', 'documentId', { unique: false });
                chunkStore.createIndex('collectionId', 'collectionId', { unique: false });
                chunkStore.createIndex('chunkNumber', 'chunkNumber', { unique: false });
            }
            
            // Collections store
            if (!db.objectStoreNames.contains('collections')) {
                const collStore = db.createObjectStore('collections', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                collStore.createIndex('name', 'name', { unique: true });
                collStore.createIndex('createdDate', 'createdDate', { unique: false });
            }
            
            // Vectors store (Phase 2 - Semantic Search)
            if (!db.objectStoreNames.contains('vectors')) {
                db.createObjectStore('vectors', { 
                    keyPath: 'documentId'
                });
            }
            
            console.log('IndexedDB object stores created');
        };
    });
}

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

/**
 * Add a document to IndexedDB
 * 
 * @param {Object} document - Document object
 * @param {string} document.name - Document name
 * @param {string} document.description - Optional description
 * @param {string} document.userDefinedId - Optional user-defined ID
 * @param {string} document.content - Full text content (for reference)
 * @param {string} document.fileType - File type (pdf, docx, txt)
 * @param {number} document.size - File size in bytes
 * @returns {Promise<number>} Document ID
 */
async function addDocument(document) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        
        const docData = {
            name: document.name || 'Untitled',
            description: document.description || '',
            userDefinedId: document.userDefinedId || '',
            content: document.content || '',
            uploadDate: new Date().toISOString(),
            fileType: document.fileType || 'unknown',
            size: document.size || 0
        };
        
        const request = store.add(docData);
        
        request.onsuccess = () => {
            console.log('Document added:', request.result);
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('Error adding document:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get a document by ID
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<Object>} Document object
 */
async function getDocument(documentId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.get(documentId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all documents
 * 
 * @returns {Promise<Array>} Array of all documents
 */
async function getAllDocuments() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update a document
 * 
 * @param {number} documentId - Document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateDocument(documentId, updates) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = await getDocument(documentId);
            if (!doc) {
                reject(new Error('Document not found'));
                return;
            }
            
            const transaction = db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            const updatedDoc = { ...doc, ...updates, id: documentId };
            const request = store.put(updatedDoc);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Delete a document and all its chunks and vectors
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<void>}
 */
async function deleteDocument(documentId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Delete document
            const docTransaction = db.transaction(['documents'], 'readwrite');
            const docStore = docTransaction.objectStore('documents');
            await docStore.delete(documentId);
            
            // Delete all chunks for this document
            await deleteChunksByDocument(documentId);
            
            // Delete vectors for this document
            await deleteVectors(documentId);
            
            console.log('Document, chunks, and vectors deleted:', documentId);
            resolve();
        } catch (error) {
            console.error('Error deleting document:', error);
            reject(error);
        }
    });
}

// ============================================================================
// CHUNK OPERATIONS
// ============================================================================

/**
 * Add a chunk to IndexedDB
 * 
 * @param {Object} chunk - Chunk object
 * @param {number} chunk.documentId - Parent document ID
 * @param {number} chunk.collectionId - Collection ID (optional)
 * @param {number} chunk.chunkNumber - Sequential chunk number
 * @param {string} chunk.content - Chunk text content
 * @param {number} chunk.charCount - Character count
 * @returns {Promise<number>} Chunk ID
 */
async function addChunk(chunk) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['chunks'], 'readwrite');
        const store = transaction.objectStore('chunks');
        
        const chunkData = {
            documentId: chunk.documentId,
            collectionId: chunk.collectionId || null,
            chunkNumber: chunk.chunkNumber,
            content: chunk.content,
            charCount: chunk.charCount
        };
        
        const request = store.add(chunkData);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all chunks for a document
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<Array>} Array of chunks, sorted by chunkNumber
 */
async function getChunksByDocument(documentId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['chunks'], 'readonly');
        const store = transaction.objectStore('chunks');
        const index = store.index('documentId');
        const request = index.getAll(documentId);
        
        request.onsuccess = () => {
            const chunks = request.result;
            // Sort by chunk number
            chunks.sort((a, b) => a.chunkNumber - b.chunkNumber);
            resolve(chunks);
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all chunks for a collection
 * 
 * @param {number} collectionId - Collection ID
 * @returns {Promise<Array>} Array of chunks
 */
async function getChunksByCollection(collectionId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['chunks'], 'readonly');
        const store = transaction.objectStore('chunks');
        const index = store.index('collectionId');
        const request = index.getAll(collectionId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete all chunks for a document
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<void>}
 */
async function deleteChunksByDocument(documentId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['chunks'], 'readwrite');
        const store = transaction.objectStore('chunks');
        const index = store.index('documentId');
        const request = index.openCursor(documentId);
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

// ============================================================================
// COLLECTION OPERATIONS
// ============================================================================

/**
 * Create a new collection
 * 
 * @param {Object} collection - Collection object
 * @param {string} collection.name - Collection name
 * @param {string} collection.description - Optional description
 * @returns {Promise<number>} Collection ID
 */
async function createCollection(collection) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['collections'], 'readwrite');
        const store = transaction.objectStore('collections');
        
        const collData = {
            name: collection.name,
            description: collection.description || '',
            createdDate: new Date().toISOString()
        };
        
        const request = store.add(collData);
        
        request.onsuccess = () => {
            console.log('Collection created:', request.result);
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('Error creating collection:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get a collection by ID
 * 
 * @param {number} collectionId - Collection ID
 * @returns {Promise<Object>} Collection object
 */
async function getCollection(collectionId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['collections'], 'readonly');
        const store = transaction.objectStore('collections');
        const request = store.get(collectionId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all collections
 * 
 * @returns {Promise<Array>} Array of all collections
 */
async function getAllCollections() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['collections'], 'readonly');
        const store = transaction.objectStore('collections');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update a collection
 * 
 * @param {number} collectionId - Collection ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
async function updateCollection(collectionId, updates) {
    return new Promise(async (resolve, reject) => {
        try {
            const coll = await getCollection(collectionId);
            if (!coll) {
                reject(new Error('Collection not found'));
                return;
            }
            
            const transaction = db.transaction(['collections'], 'readwrite');
            const store = transaction.objectStore('collections');
            
            const updatedColl = { ...coll, ...updates, id: collectionId };
            const request = store.put(updatedColl);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Delete a collection (does not delete documents/chunks, only collection metadata)
 * 
 * @param {number} collectionId - Collection ID
 * @returns {Promise<void>}
 */
async function deleteCollection(collectionId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['collections'], 'readwrite');
        const store = transaction.objectStore('collections');
        const request = store.delete(collectionId);
        
        request.onsuccess = () => {
            console.log('Collection deleted:', collectionId);
            resolve();
        };
        
        request.onerror = () => reject(request.error);
    });
}

// ============================================================================
// VECTOR OPERATIONS (Phase 2 - Semantic Search)
// ============================================================================

/**
 * Add or update vectors for a document
 * 
 * @param {number} documentId - Document ID
 * @param {Object} vectorData - Vector data from vectorizer
 * @param {Map} vectorData.matrix - Co-occurrence matrix (Map of Maps)
 * @param {Map} vectorData.termFrequencies - Term frequency map
 * @param {number} vectorData.totalTerms - Total term count
 * @returns {Promise<void>}
 */
async function addVectors(documentId, vectorData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['vectors'], 'readwrite');
        const store = transaction.objectStore('vectors');
        
        // Convert Maps to objects for storage (IndexedDB can't store Map objects)
        const storableData = {
            documentId: documentId,
            matrix: Object.fromEntries(
                Array.from(vectorData.matrix.entries()).map(([term, coOccMap]) => [
                    term,
                    Object.fromEntries(coOccMap)
                ])
            ),
            termFrequencies: Object.fromEntries(vectorData.termFrequencies),
            totalTerms: vectorData.totalTerms,
            created: new Date().toISOString()
        };
        
        const request = store.put(storableData);
        
        request.onsuccess = () => {
            console.log('Vectors stored for document:', documentId);
            resolve();
        };
        
        request.onerror = () => {
            console.error('Error storing vectors:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Get vectors for a document
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<Object|null>} Vector data with Maps reconstructed, or null if not found
 */
async function getVectors(documentId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['vectors'], 'readonly');
        const store = transaction.objectStore('vectors');
        const request = store.get(documentId);
        
        request.onsuccess = () => {
            if (!request.result) {
                resolve(null);
                return;
            }
            
            // Convert objects back to Maps
            const data = request.result;
            const matrix = new Map(
                Object.entries(data.matrix).map(([term, coOccObj]) => [
                    term,
                    new Map(Object.entries(coOccObj).map(([k, v]) => [k, Number(v)]))
                ])
            );
            
            resolve({
                matrix: matrix,
                termFrequencies: new Map(Object.entries(data.termFrequencies).map(([k, v]) => [k, Number(v)])),
                totalTerms: data.totalTerms
            });
        };
        
        request.onerror = () => {
            console.error('Error retrieving vectors:', request.error);
            reject(request.error);
        };
    });
}

/**
 * Delete vectors for a document
 * 
 * @param {number} documentId - Document ID
 * @returns {Promise<void>}
 */
async function deleteVectors(documentId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['vectors'], 'readwrite');
        const store = transaction.objectStore('vectors');
        const request = store.delete(documentId);
        
        request.onsuccess = () => {
            console.log('Vectors deleted for document:', documentId);
            resolve();
        };
        
        request.onerror = () => {
            console.error('Error deleting vectors:', request.error);
            reject(request.error);
        };
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get database statistics
 * 
 * @returns {Promise<Object>} Stats object with counts
 */
async function getStats() {
    return new Promise(async (resolve, reject) => {
        try {
            const docs = await getAllDocuments();
            const collections = await getAllCollections();
            
            // Count total chunks
            const transaction = db.transaction(['chunks'], 'readonly');
            const store = transaction.objectStore('chunks');
            const countRequest = store.count();
            
            countRequest.onsuccess = () => {
                resolve({
                    documentCount: docs.length,
                    collectionCount: collections.length,
                    chunkCount: countRequest.result,
                    totalSize: docs.reduce((sum, doc) => sum + doc.size, 0)
                });
            };
            
            countRequest.onerror = () => reject(countRequest.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Clear all data from database (for testing/reset)
 * WARNING: This deletes everything!
 * 
 * @returns {Promise<void>}
 */
async function clearAllData() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['documents', 'chunks', 'collections', 'vectors'], 'readwrite');
        
        transaction.objectStore('documents').clear();
        transaction.objectStore('chunks').clear();
        transaction.objectStore('collections').clear();
        transaction.objectStore('vectors').clear();
        
        transaction.oncomplete = () => {
            console.log('All data cleared from IndexedDB');
            resolve();
        };
        
        transaction.onerror = () => reject(transaction.error);
    });
}

// ============================================================================
// EXPORT API
// ============================================================================

// Initialize database on module load
initDB().catch(error => {
    console.error('Failed to initialize IndexedDB:', error);
});

// Export all functions for use in other modules
window.InvantiaDB = {
    // Document operations
    addDocument,
    getDocument,
    getAllDocuments,
    updateDocument,
    deleteDocument,
    
    // Chunk operations
    addChunk,
    getChunksByDocument,
    getChunksByCollection,
    deleteChunksByDocument,
    
    // Collection operations
    createCollection,
    getCollection,
    getAllCollections,
    updateCollection,
    deleteCollection,
    
    // Vector operations (Phase 2)
    addVectors,
    getVectors,
    deleteVectors,
    
    // Utility
    getStats,
    clearAllData,
    
    // Direct DB access (for advanced use)
    getDB: () => db
};
