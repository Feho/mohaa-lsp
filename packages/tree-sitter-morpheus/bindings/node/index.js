const path = require('path');

try {
  module.exports = require('node-gyp-build')(path.join(__dirname, '..', '..'));
} catch (e) {
  // Fallback for development when not built
  module.exports = { name: 'morpheus' };
}
