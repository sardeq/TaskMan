import { supabaseClient } from './config.js';
import { openModal, closeModal } from './utils.js';

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

export async function loadNotifications() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

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
    const badgeMgr = document.getElementById('notification-badge-mgr');
    const badgeEmp = document.getElementById('notification-badge-emp');

    if(!list) return;

    list.innerHTML = '';
    
    const unreadCount = notifs.filter(n => !n.is_read).length;
    
    [badge, badgeMgr, badgeEmp].forEach(b => {
        if(b) {
            b.innerText = unreadCount;
            b.style.display = unreadCount > 0 ? 'block' : 'none';
        }
    });

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
    element.classList.remove('unread');
    
    await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    
    const badge = document.getElementById('notification-badge');
    if(badge && badge.innerText !== '0') {
        const current = parseInt(badge.innerText);
        badge.innerText = Math.max(0, current - 1);
        if(badge.innerText === '0') badge.style.display = 'none';
    }
}

export async function createNotification(userId, title, message) {
    await supabaseClient
        .from('notifications')
        .insert([{ user_id: userId, title, message }]);
}

export function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if(panel) {
        panel.classList.toggle('open');
        if(panel.classList.contains('open')) loadNotifications();
    }
}

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
        location.reload(); 
    }
}

export async function checkDeadlines() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Get user's incomplete tasks
    const { data: assignments } = await supabaseClient
        .from('task_assignments')
        .select(`
            task:tasks (
                id, title, deadline, status_id, task_statuses(name)
            )
        `)
        .eq('employee_id', user.id);

    if (!assignments) return;

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);

    for (const item of assignments) {
        const task = item.task;
        
        if (task.task_statuses.name === 'Completed') continue;

        const deadline = new Date(task.deadline);

        if (deadline > now && deadline <= tomorrow) {
            
            const { data: existing } = await supabaseClient
                .from('notifications')
                .select('id')
                .eq('user_id', user.id)
                .eq('title', 'Upcoming Deadline')
                .ilike('message', `%${task.title}%`)
                .gt('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

            if (!existing || existing.length === 0) {
                await createNotification(
                    user.id, 
                    "Upcoming Deadline", 
                    `Task "${task.title}" is due in less than 24 hours.`
                );
            }
        }
    }
}

export async function notifyTaskStatusChange(taskId, newStatusName) {
    const { data: assignments } = await supabaseClient
        .from('task_assignments')
        .select('employee_id, task:tasks(title)')
        .eq('task_id', taskId);

    if(!assignments) return;

    for (const a of assignments) {
        await createNotification(
            a.employee_id,
            "Task Update",
            `Task "${a.task.title}" is now ${newStatusName}.`
        );
    }
}

// Attach to window for HTML access
window.toggleTheme = toggleTheme;
window.toggleNotificationPanel = toggleNotificationPanel;
window.updateOwnProfile = updateOwnProfile;