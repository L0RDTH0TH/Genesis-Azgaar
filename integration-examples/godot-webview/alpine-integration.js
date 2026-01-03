/**
 * =============================================================================
 * alpine-integration.js
 * Desc: Standalone Alpine.js component for Azgaar Genesis integration
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 * 
 * USAGE:
 * 1. Include Alpine.js in your HTML: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
 * 2. Include this file: <script type="module" src="./js/azgaar/alpine-integration.js"></script>
 * 3. Use in your HTML: <div x-data="azgaarGenerator()" x-init="init()">
 * 
 * REQUIRED HTML ELEMENTS:
 * - <div id="azgaar-preview"> (for SVG map preview - Canvas rendering is deprecated)
 * - <div id="azgaar-status"> (for status messages, optional)
 * 
 * ADAPTATION NEEDED:
 * - Adjust wizard form field names (wizardSeed, wizardWidth, etc.) to match your existing form
 * - Modify options object to collect from your actual form inputs
 * - Customize styling as needed
 */

import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
// In production, change to local path: import Delaunator from './delaunator.esm.js';

import { 
  initGenerator, 
  loadOptions, 
  generateMap, 
  getMapData, 
  renderPreviewSVG,
  renderToSVG
} from './azgaar-genesis.esm.js';
// In production, ensure path is correct: './azgaar-genesis.esm.js' relative to this file

/**
 * Alpine.js component for Azgaar map generation
 * @returns {Object} Alpine.js component data object
 */
window.azgaarGenerator = function() {
  return {
    // State variables
    azgaarReady: false,
    generating: false,
    previewContainer: null, // SVG container (Canvas rendering is deprecated)
    mapData: null,
    status: '',
    error: null,
    
    // Wizard form data (ADAPT THESE TO MATCH YOUR EXISTING FORM FIELDS)
    wizardSeed: '',           // String: seed for map generation (empty = random)
    wizardWidth: 800,         // Number: map width in pixels
    wizardHeight: 600,        // Number: map height in pixels
    wizardPoints: 4,          // Number: cell density (1=1K, 2=2K, 3=5K, 4=10K, 5=20K cells)
    wizardStates: 18,         // Number: number of states/kingdoms
    wizardCultures: 12,       // Number: number of cultures
    wizardReligions: 6,       // Number: number of religions (optional)
    
    // Computed property for status CSS class
    get statusClass() {
      if (this.error) return 'status-error';
      if (this.status.includes('Complete') || this.status.includes('Ready')) return 'status-success';
      return 'status-info';
    },
    
    /**
     * Initialize - called when Alpine.js component mounts (via x-init)
     */
    init() {
      try {
        // Get SVG container element (required)
        this.previewContainer = document.getElementById('azgaar-preview');
        if (!this.previewContainer) {
          this.error = 'Preview container not found (id="azgaar-preview")';
          console.error('Azgaar: Preview container missing');
          return;
        }
        
        // Initialize the Azgaar generator with SVG container (Canvas rendering is deprecated)
        initGenerator({ container: this.previewContainer });
        this.azgaarReady = true;
        this.status = 'Ready to generate';
        
        console.log('Azgaar: Generator initialized successfully (SVG rendering)');
      } catch (err) {
        this.error = 'Failed to initialize: ' + err.message;
        console.error('Azgaar initialization error:', err);
      }
    },
    
    /**
     * Generate map - main generation function
     * Call this from a button click or other user action
     */
    async generateMap() {
      // Safety checks
      if (!this.azgaarReady) {
        this.error = 'Generator not ready. Please wait for initialization.';
        return;
      }
      
      if (this.generating) {
        console.warn('Azgaar: Generation already in progress');
        return;
      }
      
      // Reset state
      this.generating = true;
      this.status = 'Initializing...';
      this.error = null;
      
      try {
        // Collect options from wizard form
        // Generate random seed if not provided
        const seed = (this.wizardSeed && this.wizardSeed.trim()) 
          ? this.wizardSeed.trim() 
          : String(Math.floor(Math.random() * 1000000));
        
        // Build options object (adapt field names to match your form)
        const options = {
          seed: seed,
          mapWidth: parseInt(this.wizardWidth) || 800,
          mapHeight: parseInt(this.wizardHeight) || 600,
          points: parseInt(this.wizardPoints) || 4,  // Maps to cellsDesired via options.js
          statesNumber: parseInt(this.wizardStates) || 18,
          cultures: parseInt(this.wizardCultures) || 12,
          fullRendering: true, // Phase 5: Enable full Voronoi pack for polygon rendering
        };
        
        // Add optional parameters if needed
        if (this.wizardReligions !== undefined) {
          options.religionsNumber = parseInt(this.wizardReligions) || 6;
        }
        
        // Load and validate options
        this.status = 'Loading options...';
        loadOptions(options);
        
        // Generate map
        this.status = 'Generating map (this may take a few seconds)...';
        const startTime = performance.now();
        const data = generateMap(Delaunator);
        const generateTime = performance.now() - startTime;
        
        // Render preview (SVG)
        this.status = 'Rendering preview (SVG)...';
        renderPreviewSVG({ 
          width: this.wizardWidth, 
          height: this.wizardHeight,
          container: this.previewContainer 
        });
        
        // Export JSON data
        this.status = 'Exporting data...';
        this.mapData = getMapData();
        
        // Send to Godot via postMessage
        this.status = 'Sending to Godot...';
        this.sendToGodot(this.mapData, data.seed);
        
        // Success
        this.status = `Complete! Generated in ${generateTime.toFixed(0)}ms (seed: ${data.seed})`;
        this.generating = false;
        
        // Log for debugging (remove in production if desired)
        console.log('Azgaar: Map generated successfully', {
          seed: data.seed,
          cells: data.grid.cells.i.length,
          generationTime: `${generateTime.toFixed(0)}ms`,
          jsonSize: JSON.stringify(this.mapData).length
        });
        
      } catch (err) {
        // Error handling
        this.error = err.message || 'Generation failed';
        this.status = 'Error occurred';
        this.generating = false;
        console.error('Azgaar generation error:', err);
        
        // Send error to Godot
        this.sendErrorToGodot(this.error);
      }
    },
    
    /**
     * Send map data to Godot via postMessage
     * Tries multiple postMessage methods for compatibility with different WebView implementations
     */
    sendToGodot(mapData, seed) {
      const message = {
        type: 'azgaar_data',
        payload: mapData
      };
      
      let sent = false;
      
      // Method 1: Standard window.parent.postMessage (most common)
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage(message, '*');
          console.log('Azgaar: Sent message via window.parent.postMessage');
          sent = true;
        } catch (err) {
          console.warn('Azgaar: window.parent.postMessage failed:', err);
        }
      }
      
      // Method 2: window.webkit.messageHandlers (iOS WebView, some implementations)
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.godot) {
        try {
          window.webkit.messageHandlers.godot.postMessage(JSON.stringify(message));
          console.log('Azgaar: Sent message via window.webkit.messageHandlers');
          sent = true;
        } catch (err) {
          console.warn('Azgaar: window.webkit.messageHandlers failed:', err);
        }
      }
      
      // Method 3: window.godot (if exposed by WebView)
      if (window.godot && typeof window.godot.postMessage === 'function') {
        try {
          window.godot.postMessage(message);
          console.log('Azgaar: Sent message via window.godot.postMessage');
          sent = true;
        } catch (err) {
          console.warn('Azgaar: window.godot.postMessage failed:', err);
        }
      }
      
      if (!sent) {
        console.warn('Azgaar: No postMessage method available. Message not sent to Godot.');
        console.log('Azgaar: Message would be:', message);
      }
    },
    
    /**
     * Send error message to Godot
     */
    sendErrorToGodot(errorMessage) {
      const message = {
        type: 'azgaar_error',
        error: errorMessage
      };
      
      // Try same methods as sendToGodot
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.godot) {
        window.webkit.messageHandlers.godot.postMessage(JSON.stringify(message));
      }
      if (window.godot && typeof window.godot.postMessage === 'function') {
        window.godot.postMessage(message);
      }
    },
    
    /**
     * Reset generator state
     * Call this to clear the current map and reset to initial state
     */
    resetGenerator() {
      this.mapData = null;
      this.status = 'Ready to generate';
      this.error = null;
      
      // Clear SVG container
      if (this.previewContainer) {
        this.previewContainer.innerHTML = '';
      }
      
      console.log('Azgaar: Generator reset');
    }
  };
};

// Log that component is loaded (for debugging)
console.log('Azgaar: Alpine.js component loaded (azgaarGenerator)');
