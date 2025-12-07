// ~/fastapi_app/static/desktop/config.js
// Invantia Configuration - Centralized settings for chunk and package sizing

(function() {
  'use strict';

  window.InvantiaConfig = {
    
    // =====================================================================
    // CHUNK SIZING
    // =====================================================================
    
    /**
     * Base chunk size from document processing
     * This is the fundamental unit of text storage
     */
    CHUNK_SIZE: 2000,  // characters
    
    // =====================================================================
    // SUPER CHUNK SIZING (Paste Limits)
    // =====================================================================
    
    /**
     * Super chunks are collections of chunks sized for single paste
     * into LLM chat UIs. Sized based on empirical paste limit testing.
     */
    SUPER_CHUNK_STANDARD: 30000,  // Standard AI accounts (free tier)
    SUPER_CHUNK_LARGE: 100000,    // Large AI accounts (paid tier)
    
    // =====================================================================
    // CHAT PACKAGE SIZING (Context Window Utilization)
    // =====================================================================
    
    /**
     * Chat packages are complete result sets (all super chunks for one query)
     * Sized to ~80% of typical LLM context windows for the tier
     */
    PACKAGE_SIZE_STANDARD: 75000,   // ~3 super chunks at 22k each = ~66k
    PACKAGE_SIZE_LARGE: 150000,     // ~3 super chunks at 45k each = ~135k
    
    // =====================================================================
    // AI ACCOUNT TIERS
    // =====================================================================
    
    /**
     * User-facing labels and descriptions for AI account tiers
     * Note: These refer to the user's AI provider account (ChatGPT, Claude, etc.)
     * NOT Invantia accounts (Invantia Desktop is always free)
     */
    TIERS: {
      standard: {
        id: 'standard',
        name: 'Standard',
        description: '30k character paste limit',
        hint: 'Works with all free AI accounts',
        superChunkSize: 30000,
        packageSize: 75000,
        maxSuperChunks: 3
      },
      large: {
        id: 'large',
        name: 'Large',
        description: '100k character paste limit',
        hint: 'For paid AI subscriptions (ChatGPT Plus, Claude Pro, etc.)',
        superChunkSize: 100000,
        packageSize: 150000,
        maxSuperChunks: 3
      }
    },
    
    // =====================================================================
    // LEGACY LLM CONFIGURATIONS (Backward Compatibility)
    // =====================================================================
    
    /**
     * Legacy LLM-specific configs for backward compatibility
     * Maps old LLM IDs to new tier system
     */
    LEGACY_LLM_MAPPING: {
      'free-chatgpt': 'standard',
      'free-gemini': 'standard',
      'free-claude': 'standard',
      'paid-chatgpt': 'large',
      'paid-gemini': 'large',
      'paid-claude': 'large'
    },
    
    // =====================================================================
    // HELPER FUNCTIONS
    // =====================================================================
    
    /**
     * Get tier configuration by ID
     */
    getTier: function(tierId) {
      return this.TIERS[tierId] || this.TIERS.standard;
    },
    
    /**
     * Map legacy LLM ID to tier
     */
    getTierFromLegacyLLM: function(llmId) {
      const tierId = this.LEGACY_LLM_MAPPING[llmId] || 'standard';
      return this.getTier(tierId);
    },
    
    /**
     * Calculate number of super chunks needed for given content size
     */
    calculateSuperChunkCount: function(contentSize, tierId) {
      const tier = this.getTier(tierId);
      return Math.ceil(contentSize / tier.superChunkSize);
    },
    
    /**
     * Get maximum characters per super chunk for tier
     */
    getMaxCharsPerSuperChunk: function(tierId) {
      const tier = this.getTier(tierId);
      return tier.superChunkSize;
    },
    
    /**
     * Get maximum total package size for tier
     */
    getMaxPackageSize: function(tierId) {
      const tier = this.getTier(tierId);
      return tier.packageSize;
    },
    
    /**
     * Validate if content fits within tier limits
     */
    validatePackageSize: function(contentSize, tierId) {
      const tier = this.getTier(tierId);
      return {
        fitsInPackage: contentSize <= tier.packageSize,
        superChunksNeeded: Math.ceil(contentSize / tier.superChunkSize),
        exceedsLimit: contentSize > tier.packageSize,
        tierName: tier.name
      };
    }
  };
  
  console.log('Invantia Config loaded');
  
})();
