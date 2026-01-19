// main.js
import './config.js';
import './utils.js';
import './auth.js';
import './admin.js';
import './manager.js';
import './employee.js';
import { initTheme, loadNotifications, checkDeadlines } from './features.js';

initTheme();

setInterval(() => {
    if(!document.getElementById('login-view').classList.contains('active-view')) {
        loadNotifications();
    }
}, 60000);

console.log("App Modules Loaded");