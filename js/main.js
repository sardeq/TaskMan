// main.js
import './config.js';
import './utils.js';
import './auth.js';
import './admin.js';
import './manager.js';
import './employee.js';
import { initTheme, loadNotifications } from './features.js'; // Import new features

// Initialize Theme immediately
initTheme();

// Set up an interval to check notifications every 60 seconds
setInterval(() => {
    // Check if logged in first (simplified check)
    if(!document.getElementById('login-view').classList.contains('active-view')) {
        loadNotifications();
    }
}, 60000);

console.log("App Modules Loaded");