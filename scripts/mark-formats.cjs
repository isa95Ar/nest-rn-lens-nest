// Each build folder gets its own package.json so Node (and TypeScript) read
// dist/esm as ES modules and dist/cjs as CommonJS.
const { writeFileSync } = require('node:fs');

writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
