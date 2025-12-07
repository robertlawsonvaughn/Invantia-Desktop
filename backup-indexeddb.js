// ~/fastapi_app/static/desktop/backup-indexeddb.js
//
// IndexedDB Backup for Invantia Desktop
// Enables export and import of all IndexedDB data as JSON
// Supports backup to file and restoration from backup
//
// Future Enhancement: Server-side backup for registered users

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export all IndexedDB data to JSON
 * 
 * @returns {Promise<Object>} Complete database export
 */
async function exportAllData() {
    try {
        const documents = await window.InvantiaDB.getAllDocuments();
        const collections = await window.InvantiaDB.getAllCollections();
        
        // Get all chunks (requires iterating through documents)
        const allChunks = [];
        for (const doc of documents) {
            const chunks = await window.InvantiaDB.getChunksByDocument(doc.id);
            allChunks.push(...chunks);
        }
        
        const exportData = {
            version: 1,
            exportDate: new Date().toISOString(),
            stats: await window.InvantiaDB.getStats(),
            documents: documents,
            chunks: allChunks,
            collections: collections
        };
        
        return exportData;
        
    } catch (error) {
        console.error('Error exporting data:', error);
        throw error;
    }
}

/**
 * Download database export as JSON file
 * 
 * @param {string} filename - Optional custom filename
 */
async function downloadBackup(filename = null) {
    try {
        // Show progress
        showProgress('Exporting data...');
        
        // Export data
        const exportData = await exportAllData();
        
        // Generate filename if not provided
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            filename = `invantia-desktop-backup-${timestamp}.json`;
        }
        
        // Convert to JSON string
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        // Cleanup
        URL.revokeObjectURL(url);
        
        hideProgress();
        
        showMessage('Backup downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error downloading backup:', error);
        hideProgress();
        showMessage('Error creating backup: ' + error.message, 'error');
    }
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/**
 * Import data from backup JSON
 * 
 * @param {Object} backupData - Exported backup data
 * @param {boolean} clearExisting - Whether to clear existing data first
 * @returns {Promise<Object>} Import statistics
 */
async function importData(backupData, clearExisting = false) {
    try {
        // Validate backup data
        if (!backupData.version || !backupData.documents) {
            throw new Error('Invalid backup file format');
        }
        
        showProgress('Importing data...');
        
        // Clear existing data if requested
        if (clearExisting) {
            await window.InvantiaDB.clearAllData();
        }
        
        const stats = {
            documentsImported: 0,
            chunksImported: 0,
            collectionsImported: 0,
            errors: []
        };
        
        // Import collections first
        for (const collection of backupData.collections || []) {
            try {
                await window.InvantiaDB.createCollection({
                    name: collection.name,
                    description: collection.description
                });
                stats.collectionsImported++;
            } catch (error) {
                stats.errors.push(`Collection "${collection.name}": ${error.message}`);
            }
        }
        
        // Import documents
        for (const doc of backupData.documents || []) {
            try {
                const docId = await window.InvantiaDB.addDocument({
                    name: doc.name,
                    description: doc.description,
                    userDefinedId: doc.userDefinedId,
                    content: doc.content,
                    fileType: doc.fileType,
                    size: doc.size
                });
                stats.documentsImported++;
                
                // Import chunks for this document
                const docChunks = backupData.chunks.filter(c => c.documentId === doc.id);
                for (const chunk of docChunks) {
                    try {
                        await window.InvantiaDB.addChunk({
                            documentId: docId,  // Use new document ID
                            collectionId: chunk.collectionId,
                            chunkNumber: chunk.chunkNumber,
                            content: chunk.content,
                            charCount: chunk.charCount
                        });
                        stats.chunksImported++;
                    } catch (error) {
                        stats.errors.push(`Chunk ${chunk.id}: ${error.message}`);
                    }
                }
                
            } catch (error) {
                stats.errors.push(`Document "${doc.name}": ${error.message}`);
            }
        }
        
        hideProgress();
        
        return stats;
        
    } catch (error) {
        console.error('Error importing data:', error);
        hideProgress();
        throw error;
    }
}

/**
 * Upload and import backup file
 * 
 * @param {File} file - JSON backup file
 * @param {boolean} clearExisting - Whether to clear existing data
 */
async function uploadAndImport(file, clearExisting = false) {
    try {
        // Validate file type
        if (!file.name.endsWith('.json')) {
            throw new Error('Please select a JSON backup file');
        }
        
        // Read file
        const fileContent = await file.text();
        const backupData = JSON.parse(fileContent);
        
        // Confirm import
        const confirmMessage = clearExisting
            ? 'This will REPLACE all existing data. Continue?'
            : 'This will ADD to existing data. Continue?';
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Import data
        const stats = await importData(backupData, clearExisting);
        
        // Show results
        let message = `Import complete!\n\n`;
        message += `Documents imported: ${stats.documentsImported}\n`;
        message += `Chunks imported: ${stats.chunksImported}\n`;
        message += `Collections imported: ${stats.collectionsImported}`;
        
        if (stats.errors.length > 0) {
            message += `\n\nErrors (${stats.errors.length}):\n`;
            message += stats.errors.slice(0, 5).join('\n');
            if (stats.errors.length > 5) {
                message += `\n... and ${stats.errors.length - 5} more`;
            }
        }
        
        alert(message);
        
        // Refresh UI
        window.location.reload();
        
    } catch (error) {
        console.error('Error uploading backup:', error);
        alert('Error importing backup: ' + error.message);
    }
}

// ============================================================================
// BACKUP INTERFACE
// ============================================================================

/**
 * Render backup interface in UI
 * 
 * @param {string} containerId - Container element ID
 */
function renderBackupInterface(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container not found: ${containerId}`);
        return;
    }
    
    container.innerHTML = `
        <div class="backup-interface">
            <h3>Backup & Restore</h3>
            
            <div class="backup-section">
                <h4>Export Data</h4>
                <p>Download all your documents, collections, and chunks as a JSON file.</p>
                <button class="btn btn-primary" onclick="InvantiaBackup.downloadBackup()">
                    Download Backup
                </button>
            </div>
            
            <div class="backup-section">
                <h4>Import Data</h4>
                <p>Upload a previously exported backup file.</p>
                
                <div class="form-group">
                    <input 
                        type="file" 
                        id="backup-file-input" 
                        accept=".json"
                        style="display: none;"
                        onchange="InvantiaBackup.handleFileUpload(event)"
                    >
                    <button class="btn btn-secondary" onclick="document.getElementById('backup-file-input').click()">
                        Choose Backup File
                    </button>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="clear-existing-checkbox">
                        Clear existing data before import
                    </label>
                </div>
            </div>
            
            <div class="backup-section danger">
                <h4>Clear All Data</h4>
                <p class="warning">⚠️ This will permanently delete all documents, collections, and chunks!</p>
                <button class="btn btn-danger" onclick="InvantiaBackup.clearAllData()">
                    Clear All Data
                </button>
            </div>
        </div>
    `;
}

/**
 * Handle file upload from input
 * 
 * @param {Event} event - File input change event
 */
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const clearExisting = document.getElementById('clear-existing-checkbox')?.checked || false;
    uploadAndImport(file, clearExisting);
}

/**
 * Clear all data with confirmation
 */
async function clearAllData() {
    const confirmation = prompt(
        'This will delete ALL data permanently!\n\n' +
        'Type "DELETE" to confirm:'
    );
    
    if (confirmation !== 'DELETE') {
        alert('Cancelled');
        return;
    }
    
    try {
        await window.InvantiaDB.clearAllData();
        alert('All data cleared successfully!');
        window.location.reload();
    } catch (error) {
        console.error('Error clearing data:', error);
        alert('Error clearing data: ' + error.message);
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showProgress(message) {
    // Create progress overlay
    const overlay = document.createElement('div');
    overlay.id = 'backup-progress-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    overlay.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 8px; text-align: center;">
            <div class="spinner"></div>
            <p style="margin-top: 1rem;">${message}</p>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function hideProgress() {
    const overlay = document.getElementById('backup-progress-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function showMessage(message, type = 'info') {
    alert(message);  // Simple for now, can be enhanced with toast notifications
}

// ============================================================================
// EXPORT API
// ============================================================================

window.InvantiaBackup = {
    // Export functions
    exportAllData,
    downloadBackup,
    
    // Import functions
    importData,
    uploadAndImport,
    handleFileUpload,
    
    // Interface
    renderBackupInterface,
    
    // Utilities
    clearAllData
};
