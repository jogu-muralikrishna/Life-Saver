// Root LifeSaver-Care Server Entry Point for Cloud & Container Deployments
// Automatically delegates to the primary Express + Socket.IO server in ./backend/server.js
module.exports = require('./backend/server.js');
