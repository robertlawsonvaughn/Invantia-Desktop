// ~/fastapi_app/static/desktop/query-builder.js
// Query Builder Module v2.3 - Hybrid Scoring with Topic Grouping
// Natural language textarea with automatic semantic expansion and relevance scoring

(function() {
  'use strict';

  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================
  
  const state = {
    selectedDocuments: [],
    selectedCollection: null,
    sourceType: 'documents',
    accountTier: null,
    maxCharsPerSuperChunk: 0,
    maxPackageSize: 0,
    queryTopics: [],
    topicIdCounter: 1,
    vectorizationEnabled: false,
    maxTopics: 5,
    limitSuperChunks: true,
    maxSuperChunksPerTopic: 3,
    searchInProgress: false
  };

  // =========================================================================
  // SEARCH PROGRESS UI
  // =========================================================================
  
  function showSearchProgress() {
    state.searchInProgress = true;
    
    const searchButton = document.querySelector('#searchButtonSection button');
    const limitControl = document.getElementById('limitSuperChunksControl');
    
    // Hide button and limit control
    if (searchButton) searchButton.style.display = 'none';
    if (limitControl) limitControl.style.display = 'none';
    
    // Create progress container
    const progressContainer = document.createElement('div');
    progressContainer.id = 'searchProgressContainer';
    progressContainer.innerHTML = `
      <div style="
        padding: 1.5rem;
        background: rgba(124, 108, 255, 0.08);
        border: 2px solid var(--accent);
        border-radius: 12px;
        margin-top: 1rem;
      ">
        <div style="margin-bottom: 0.75rem;">
          <div style="
            width: 100%;
            height: 8px;
            background: #0f0f14;
            border-radius: 4px;
            overflow: hidden;
          ">
            <div id="searchProgressBar" style="
              width: 0%;
              height: 100%;
              background: linear-gradient(90deg, var(--accent), var(--accent-2));
              transition: width 0.3s ease;
            "></div>
          </div>
        </div>
        <div id="searchProgressText" style="
          text-align: center;
          color: var(--text);
          font-size: 14px;
          font-weight: 500;
        ">
          🔄 Initializing search...
        </div>
      </div>
    `;
    
    const searchSection = document.getElementById('searchButtonSection');
    searchSection.appendChild(progressContainer);
  }
  
  function updateSearchProgress(percent, message) {
    const progressBar = document.getElementById('searchProgressBar');
    const progressText = document.getElementById('searchProgressText');
    
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    
    if (progressText) {
      progressText.innerHTML = `🔄 ${message}`;
    }
  }
  
  function hideSearchProgress() {
    state.searchInProgress = false;
    
    const progressContainer = document.getElementById('searchProgressContainer');
    if (progressContainer) {
      progressContainer.remove();
    }
    
    const searchButton = document.querySelector('#searchButtonSection button');
    const limitControl = document.getElementById('limitSuperChunksControl');
    
    // Show button and limit control again
    if (searchButton) searchButton.style.display = 'block';
    if (limitControl) limitControl.style.display = 'block';
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  
  async function initializeQueryBuilder() {
    console.log('Query Builder v2.3 initializing...');
    
    state.vectorizationEnabled = typeof window.InvantiaVectorizer !== 'undefined';
    
    if (state.vectorizationEnabled) {
      console.log('✓ Vectorization enabled - semantic expansion with scoring active');
    } else {
      console.log('⚠ Vectorization not available - exact matching only');
    }
    
    await loadDocumentsAndCollections();
    
    const stats = await window.InvantiaDB.getStats();
    if (stats.documentCount === 0) {
      showNoDocumentsMessage();
      return;
    }
    
    console.log('Query Builder ready!');
  }

  async function loadDocumentsAndCollections() {
    try {
      const documents = await window.InvantiaDB.getAllDocuments();
      const docContainer = document.getElementById('documentCheckboxes');
      
      if (documents.length === 0) {
        docContainer.innerHTML = '<p class="muted sm">No documents available. Upload documents first.</p>';
      } else {
        docContainer.innerHTML = '';
        documents.forEach(doc => {
          const label = document.createElement('label');
          label.className = 'checkbox-label';
          label.innerHTML = `
            <input 
              type="checkbox" 
              name="selectedDocs" 
              value="${doc.id}"
              onchange="window.QueryBuilder.handleDocumentSelection()"
            >
            ${escapeHtml(doc.name)} <span class="sm muted">(${formatBytes(doc.size)})</span>
          `;
          docContainer.appendChild(label);
        });
      }
      
      const collections = await window.InvantiaDB.getAllCollections();
      const collectionSelect = document.getElementById('collectionSelect');
      
      if (collections.length === 0) {
        collectionSelect.innerHTML = '<option value="">No collections available</option>';
      } else {
        collectionSelect.innerHTML = '<option value="">-- Select a Collection --</option>';
        collections.forEach(coll => {
          const option = document.createElement('option');
          option.value = coll.id;
          option.textContent = coll.name;
          collectionSelect.appendChild(option);
        });
      }
      
    } catch (error) {
      console.error('Error loading documents/collections:', error);
    }
  }

  function showNoDocumentsMessage() {
    const container = document.getElementById('queryBuilderContainer');
    container.style.display = 'block';
    container.innerHTML = `
      <div class="empty-state">
        <p>📄 No documents uploaded yet.</p>
        <p><a href="#uploadSection">Upload documents</a> to start building queries.</p>
      </div>
    `;
  }

  // =========================================================================
  // DOCUMENT/COLLECTION SELECTION
  // =========================================================================
  
  function handleSourceTypeChange() {
    const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
    state.sourceType = sourceType;
    
    const docContainer = document.getElementById('documentSelectionContainer');
    const collContainer = document.getElementById('collectionSelectionContainer');
    
    if (sourceType === 'documents') {
      docContainer.style.display = 'block';
      collContainer.style.display = 'none';
      state.selectedCollection = null;
    } else {
      docContainer.style.display = 'none';
      collContainer.style.display = 'block';
      state.selectedDocuments = [];
    }
    
    checkPrerequisites();
  }

  function handleDocumentSelection() {
    const checkboxes = document.querySelectorAll('input[name="selectedDocs"]:checked');
    state.selectedDocuments = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    checkPrerequisites();
  }

  function handleCollectionSelection() {
    const select = document.getElementById('collectionSelect');
    state.selectedCollection = select.value ? parseInt(select.value) : null;
    
    checkPrerequisites();
  }

  function checkPrerequisites() {
    const hasSource = (state.sourceType === 'documents' && state.selectedDocuments.length > 0) ||
                      (state.sourceType === 'collection' && state.selectedCollection !== null);
    
    const accountTierSection = document.getElementById('accountTierSection');
    
    if (hasSource) {
      accountTierSection.style.display = 'block';
    } else {
      accountTierSection.style.display = 'none';
      hideQueryBuilder();
    }
  }

  // =========================================================================
  // ACCOUNT TIER SELECTION
  // =========================================================================
  
  function handleTierChange() {
    const select = document.getElementById('accountTierSelect');
    const selectedOption = select.options[select.selectedIndex];
    
    if (!selectedOption.value) {
      hideQueryBuilder();
      return;
    }
    
    state.accountTier = selectedOption.value;
    
    const tierConfig = window.InvantiaConfig.getTier(state.accountTier);
    state.maxCharsPerSuperChunk = tierConfig.superChunkSize;
    state.maxPackageSize = tierConfig.packageSize;
    
    console.log(`Account tier selected: ${tierConfig.name}, super chunk: ${tierConfig.superChunkSize}, package: ${tierConfig.packageSize}`);
    
    showQueryBuilder();
  }

  function showQueryBuilder() {
    document.getElementById('queryBuilderContainer').style.display = 'block';
    document.getElementById('searchButtonSection').style.display = 'block';
    
    if (state.queryTopics.length === 0) {
      addQueryTopic();
    }
    
    renderLimitSuperChunksControl();
  }

  function hideQueryBuilder() {
    document.getElementById('queryBuilderContainer').style.display = 'none';
    document.getElementById('searchButtonSection').style.display = 'none';
  }

  // =========================================================================
  // LIMIT SUPER CHUNKS CONTROL
  // =========================================================================
  
  function renderLimitSuperChunksControl() {
    const searchSection = document.getElementById('searchButtonSection');
    
    // Check if control already exists
    let limitControl = document.getElementById('limitSuperChunksControl');
    
    if (!limitControl) {
      limitControl = document.createElement('div');
      limitControl.id = 'limitSuperChunksControl';
      limitControl.className = 'limit-control';
      limitControl.style.marginBottom = '1rem';
      
      // Insert before the search button
      const searchButton = searchSection.querySelector('button');
      searchSection.insertBefore(limitControl, searchButton);
    }
    
    limitControl.innerHTML = `
      <div style="
        padding: 0.75rem 1rem;
        background: rgba(124, 108, 255, 0.08);
        border: 1px solid var(--accent);
        border-radius: 10px;
        margin-bottom: 1rem;
      ">
        <label class="checkbox-label" style="
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 14px;
          margin: 0;
        ">
          <input 
            type="checkbox" 
            id="limitSuperChunksCheckbox"
            ${state.limitSuperChunks ? 'checked' : ''}
            onchange="QueryBuilder.handleLimitCheckboxChange()"
            style="
              width: 18px;
              height: 18px;
              cursor: pointer;
              accent-color: var(--accent);
            "
          >
          <span style="flex: 1;">
            Limit to top 
            <select 
              id="maxSuperChunksSelect" 
              ${!state.limitSuperChunks ? 'disabled' : ''}
              onchange="QueryBuilder.handleMaxSuperChunksChange()"
              style="
                width: 60px;
                display: inline-block;
                margin: 0 0.35rem;
                padding: 4px 8px;
                border-radius: 6px;
                border: 1px solid var(--border);
                background: #0f0f14;
                color: var(--text);
                font-size: 14px;
                cursor: pointer;
              "
            >
              <option value="1" ${state.maxSuperChunksPerTopic === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${state.maxSuperChunksPerTopic === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${state.maxSuperChunksPerTopic === 3 ? 'selected' : ''}>3</option>
              <option value="5" ${state.maxSuperChunksPerTopic === 5 ? 'selected' : ''}>5</option>
              <option value="10" ${state.maxSuperChunksPerTopic === 10 ? 'selected' : ''}>10</option>
            </select>
            super chunks per topic
          </span>
        </label>
        <small class="help-text" style="
          display: block;
          margin-top: 0.5rem;
          margin-left: 1.75rem;
          color: var(--muted);
          font-size: 12px;
        ">
          Uncheck to return all results
        </small>
      </div>
    `;
  }
  
  function handleLimitCheckboxChange() {
    const checkbox = document.getElementById('limitSuperChunksCheckbox');
    const select = document.getElementById('maxSuperChunksSelect');
    
    state.limitSuperChunks = checkbox.checked;
    select.disabled = !checkbox.checked;
    
    console.log(`Limit super chunks: ${state.limitSuperChunks ? state.maxSuperChunksPerTopic : 'unlimited'}`);
  }
  
  function handleMaxSuperChunksChange() {
    const select = document.getElementById('maxSuperChunksSelect');
    state.maxSuperChunksPerTopic = parseInt(select.value);
    
    console.log(`Max super chunks per topic: ${state.maxSuperChunksPerTopic}`);
  }

  // =========================================================================
  // QUERY TOPIC MANAGEMENT
  // =========================================================================
  
  function addQueryTopic() {
    const topicId = state.topicIdCounter++;
    
    const topic = {
      topicId: topicId,
      question: '',
      spatialCategory: 'auto'
    };
    
    state.queryTopics.push(topic);
    
    renderQueryTopics();
    updateAddTopicButton();
  }

  function removeQueryTopic(topicId) {
    const index = state.queryTopics.findIndex(t => t.topicId === topicId);
    if (index === -1) return;
    
    state.queryTopics.splice(index, 1);
    
    renderQueryTopics();
    updateAddTopicButton();
  }

  function updateTopicField(topicId, field, value) {
    const topic = state.queryTopics.find(t => t.topicId === topicId);
    if (!topic) return;
    
    topic[field] = value;
  }

  function updateAddTopicButton() {
    const btn = document.getElementById('addTopicBtn');
    if (state.queryTopics.length >= state.maxTopics) {
      btn.disabled = true;
      btn.textContent = `Maximum ${state.maxTopics} topics reached`;
    } else {
      btn.disabled = false;
      btn.textContent = '+ Add Another Topic';
    }
  }

  function renderQueryTopics() {
    const container = document.getElementById('queryTopics');
    container.innerHTML = '';
    
    state.queryTopics.forEach((topic, index) => {
      const topicEl = document.createElement('div');
      topicEl.className = 'query-topic';
      topicEl.dataset.topicId = topic.topicId;
      
      const isFirst = index === 0;
      const topicNumber = index + 1;
      
      const vectorBadge = state.vectorizationEnabled 
        ? '<span class="vector-badge">✓ Semantic search with scoring</span>'
        : '<span class="vector-badge disabled">Exact matching only</span>';
      
      topicEl.innerHTML = `
        <div class="topic-header">
          <div class="topic-title">
            <h4>Topic ${topicNumber}${isFirst ? ' (Required)' : ''}</h4>
            ${vectorBadge}
          </div>
          ${!isFirst ? `<button class="btn btn-sm btn-danger" onclick="window.QueryBuilder.removeQueryTopic(${topic.topicId})">Remove</button>` : ''}
        </div>
        
        <div class="topic-content">
          <div class="form-group">
            <label>
              ${isFirst ? 'What do you want to find?' : 'Additional topic to search for'}
              <span class="required">*</span>
            </label>
            <textarea 
              class="form-control question-input" 
              placeholder="${isFirst ? 'e.g., How do I install the fuel system?' : 'e.g., What are the safety procedures?'}"
              rows="3"
              onchange="window.QueryBuilder.updateTopicField(${topic.topicId}, 'question', this.value)"
            >${escapeHtml(topic.question)}</textarea>
            <small class="help-text">
              ${state.vectorizationEnabled 
                ? 'Terms will be expanded and results scored by relevance'
                : 'Enter keywords or questions - exact matching will be used'}
            </small>
          </div>
          
          <div class="form-group">
            <label>Search Pattern</label>
            <select 
              class="form-control" 
              onchange="window.QueryBuilder.updateTopicField(${topic.topicId}, 'spatialCategory', this.value)"
            >
              <option value="auto" ${topic.spatialCategory === 'auto' ? 'selected' : ''}>Auto-detect (Recommended)</option>
              <option value="concentrated" ${topic.spatialCategory === 'concentrated' ? 'selected' : ''}>Concentrated - Terms close together</option>
              <option value="spread" ${topic.spatialCategory === 'spread' ? 'selected' : ''}>Spread - Throughout document</option>
            </select>
            <small class="help-text">
              ${getSpatialCategoryHelp(topic.spatialCategory)}
            </small>
          </div>
        </div>
      `;
      
      container.appendChild(topicEl);
    });
  }

  function getSpatialCategoryHelp(category) {
    switch(category) {
      case 'concentrated':
        return 'Find content where terms appear close together - good for definitions';
      case 'spread':
        return 'Find content distributed throughout - good for gathering all mentions';
      case 'auto':
      default:
        return 'System automatically determines the best pattern';
    }
  }

  // =========================================================================
  // QUERY EXPANSION WITH SCORING (v2.3)
  // =========================================================================
  
  async function expandQueryTopics(query) {
    if (!state.vectorizationEnabled) {
      console.log('Vectorization disabled - using original queries');
      return query;
    }
    
    console.log('Expanding queries with vectorization and scoring...');
    
    let documentIds = [];
    if (query.sourceType === 'documents') {
      documentIds = query.documentIds;
    } else if (query.sourceType === 'collection') {
      // Collections don't store documentIds directly
      // Instead, chunks have collectionId - get unique document IDs from chunks
      const chunks = await window.InvantiaDB.getChunksByCollection(query.collectionId);
      const uniqueDocIds = [...new Set(chunks.map(c => c.documentId))];
      documentIds = uniqueDocIds;
      console.log(`Collection contains ${documentIds.length} documents (from ${chunks.length} chunks)`);
    }
    
    if (documentIds.length === 0) {
      console.warn('No documents found for vectorization');
      return query;
    }
    
    const expandedTopics = await Promise.all(
      query.topics.map(async (topic) => {
        try {
          const expansions = await window.InvantiaVectorizer.expandQueryMultiDoc(
            topic.question,
            documentIds
          );
          
          // Extract original terms from the question
          const originalTerms = [];
          expansions.forEach(exp => {
            originalTerms.push(exp.originalTerm);
          });
          
          // Combine all expanded terms into single concept with metadata
          const allExpandedTerms = [];
          const termMetadata = new Map(); // Store similarity scores
          
          expansions.forEach(exp => {
            exp.expandedTerms.forEach((term, idx) => {
              if (!termMetadata.has(term)) {
                termMetadata.set(term, {
                  similarity: exp.similarities[idx] || 1.0,
                  isOriginal: exp.originalTerm === term
                });
              }
              allExpandedTerms.push(term);
            });
          });
          
          const uniqueTerms = [...new Set(allExpandedTerms)];
          
          // Create single concept with scoring metadata
          const singleConcept = {
            conceptId: `topic_${topic.topicId}`,
            terms: uniqueTerms,
            originalTerms: originalTerms,
            termMetadata: Object.fromEntries(termMetadata),
            originalQuestion: topic.question,
            expansionDetails: expansions
          };
          
          console.log(`Topic ${topic.topicId}: ${uniqueTerms.length} unique terms (${originalTerms.length} original)`);
          
          return {
            ...topic,
            expandedConcepts: [singleConcept],
            originalQuestion: topic.question
          };
          
        } catch (error) {
          console.error('Error expanding topic:', error);
          return topic;
        }
      })
    );
    
    const expandedQuery = {
      ...query,
      topics: expandedTopics,
      vectorizationApplied: true
    };
    
    console.log('Queries expanded successfully');
    return expandedQuery;
  }

  // =========================================================================
  // QUERY STRUCTURE GENERATION
  // =========================================================================
  
  function generateQueryStructure() {
    const tierConfig = window.InvantiaConfig.getTier(state.accountTier);
    
    const query = {
      version: '2.3',
      accountTier: state.accountTier,
      tierName: tierConfig.name,
      maxCharsPerSuperChunk: state.maxCharsPerSuperChunk,
      maxPackageSize: state.maxPackageSize,
      sourceType: state.sourceType,
      documentIds: state.sourceType === 'documents' ? state.selectedDocuments : [],
      collectionId: state.sourceType === 'collection' ? state.selectedCollection : null,
      vectorizationEnabled: state.vectorizationEnabled,
      limitSuperChunks: state.limitSuperChunks,
      maxSuperChunksPerTopic: state.maxSuperChunksPerTopic,
      
      topics: state.queryTopics.map(t => ({
        topicId: t.topicId,
        question: t.question,
        spatialCategory: t.spatialCategory
      })),
      
      timestamp: new Date().toISOString()
    };
    
    return query;
  }

  function validateQuery() {
    const errors = [];
    
    if (state.sourceType === 'documents' && state.selectedDocuments.length === 0) {
      errors.push('Please select at least one document');
    }
    if (state.sourceType === 'collection' && !state.selectedCollection) {
      errors.push('Please select a collection');
    }
    
    if (!state.accountTier) {
      errors.push('Please select your AI chat window size');
    }
    
    if (state.queryTopics.length === 0) {
      errors.push('Please add at least one search topic');
    }
    
    state.queryTopics.forEach((topic, index) => {
      if (!topic.question || topic.question.trim() === '') {
        errors.push(`Topic ${index + 1}: Please enter a question or search terms`);
      }
    });
    
    return errors;
  }

  // =========================================================================
  // SEARCH EXECUTION
  // =========================================================================
  
  async function executeSearch() {
    console.log('Executing search...');
    
    // Prevent double-clicking
    if (state.searchInProgress) {
      return;
    }
    
    const errors = validateQuery();
    if (errors.length > 0) {
      alert('Please fix the following:\n\n' + errors.join('\n'));
      return;
    }
    
    // Show progress UI
    showSearchProgress();
    
    try {
      updateSearchProgress(10, 'Building query structure...');
      
      let query = generateQueryStructure();
      
      console.log('Original query (v2.3):', query);
      
      if (state.vectorizationEnabled) {
        updateSearchProgress(20, 'Applying semantic expansion...');
        console.log('Applying semantic expansion with scoring...');
        query = await expandQueryTopics(query);
        console.log('Expanded query:', query);
      }
      
      updateSearchProgress(40, 'Executing search...');
      
      const searchQuery = convertToSearchFormat(query);
      
      console.log('Passing to search engine:', searchQuery);
      
      // Execute search with progress updates
      updateSearchProgress(50, 'Retrieving chunks from documents...');
      
      const results = await window.InvantiaSearch.executeQuery(searchQuery);
      
      updateSearchProgress(80, 'Scoring and ranking results...');
      
      console.log('Search results:', results);
      
      // Small delay to show 80% state
      await new Promise(resolve => setTimeout(resolve, 200));
      
      updateSearchProgress(90, 'Creating super chunks...');
      
      // Small delay to show 90% state
      await new Promise(resolve => setTimeout(resolve, 200));
      
      updateSearchProgress(100, 'Formatting results...');
      
      // Small delay before showing results
      await new Promise(resolve => setTimeout(resolve, 300));
      
      hideSearchProgress();
      displaySearchResults(results, query);
      
    } catch (error) {
      console.error('Search error:', error);
      hideSearchProgress();
      alert('Error executing search: ' + error.message);
    }
  }

  function convertToSearchFormat(query) {
    const blocks = query.topics.map((topic, index) => {
      let inclusionConcepts = [];
      
      if (topic.expandedConcepts) {
        inclusionConcepts = topic.expandedConcepts;
      } else {
        const words = topic.question
          .toLowerCase()
          .replace(/[?.,!]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 2);
        
        inclusionConcepts = [{
          conceptId: `topic_${topic.topicId}`,
          terms: words,
          originalTerms: words,
          termMetadata: {}
        }];
      }
      
      return {
        blockId: index + 1,
        topicId: topic.topicId,
        topicQuestion: topic.question,
        spatialCategory: topic.spatialCategory,
        inclusionConcepts: inclusionConcepts,
        exclusionConcepts: [],
        blockType: index === 0 ? null : 'merge',
        blockOperator: index === 0 ? null : 'OR'
      };
    });
    
    return {
      version: '2.3',
      accountTier: query.accountTier,
      tierName: query.tierName,
      maxCharsPerSuperChunk: query.maxCharsPerSuperChunk,
      maxPackageSize: query.maxPackageSize,
      sourceType: query.sourceType,
      documentIds: query.documentIds,
      collectionId: query.collectionId,
      vectorizationApplied: query.vectorizationApplied,
      limitSuperChunks: query.limitSuperChunks,
      maxSuperChunksPerTopic: query.maxSuperChunksPerTopic,
      blocks: blocks,
      allTopics: query.topics.map(t => t.question),
      timestamp: query.timestamp
    };
  }

  function displaySearchResults(results, query) {
    const container = document.getElementById('searchResultsContainer');
    const section = document.getElementById('searchResultsSection');
    
    section.style.display = 'block';
    
    if (!results || results.superChunks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No results found.</p>
          <p class="muted">Try different search terms or topics.</p>
        </div>
      `;
      return;
    }
    
    // Store results globally for copy function
    window._currentSearchResults = results;
    
    // Convert search results to package-formatter format
    const packageData = {
      isSplit: results.superChunks.length > 1,
      totalParts: results.superChunks.length,
      parts: results.superChunks.map(sc => sc.formattedContent),
      characterCount: results.superChunks.reduce((sum, sc) => sum + sc.charCount, 0)
    };
    
    // Add header with vector status
    const vectorStatus = query.vectorizationApplied 
      ? '✓ Semantic expansion with scoring applied'
      : 'Exact matching used';
    
    container.innerHTML = `
      <div class="results-header" style="margin-bottom: 1rem;">
        <p class="muted">
          ${formatNumber(packageData.characterCount)} total characters in ${packageData.totalParts} super chunk(s) · ${vectorStatus}
        </p>
      </div>
    `;
    
    // Render each super chunk as collapsible accordion
    results.superChunks.forEach((superChunk, index) => {
      const card = document.createElement('div');
      card.className = 'superchunk-card';
      
      card.innerHTML = `
        <div class="superchunk-header" onclick="toggleSuperChunk(this)">
          <div>
            <div class="superchunk-title">
              Super Chunk ${index + 1} of ${results.superChunks.length}
            </div>
            <div class="superchunk-meta">
              ${superChunk.chunkCount} chunks · ${formatNumber(superChunk.charCount)} characters
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <button 
              class="btn btn-primary btn-sm" 
              onclick="window.QueryBuilder.copySuperChunk(${index}); event.stopPropagation();"
              style="margin: 0;"
            >
              📋 Copy
            </button>
            <div class="superchunk-toggle">+</div>
          </div>
        </div>
        <div class="superchunk-body">
          <pre>${escapeHtml(superChunk.formattedContent)}</pre>
        </div>
      `;
      
      container.appendChild(card);
    });
  }

  async function copySuperChunk(index) {
    const results = window._currentSearchResults;
    if (!results || !results.superChunks[index]) {
      alert('Error: Super chunk not found');
      return;
    }
    
    const superChunk = results.superChunks[index];
    const totalParts = results.superChunks.length;
    
    try {
      await navigator.clipboard.writeText(superChunk.formattedContent);
      if (totalParts > 1) {
        alert(`Super chunk ${index + 1} of ${totalParts} copied!\n\nPaste into your AI chat, then copy the next super chunk.`);
      } else {
        alert(`Super chunk copied!\n\nPaste into your AI chat.`);
      }
    } catch (error) {
      console.error('Copy failed:', error);
      showCopyModal(superChunk.formattedContent);
    }
  }

  function showCopyModal(content) {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Copy Super Chunk</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p>Select all and copy (Ctrl+C or Cmd+C):</p>
          <textarea readonly style="width: 100%; height: 400px; font-family: monospace;">${escapeHtml(content)}</textarea>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  
  window.QueryBuilder = {
    initialize: initializeQueryBuilder,
    handleSourceTypeChange: handleSourceTypeChange,
    handleDocumentSelection: handleDocumentSelection,
    handleCollectionSelection: handleCollectionSelection,
    handleTierChange: handleTierChange,
    addQueryTopic: addQueryTopic,
    removeQueryTopic: removeQueryTopic,
    updateTopicField: updateTopicField,
    handleLimitCheckboxChange: handleLimitCheckboxChange,
    handleMaxSuperChunksChange: handleMaxSuperChunksChange,
    executeSearch: executeSearch,
    copySuperChunk: copySuperChunk
  };

  console.log('Query Builder v2.3 loaded (Hybrid Scoring + Topic Grouping)');

})();
