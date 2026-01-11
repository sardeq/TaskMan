// js/manager.js
import { supabaseClient } from './config.js';
import { switchView } from './utils.js';
// REMOVED: import { renderTaskCard } from './employee.js';  <-- This was causing the crash

let managerTasksCache = [];

export async function loadManagerDashboard() {
    switchView('manager');
    // Default to Analytics tab
    switchManagerTab('analytics');
}

export function switchManagerTab(tabName) {
    // Hide all tabs
    ['analytics', 'team-tasks', 'my-tasks'].forEach(t => {
        const tabEl = document.getElementById(`manager-${t}-tab`);
        const navEl = document.getElementById(`tab-${t}`);
        if(tabEl) tabEl.classList.add('hidden-tab');
        if(navEl) navEl.classList.remove('active-tab');
    });

    // Show selected
    const targetTab = document.getElementById(`manager-${tabName}-tab`);
    const targetNav = document.getElementById(`tab-${tabName}`);
    
    if(targetTab) targetTab.classList.remove('hidden-tab');
    if(targetNav) targetNav.classList.add('active-tab');

    // Load Data
    if (tabName === 'analytics') loadManagerAnalytics();
    if (tabName === 'team-tasks') loadManagerTeamTasks();
    if (tabName === 'my-tasks') loadManagerPersonalTasks();
}

/* --- ANALYTICS TAB --- */

export async function loadManagerAnalytics() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select(`*, task_statuses(name)`);

    if (error) { console.error(error); return; }

    // Metrics Calculation
    const total = tasks.length;
    const completed = tasks.filter(t => t.task_statuses.name === 'Completed').length;
    const pending = tasks.filter(t => t.task_statuses.name === 'Pending').length;
    const progress = tasks.filter(t => t.task_statuses.name === 'In Progress').length;
    
    document.getElementById('manager-stat-completed').innerText = completed;
    document.getElementById('manager-stat-pending').innerText = pending;
    
    // Update Efficiency Gauge
    const efficiency = total === 0 ? 0 : Math.round((completed / total) * 100);
    document.getElementById('manager-efficiency-text').innerText = `${efficiency}%`;
    const bar = document.getElementById('manager-efficiency-bar');
    if(bar) {
        bar.style.width = `${efficiency}%`;
    }

    // Render Charts
    renderManagerCharts(completed, pending, progress, tasks);
}

function renderManagerCharts(completed, pending, progress, tasks) {
    if(typeof Chart === 'undefined') return;

    // Pie Chart: Task Distribution
    const ctxPie = document.getElementById('managerPieChart').getContext('2d');
    
    if (window.mgrPie) window.mgrPie.destroy();

    window.mgrPie = new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: ['Completed', 'Pending', 'In Progress'],
            datasets: [{
                data: [completed, pending, progress],
                backgroundColor: ['#10b981', '#f59e0b', '#3b82f6']
            }]
        }
    });

    // Bar Chart: Weekly Activity
    const ctxBar = document.getElementById('managerBarChart').getContext('2d');
    if (window.mgrBar) window.mgrBar.destroy();

    window.mgrBar = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            datasets: [{
                label: 'Tasks Created',
                data: [4, 6, 2, 8, 5], // Mock data or replace with real aggregation
                backgroundColor: '#1e293b'
            }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });
}

export async function loadManagerTeamTasks() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // 1. Get the Manager's Team ID
    const { data: managerProfile } = await supabaseClient
        .from('users')
        .select('team_id')
        .eq('id', user.id)
        .single();

    if (!managerProfile || !managerProfile.team_id) {
        document.getElementById('manager-task-rows').innerHTML = '<p class="empty-state">You are not assigned to a team.</p>';
        return;
    }

    // 2. Fetch tasks assigned to ANYONE in this team
    // We join task_assignments -> users -> filter by team_id
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select(`
            *,
            task_statuses(name),
            task_priorities(name),
            task_assignments!inner(
                users!inner(full_name, team_id)
            )
        `)
        .eq('task_assignments.users.team_id', managerProfile.team_id);

    if (error) { 
        console.error("Manager Task Error:", error); 
        return; 
    }

    renderTeamTasksList(tasks || []);
}

function renderTeamTasksList(tasks) {
    const container = document.getElementById('manager-task-rows');
    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clipboard-check"></i>
                <p>No active tasks found for your team.</p>
            </div>`;
        return;
    }

    tasks.forEach(task => {
        const status = task.task_statuses.name;
        // Collect all assignees
        const assignees = task.task_assignments.map(a => a.users.full_name).join(', ');
        
        const date = new Date(task.deadline).toLocaleDateString();
        const priority = task.task_priorities?.name || 'Medium';
        const priorityClass = priority.toLowerCase() === 'high' ? 'text-danger' : 'text-muted';

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

// Helper needed for badge style
function getStatusClass(status) {
    switch(status) {
        case 'Completed': return 'status-completed';
        case 'In Progress': return 'status-medium';
        default: return 'status-pending';
    }
}

export async function loadTeamFilter() {
    const { data: teams } = await supabaseClient.from('teams').select('id, name');
    const list = document.getElementById('manager-team-filter-list');
    list.innerHTML = `<li onclick="resetTeamFilter()">All Teams</li>`;
    
    if(teams) {
        teams.forEach(t => {
            list.innerHTML += `<li onclick="filterTasksByTeam('${t.id}')">${t.name}</li>`;
        });
    }
}

export function filterTasksByTeam(teamId) {
    const filtered = managerTasksCache.filter(t => t.creator?.teams?.id === teamId);
    renderTeamTasksList(filtered);
}

/* --- MY TASKS TAB (Personal) --- */

export async function loadManagerPersonalTasks() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    const { data: assignments } = await supabaseClient
        .from('task_assignments')
        .select(`task:tasks (*, task_priorities(name), task_statuses(name))`)
        .eq('employee_id', user.id);

    const tasks = assignments.map(a => a.task);

    // Clear manager-specific columns
    ['pending', 'progress', 'completed'].forEach(c => {
        const el = document.getElementById(`mgr-col-${c}`);
        if(el) el.innerHTML = '';
    });

    tasks.forEach(task => {
        const status = task.task_statuses.name;
        let colId = '';
        if(status === 'Pending') colId = 'mgr-col-pending';
        else if(status === 'In Progress') colId = 'mgr-col-progress';
        else colId = 'mgr-col-completed';

        const col = document.getElementById(colId);
        if(col) col.innerHTML += renderTaskCard(task); 
    });
}

export async function deleteTask(taskId) {
    if(!confirm("Are you sure? This will remove the task for everyone.")) return;
    const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
    if(error) alert(error.message);
    else loadManagerTeamTasks(); 
}

// Helper: Self-contained render function for Manager personal tasks
function renderTaskCard(task) {
    const status = task.task_statuses.name;
    let actionBtn = '';
    if(status === 'Pending') {
        actionBtn = `<button class="btn-card-secondary" onclick="updateTaskStatus('${task.id}', 2)">Assign / Start</button>`;
    } else if (status === 'In Progress') {
        actionBtn = `<button class="btn-card-secondary" onclick="updateTaskStatus('${task.id}', 3)">Mark Done</button>`;
    } else {
        actionBtn = `<button class="btn-card-secondary" style="background:var(--success); cursor:default;">Completed</button>`;
    }

    return `
        <div class="task-card-modern">
            <span class="card-tag">MAIN TASK</span>
            <h4 class="card-title">${task.title}</h4>
            <div class="card-actions">
                <button class="btn-card-primary" onclick="openTaskDetails('${task.id}')">View Details</button>
                ${actionBtn}
            </div>
        </div>
    `;
}

export function resetTeamFilter() {
    renderTeamTasksList(managerTasksCache);
}

// Window Assignments
window.loadManagerDashboard = loadManagerDashboard;
window.switchManagerTab = switchManagerTab;
window.renderTeamTasksList = renderTeamTasksList;
window.filterTasksByTeam = filterTasksByTeam;
window.deleteTask = deleteTask;
window.resetTeamFilter = resetTeamFilter;