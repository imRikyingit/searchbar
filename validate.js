const fs = require('fs');

// Validate JSON
function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    return { success: true, file: filePath };
  } catch (err) {
    return { success: false, file: filePath, error: err.message };
  }
}

// Validate JavaScript syntax
function validateJS(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    new Function(content);
    return { success: true, file: filePath };
  } catch (err) {
    return { success: false, file: filePath, error: err.message };
  }
}

const jsonResult = validateJSON('./manifest.json');
const jsResult = validateJS('./src/js/content.js');

console.log('=== VALIDATION RESULTS ===\n');
console.log(`manifest.json: ${jsonResult.success ? '✓ VALID' : '✗ INVALID'}`);
if (!jsonResult.success) console.log(`  Error: ${jsonResult.error}`);

console.log(`\nsrc/js/content.js: ${jsResult.success ? '✓ VALID' : '✗ INVALID'}`);
if (!jsResult.success) console.log(`  Error: ${jsResult.error}`);

// Check for required icon wiring
const contentJs = fs.readFileSync('./src/js/content.js', 'utf8');
const hasGetURL = contentJs.includes('chrome.runtime.getURL("icons/setting.svg")') &&
                  contentJs.includes('chrome.runtime.getURL("icons/add.svg")');
const hasImageMarkup = contentJs.includes('<img') && 
                       contentJs.includes('settingIconUrl') &&
                       contentJs.includes('addIconUrl');

console.log(`\nIcon wiring checks:`);
console.log(`  chrome.runtime.getURL() calls: ${hasGetURL ? '✓' : '✗'}`);
console.log(`  SVG image markup: ${hasImageMarkup ? '✓' : '✗'}`);

process.exit((jsonResult.success && jsResult.success && hasGetURL && hasImageMarkup) ? 0 : 1);
