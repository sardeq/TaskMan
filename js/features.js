// features.js
import { supabaseClient } from './config.js';
import { openModal, closeModal } from './utils.js';

/* --- THEME SETTINGS --- */
export function initTheme() {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        const toggle = document.getElementById('theme-toggle');
        if(toggle) toggle.checked = true;
    }
}

export function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('app-theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('app-theme', 'dark');
    }
}

/* --- NOTIFICATIONS SYSTEM --- */
export async function loadNotifications() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Fetch notifications
    const { data: notifs, error } = await supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) console.error(error);
    
    renderNotifications(notifs || []);
}

function renderNotifications(notifs) {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    if(!list) return;

    list.innerHTML = '';
    
    // Count unread
    const unreadCount = notifs.filter(n => !n.is_read).length;
    if(badge) {
        badge.innerText = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    if (notifs.length === 0) {
        list.innerHTML = '<li style="padding:20px; text-align:center; color:var(--text-muted)">No notifications</li>';
        return;
    }

    notifs.forEach(n => {
        const item = document.createElement('li');
        item.className = `notif-item ${n.is_read ? '' : 'unread'}`;
        item.innerHTML = `
            <div style="font-weight:600; font-size:0.9rem">${n.title}</div>
            <div style="font-size:0.85rem; color:var(--text-main)">${n.message}</div>
            <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div>
        `;
        item.onclick = () => markAsRead(n.id, item);
        list.appendChild(item);
    });
}

async function markAsRead(id, element) {
    // Optimistic UI update
    element.classList.remove('unread');
    
    await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    
    // Refresh count logic strictly if needed, or just decrement visually
    const badge = document.getElementById('notification-badge');
    if(badge && badge.innerText !== '0') {
        const current = parseInt(badge.innerText);
        badge.innerText = Math.max(0, current - 1);
        if(badge.innerText === '0') badge.style.display = 'none';
    }
}

export async function createNotification(userId, title, message) {
    // Helper to send a notification (used by Admin/Manager)
    await supabaseClient
        .from('notifications')
        .insert([{ user_id: userId, title, message }]);
}

/* --- UI ACTIONS --- */
export function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if(panel) {
        panel.classList.toggle('open');
        if(panel.classList.contains('open')) loadNotifications();
    }
}

/* --- USER SETTINGS --- */
export async function updateOwnProfile() {
    const newName = document.getElementById('settings-name').value;
    const { data: { user } } = await supabaseClient.auth.getUser();

    if(!newName) return alert("Name cannot be empty");

    const { error } = await supabaseClient
        .from('users')
        .update({ full_name: newName })
        .eq('id', user.id);

    if(error) alert("Error: " + error.message);
    else {
        alert("Profile Updated");
        location.reload(); // Simple reload to reflect changes everywhere
    }
}

// Attach to window for HTML access
window.toggleTheme = toggleTheme;
window.toggleNotificationPanel = toggleNotificationPanel;
window.updateOwnProfile = updateOwnProfile;