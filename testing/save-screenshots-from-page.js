/**
 * Browser-side script to extract and save all map screenshots
 * Run this in the browser console after test-multi-template.html completes
 */

function extractAllMapData() {
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
      
      if (img && img.src) {
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
          imageDataUrl: img.src
        });
      }
    });
  });
  
  return maps;
}

// Function to download a data URL as a file
function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractAllMapData, downloadDataUrl };
}
