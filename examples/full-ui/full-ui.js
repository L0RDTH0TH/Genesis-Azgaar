/**
 * Full UI Port - Step 1: Core Structure
 * Main application script for the Azgaar Genesis Full UI port
 */

// Import Delaunator (peer dependency)
import Delaunator from 'delaunator';

// Import the library (bundled version)
import {
  initGenerator,
  loadOptions,
  generateMap,
  renderPreviewSVG,
  getDefaultRenderConfig,
  getOriginalRenderConfig,
  mergeRenderConfig
} from '../../dist/azgaar-genesis.esm.js';

// Import UI modules
import { initializeLayers } from './ui/layers.js';
import { initializeStyles } from './ui/styles.js';

// Global state
let currentData = null;
let currentRenderConfig = null;
let mapContainer = null;

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  if (!status) return;
  
  status.textContent = message;
  status.className = type;
  status.classList.add('show');
  
  if (type !== 'error') {
    setTimeout(() => {
      status.classList.remove('show');
    }, 3000);
  }
}

/**
 * Initialize the application
 */
async function initialize() {
  try {
    showStatus('Initializing...', 'info');
    
    // Get map container
    mapContainer = document.getElementById('map');
    if (!mapContainer) {
      throw new Error('Map container (#map) not found');
    }
    
    // Initialize generator with container
    initGenerator({ container: mapContainer });
    
    // Initialize UI modules
    await initializeLayers(handleLayerChange, handleRender);
    await initializeStyles(handleStyleChange, handleRender);
    
    // Set up tab switching
    setupTabs();
    
    // Set up basic controls
    setupControls();
    
    // Generate initial map
    await generateInitialMap();
    
    showStatus('Ready!', 'success');
  } catch (error) {
    console.error('Initialization error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

/**
 * Generate initial map with seed 42
 */
async function generateInitialMap() {
  try {
    showStatus('Generating map...', 'info');
    
    // Load options with seed 42
    loadOptions({
      seed: '42',
      mapWidth: 1200,
      mapHeight: 800,
      cellsDesired: 10000,
      statesNumber: 18,
      cultures: 12,
      fullRendering: true,
    });
    
    // Generate map
    const startTime = performance.now();
    currentData = generateMap(Delaunator);
    const genTime = performance.now() - startTime;
    console.log(`Map generated in ${genTime.toFixed(2)}ms`, {
      seed: currentData.seed,
      cells: currentData.pack?.cells?.i?.length
    });
    
    // Get default render config
    currentRenderConfig = getDefaultRenderConfig();
    
    // Render map
    await handleRender();
    
    showStatus(`Map generated (${genTime.toFixed(2)}ms)`, 'success');
  } catch (error) {
    console.error('Generation error:', error);
    showStatus(`Generation error: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Handle render request
 */
async function handleRender() {
  if (!currentData) {
    console.warn('No map data available for rendering');
    return;
  }
  
  try {
    // Render with current render config
    renderPreviewSVG({
      width: 1200,
      height: 800,
      container: mapContainer,
      renderConfig: currentRenderConfig
    });
    
    // Reset zoom (fit viewBox)
    resetZoom();
  } catch (error) {
    console.error('Rendering error:', error);
    showStatus(`Rendering error: ${error.message}`, 'error');
  }
}

/**
 * Handle layer changes
 */
function handleLayerChange(renderConfig) {
  currentRenderConfig = renderConfig;
  handleRender();
}

/**
 * Handle style changes
 */
function handleStyleChange(renderConfig) {
  currentRenderConfig = renderConfig;
  handleRender();
}

/**
 * Set up tab switching
 */
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tabcontent');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const content = document.getElementById(targetTab);
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

/**
 * Set up basic controls
 */
function setupControls() {
  // New Map button
  const newMapBtn = document.getElementById('newMapBtn');
  if (newMapBtn) {
    newMapBtn.addEventListener('click', async () => {
      try {
        showStatus('Generating new map...', 'info');
        
        // Generate random seed
        const randomSeed = String(Math.floor(Math.random() * 1000000));
        
        // Load options with random seed
        loadOptions({
          seed: randomSeed,
          mapWidth: 1200,
          mapHeight: 800,
          cellsDesired: 10000,
          statesNumber: 18,
          cultures: 12,
          fullRendering: true,
        });
        
        // Generate map
        const startTime = performance.now();
        currentData = generateMap(Delaunator);
        const genTime = performance.now() - startTime;
        
        // Reset to default render config
        currentRenderConfig = getDefaultRenderConfig();
        
        // Re-initialize layers with default preset
        if (window.layersModule) {
          window.layersModule.resetToDefault();
        }
        
        // Render map
        await handleRender();
        
        showStatus(`New map generated with seed ${randomSeed} (${genTime.toFixed(2)}ms)`, 'success');
      } catch (error) {
        console.error('New map generation error:', error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    });
  }
  
  // Reset Zoom button
  const resetZoomBtn = document.getElementById('resetZoomBtn');
  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', () => {
      resetZoom();
    });
  }
}

/**
 * Reset zoom to fit viewBox
 */
function resetZoom() {
  if (!mapContainer) return;
  
  const svg = mapContainer.querySelector('svg');
  if (!svg) return;
  
  // Get viewBox or calculate from SVG dimensions
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const [x, y, width, height] = viewBox.split(' ').map(Number);
    
    // Set viewBox to fit container
    const containerWidth = mapContainer.clientWidth;
    const containerHeight = mapContainer.clientHeight;
    
    // Calculate aspect ratios
    const mapAspect = width / height;
    const containerAspect = containerWidth / containerHeight;
    
    let newViewBox;
    if (containerAspect > mapAspect) {
      // Container is wider - fit to height
      const newWidth = height * containerAspect;
      const offsetX = (width - newWidth) / 2;
      newViewBox = `${x + offsetX} ${y} ${newWidth} ${height}`;
    } else {
      // Container is taller - fit to width
      const newHeight = width / containerAspect;
      const offsetY = (height - newHeight) / 2;
      newViewBox = `${x} ${y + offsetY} ${width} ${newHeight}`;
    }
    
    svg.setAttribute('viewBox', newViewBox);
  } else {
    // No viewBox - set it from width/height
    const width = parseFloat(svg.getAttribute('width')) || 1200;
    const height = parseFloat(svg.getAttribute('height')) || 800;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
}

/**
 * Export render config for UI modules
 */
window.getCurrentRenderConfig = () => {
  return currentRenderConfig ? mergeRenderConfig(currentRenderConfig) : getDefaultRenderConfig();
};

window.setCurrentRenderConfig = (config) => {
  currentRenderConfig = mergeRenderConfig(config);
};

window.getCurrentData = () => {
  return currentData;
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
