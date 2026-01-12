/**
 * Diagnostic script to analyze SVG rendering data structure
 * Run in browser console after generating a map
 */

function diagnoseSVGRendering() {
  // This should be run in browser console after map generation
  // Access state from the generator module
  
  console.log('=== SVG Rendering Diagnostic ===');
  
  // Check if we can access the generator state
  // Note: This assumes the generator is initialized and has data
  try {
    // In browser, we'd need to access the module's internal state
    // For now, this is a template for manual inspection
    
    console.log('To run this diagnostic:');
    console.log('1. Open browser console on test-svg-seed42.html');
    console.log('2. Generate a map');
    console.log('3. Run: diagnoseSVGRendering()');
    console.log('');
    console.log('Or inspect manually:');
    console.log('- Check cells.v[0] - should be array of numbers (vertex indices)');
    console.log('- Check cells.vCoords[0] - should be array of [x,y] pairs');
    console.log('- Check vertices.c.length - should be > 0');
    console.log('- Check vertices.v.length - should be > 0');
    console.log('- Check vertices.c[0] - should be array of cell indices');
    console.log('- Check vertices.v[0] - should be array of vertex indices');
  } catch (error) {
    console.error('Diagnostic error:', error);
  }
}

// Export for browser use
if (typeof window !== 'undefined') {
  window.diagnoseSVGRendering = diagnoseSVGRendering;
}
