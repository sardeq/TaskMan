import { supabaseClient } from './config.js';
import { switchView, closeModal } from './utils.js';
import { createNotification, notifyTaskStatusChange } from './features.js';

let managerTasksCache = [];

export async function loadManagerDashboard() {
    switchView('manager');
    switchManagerTab('analytics');
}

export function switchManagerTab(tabName) {
    ['analytics', 'team-tasks', 'my-tasks'].forEach(t => {
        const tabEl = document.getElementById(`manager-${t}-tab`);
        const navEl = document.getElementById(`tab-${t}`);
        if(tabEl) tabEl.classList.add('hidden-tab');
        if(navEl) navEl.classList.remove('active-tab');
    });

    const targetTab = document.getElementById(`manager-${tabName}-tab`);
    const targetNav = document.getElementById(`tab-${tabName}`);
    
    if(targetTab) targetTab.classList.remove('hidden-tab');
    if(targetNav) targetNav.classList.add('active-tab');

    if (tabName === 'analytics') loadManagerAnalytics();
    if (tabName === 'team-tasks') loadManagerTeamTasks();
    if (tabName === 'my-tasks') loadManagerPersonalTasks();
}

/* --- ANALYTICS TAB --- */

export async function loadManagerAnalytics() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Fetch tasks related to this manager's team for better analytics
    // First get team ID
    const { data: mgrData } = await supabaseClient.from('users').select('team_id').eq('id', user.id).single();
    
    let query = supabaseClient.from('tasks').select(`*, task_statuses(name), task_assignments!inner(users!inner(team_id))`);
    
    // If manager has a team, filter by it. If not, showing all might be confusing, but we'll stick to team data.
    if(mgrData && mgrData.team_id) {
        query = query.eq('task_assignments.users.team_id', mgrData.team_id);
    }

    const { data: tasks, error } = await query;

    if (error) { console.error(error); return; }

    // Metrics
    const total = tasks.length;
    const completed = tasks.filter(t => t.task_statuses.name === 'Completed').length;
    const pending = tasks.filter(t => t.task_statuses.name === 'Pending').length;
    const progress = tasks.filter(t => t.task_statuses.name === 'In Progress').length;
    
    document.getElementById('manager-stat-completed').innerText = completed;
    document.getElementById('manager-stat-pending').innerText = pending;
    
    const efficiency = total === 0 ? 0 : Math.round((completed / total) * 100);
    document.getElementById('manager-efficiency-text').innerText = `${efficiency}%`;
    const bar = document.getElementById('manager-efficiency-bar');
    if(bar) bar.style.width = `${efficiency}%`;

    renderManagerCharts(completed, pending, progress, tasks);
}

function renderManagerCharts(completed, pending, progress, tasks) {
    if(typeof Chart === 'undefined') return;

    // 1. PIE CHART
    const ctxPie = document.getElementById('managerPieChart').getContext('2d');
    if (window.mgrPie) window.mgrPie.destroy();

    window.mgrPie = new Chart(ctxPie, {
        type: 'doughnut', // Changed to doughnut for cleaner look
        data: {
            labels: ['Completed', 'Pending', 'In Progress'],
            datasets: [{
                data: [completed, pending, progress],
                backgroundColor: ['#10b981', '#f59e0b', '#3b82f6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Vital for fitting the container
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // 2. BAR CHART (New)
    const ctxBar = document.getElementById('managerBarChart').getContext('2d');
    if (window.mgrBar) window.mgrBar.destroy();

    // Calculate generic workload (mock logic: distribution by priority)
    const high = tasks.filter(t => t.priority_id === 3).length;
    const med = tasks.filter(t => t.priority_id === 2).length;
    const low = tasks.filter(t => t.priority_id === 1).length;

    window.mgrBar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['High Priority', 'Medium Priority', 'Low Priority'],
            datasets: [{
                label: 'Task Count',
                data: [high, med, low],
                backgroundColor: ['#ef4444', '#f97316', '#94a3b8'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { display: false } } },
            plugins: { legend: { display: false } }
        }
    });
}

/* --- TEAM TASKS TAB --- */

export async function loadManagerTeamTasks() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { data: managerProfile } = await supabaseClient
        .from('users').select('team_id').eq('id', user.id).single();

    if (!managerProfile || !managerProfile.team_id) {
        document.getElementById('manager-task-rows').innerHTML = '<p class="empty-state">You are not assigned to a team.</p>';
        return;
    }

    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select(`
            *,
            task_statuses(name),
            task_priorities(name),
            task_assignments!inner(users!inner(full_name, team_id))
        `)
        .eq('task_assignments.users.team_id', managerProfile.team_id)
        .order('created_at', { ascending: false });

    if (error) { console.error("Manager Task Error:", error); return; }
    
    managerTasksCache = tasks || [];
    renderTeamTasksList(managerTasksCache);
}

function renderTeamTasksList(tasks) {
    const container = document.getElementById('manager-task-rows');
    container.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clipboard-check"></i>
                <p>No active tasks found for your team.</p>
            </div>`;
        return;
    }

    tasks.forEach(task => {
        const status = task.task_statuses.name;
        const assignees = task.task_assignments.map(a => a.users.full_name).join(', ');
        const date = new Date(task.deadline).toLocaleDateString();
        const priority = task.task_priorities?.name || 'Normal';
        const priorityClass = priority === 'High' ? 'text-danger' : 'text-muted';

        let progressPercent = 0;
        let color = '#e2e8f0';
        if(status === 'Pending') { progressPercent = 5; color = '#f59e0b'; }
        if(status === 'In Progress') { progressPercent = 50; color = '#3b82f6'; }
        if(status === 'Completed') { progressPercent = 100; color = '#10b981'; }

        container.innerHTML += `
            <div class="task-row-card" style="border-left-color: ${color}">
                <div class="task-row-info">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4 style="margin:0;">${task.title}</h4>
                        <span class="badge ${getStatusClass(status)}">${status}</span>
                    </div>
                    <div class="progress-track" style="margin-top:8px;">
                        <div class="progress-fill" style="width: ${progressPercent}%; background: ${color}"></div>
                    </div>
                </div>
                <div class="task-row-meta">
                    <div><i class="fa-solid fa-users"></i> ${assignees}</div>
                    <div><i class="fa-solid fa-calendar"></i> ${date}</div>
                    <div class="${priorityClass}"><i class="fa-solid fa-flag"></i> ${priority}</div>
                </div>
                <div style="margin-left: 20px; display:flex; gap: 5px;">
                     <button class="btn-secondary btn-sm" onclick="openTaskDetails('${task.id}')">View</button>
                     <button class="btn-secondary btn-sm" onclick="enableEditTask('${task.id}')"><i class="fa-solid fa-pen"></i></button>
                     <button class="btn-danger btn-sm" onclick="deleteTask('${task.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

function getStatusClass(status) {
    switch(status) {
        case 'Completed': return 'status-completed';
        case 'In Progress': return 'status-medium';
        default: return 'status-pending';
    }
}

/* --- MY TASKS TAB (Personal) --- */

export async function loadManagerPersonalTasks() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    const { data: assignments } = await supabaseClient
        .from('task_assignments')
        .select(`task:tasks (*, task_priorities(name), task_statuses(name))`)
        .eq('employee_id', user.id);

    // Clear Columns
    ['pending', 'progress', 'completed'].forEach(c => {
        const el = document.getElementById(`mgr-col-${c}`);
        if(el) el.innerHTML = '';
    });

    if(!assignments) return;

    const tasks = assignments.map(a => a.task);

    tasks.forEach(task => {
        const status = task.task_statuses.name;
        let colId = '';
        if(status === 'Pending') colId = 'mgr-col-pending';
        else if(status === 'In Progress') colId = 'mgr-col-progress';
        else colId = 'mgr-col-completed';

        const col = document.getElementById(colId);
        if(col) col.innerHTML += renderPersonalTaskCard(task); 
    });
}

function renderPersonalTaskCard(task) {
    const status = task.task_statuses.name;
    let actionBtn = '';
    // Uses updateManagerTaskStatus to avoid dependency on employee.js
    if(status === 'Pending') {
        actionBtn = `<button class="btn-card-secondary" onclick="updateManagerTaskStatus('${task.id}', 2)">Start</button>`;
    } else if (status === 'In Progress') {
        actionBtn = `<button class="btn-card-secondary" onclick="updateManagerTaskStatus('${task.id}', 3)">Mark Done</button>`;
    } else {
        actionBtn = `<button class="btn-card-secondary" style="background:var(--success); cursor:default;">Done</button>`;
    }

    return `
        <div class="task-card-modern">
            <span class="card-tag">PRIORITY: ${task.task_priorities.name}</span>
            <h4 class="card-title">${task.title}</h4>
            <div class="card-actions">
                <button class="btn-card-primary" onclick="openTaskDetails('${task.id}')">View</button>
                ${actionBtn}
            </div>
        </div>
    `;
}

export async function updateManagerTaskStatus(taskId, newStatusId) {
    const { error } = await supabaseClient
        .from('tasks')
        .update({ status_id: parseInt(newStatusId) })
        .eq('id', taskId);

    if (error) {
        alert("Error updating: " + error.message);
    } else {
        if (parseInt(newStatusId) === 2) {
            await notifyTaskStatusChange(taskId, "In Progress");
        }
        
        loadManagerPersonalTasks(); 
        loadManagerAnalytics(); 
    }
}
export async function deleteTask(taskId) {
    if(!confirm("Are you sure? This will remove the task for everyone.")) return;
    const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
    if(error) alert(error.message);
    else loadManagerTeamTasks(); 
}

/* --- EXPORTS --- */
window.loadManagerDashboard = loadManagerDashboard;
window.switchManagerTab = switchManagerTab;
window.renderTeamTasksList = renderTeamTasksList;
window.deleteTask = deleteTask;
window.updateManagerTaskStatus = updateManagerTaskStatus;