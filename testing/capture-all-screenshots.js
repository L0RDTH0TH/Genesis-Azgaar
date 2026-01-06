/**
 * Script to capture all map screenshots from the test page
 * This would be run in browser console or via automation
 */

// Extract all map data and prepare for screenshot capture
function getAllMaps() {
  const maps = [];
  const results = document.getElementById('results');
  const sections = results.querySelectorAll('.template-section');
  
  sections.forEach(section => {
    const template = section.querySelector('h2').textContent.replace('Template: ', '').replace(/\s+/g, '_');
    const seedResults = section.querySelectorAll('.seed-result');
    
    seedResults.forEach(sr => {
      const seedTitle = sr.querySelector('h3').textContent.replace('Seed ', '');
      const seed = parseInt(seedTitle);
      const img = sr.querySelector('img');
      
      if (img) {
        const metrics = Array.from(sr.querySelectorAll('.metric'));
        const diags = {};
        metrics.forEach(m => {
          const strong = m.querySelector('strong');
          if (strong) {
            const key = strong.textContent.replace(':', '').trim();
            const value = m.textContent.replace(strong.textContent + ':', '').trim();
            diags[key] = value;
          }
        });
        
        maps.push({
          template,
          seed,
          filename: `${template}_${seed}.png`,
          diagnostics: diags,
          imgElement: img
        });
      }
    });
  });
  
  return maps;
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getAllMaps };
}
