const fs = require('fs');
const results = JSON.parse(fs.readFileSync('scratch/audit_results.json', 'utf8'));

const filtered = results.map(fileObj => {
  const issues = fileObj.issues.filter(i => {
    const c = i.content.toLowerCase();
    
    // Ignore HTML placeholder attributes
    if (c.includes('placeholder=') || c.includes('placeholder:')) return false;
    
    // Ignore valid error logging
    if (c.includes('console.error(') || c.includes('console.warn(') || c.includes('console.log(')) return false;
    
    // Ignore config fallbacks
    if (c.includes("|| 'localhost'") || c.includes("|| 'http://localhost")) return false;
    
    // Ignore security checks
    if (c.includes("includes('dummy')") || c.includes("includes('placeholder')")) return false;

    // Ignore AI service mock fallback logs
    if (c.includes("mocking ") || c.includes("mock embedding") || c.includes("mock mode")) return false;

    return true;
  });

  return { file: fileObj.file, issues };
}).filter(fileObj => fileObj.issues.length > 0);

console.log(JSON.stringify(filtered, null, 2));
