// js/employee.js
import { supabaseClient } from './config.js';
import { switchView, closeModal } from './utils.js';

let currentOpenTaskId = null; // Track which task is currently open in the modal

export async function loadEmployeeDashboard(userId) {
    switchView('employee');

    // 1. Get User Profile for Sidebar
    const { data: user } = await supabaseClient
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single();
    
    if(user) {
        document.getElementById('emp-name').innerText = user.full_name;
        // simplistic initials extraction
        document.getElementById('emp-initials').innerText = user.full_name.substring(0,2).toUpperCase();
    }

    // 2. Fetch Assigned Tasks with Relations
    const { data: assignments, error } = await supabaseClient
        .from('task_assignments')
        .select(`
            task:tasks (
                id, title, description, deadline, priority_id, status_id,
                task_priorities(name),
                task_statuses(name)
            )
        `)
        .eq('employee_id', userId);

    if (error) { console.error(error); return; }

    // Flatten data structure
    const tasks = assignments.map(a => a.task);
    
    // 3. Calculate Stats
    calculateEmployeeStats(tasks);

    // 4. Render Columns
    const cols = {
        'Pending': document.getElementById('col-pending'),
        'In Progress': document.getElementById('col-progress'),
        'Completed': document.getElementById('col-completed')
    };
    
    // Clear columns
    Object.values(cols).forEach(col => { if(col) col.innerHTML = ''; });

    tasks.forEach(task => {
        const statusName = task.task_statuses.name;
        const targetCol = statusName === 'Pending' ? cols['Pending'] 
                        : statusName === 'In Progress' ? cols['In Progress'] 
                        : cols['Completed'];
        
        if (targetCol) {
            targetCol.innerHTML += renderTaskCard(task);
        }
    });
}

function calculateEmployeeStats(tasks) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.task_statuses.name === 'Completed').length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    const countEl = document.getElementById('emp-total-count');
    if(countEl) countEl.innerText = `Completed: ${completed}`;
    
    const textEl = document.getElementById('efficiency-text');
    if(textEl) textEl.innerText = `${percentage}%`;

    const gauge = document.getElementById('efficiency-gauge');
    if(gauge) {
        const gradientStop = (percentage / 100) * 100; 
        gauge.style.background = `conic-gradient(var(--warning) 0% ${gradientStop}%, transparent ${gradientStop}% 100%)`;
    }

    // Schedule: Show upcoming deadlines
    const list = document.getElementById('schedule-list');
    if(!list) return;

    list.innerHTML = '';
    
    // Sort by date and take top 3
    const upcoming = tasks
        .filter(t => t.task_statuses.name !== 'Completed')
        .sort((a,b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 3);

    if(upcoming.length === 0) {
        list.innerHTML = '<p style="color:#94a3b8; font-size:0.8rem;">No upcoming deadlines.</p>';
    } else {
        upcoming.forEach(t => {
            const time = new Date(t.deadline).toLocaleDateString(undefined, {month:'short', day:'numeric'});
            list.innerHTML += `
                <div class="schedule-item">
                    <div class="time-pill">${time}</div>
                    <span style="font-size: 0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width: 120px;">
                        ${t.title}
                    </span>
                </div>
            `;
        });
    }
}

function renderTaskCard(task) {
    const status = task.task_statuses.name;
    
    // Determine button text based on status
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


export async function openTaskDetails(taskId) {
    currentOpenTaskId = taskId;
    const modal = document.getElementById('modal-task-details');
    if(modal) modal.classList.remove('hidden-view');
    
    // 1. Fetch Task Details
    const { data: task } = await supabaseClient
        .from('tasks')
        .select(`*, task_priorities(name), task_statuses(name), task_assignments(users(full_name))`)
        .eq('id', taskId)
        .single();

    if(!task) return;

    // 2. Fetch Comments
    fetchTaskComments(taskId);

    // 3. Populate Modal
    document.getElementById('modal-task-title').innerText = `TASK-${task.id.substring(0,4)}: ${task.title}`;
    document.getElementById('modal-task-desc').innerText = task.description || "No description provided.";
    document.getElementById('modal-task-deadline').innerText = new Date(task.deadline).toDateString();
    
    // Handle Assignee Display
    const assignees = task.task_assignments.map(a => a.users.full_name).join(", ");
    document.getElementById('modal-task-assignee').innerText = assignees || "Unassigned";

    // Priority Flag
    const pFlag = document.getElementById('modal-priority-flag');
    if(pFlag) {
        pFlag.innerHTML = `<i class="fa-solid fa-flag"></i> ${task.task_priorities.name} Priority`;
        pFlag.className = `priority-flag ${task.task_priorities.name.toLowerCase() === 'high' ? 'text-danger' : ''}`;
    }

    // Action Buttons
    const btnContainer = document.getElementById('modal-action-buttons');
    const status = task.task_statuses.name;
    
    if(btnContainer) {
        if(status === 'Pending') {
            btnContainer.innerHTML = `<button class="btn-block btn-primary" onclick="updateTaskStatus('${task.id}', 2)">Start Task</button>`;
        } else if (status === 'In Progress') {
            btnContainer.innerHTML = `<button class="btn-block btn-success" style="background:var(--success)" onclick="updateTaskStatus('${task.id}', 3)">Mark Completed</button>`;
        } else {
            btnContainer.innerHTML = `<button class="btn-block btn-secondary" disabled>Task is Done</button>`;
        }
    }
}

export async function enableEditTask(taskId) {
    // 1. Open the details modal first to get data
    await openTaskDetails(taskId);

    // 2. Transform the Modal into "Edit Mode"
    const titleEl = document.getElementById('modal-task-title');
    const descEl = document.getElementById('modal-task-desc');
    const btnContainer = document.getElementById('modal-action-buttons');

    // Remove the "TASK-" prefix for editing
    const currentTitle = titleEl.innerText.split(': ')[1] || titleEl.innerText;
    const currentDesc = descEl.innerText;

    titleEl.innerHTML = `<input type="text" id="edit-task-title" class="form-input" value="${currentTitle}" />`;
    descEl.innerHTML = `<textarea id="edit-task-desc" class="form-input" rows="4">${currentDesc}</textarea>`;

    // Add Save Button
    btnContainer.innerHTML = `
        <button class="btn-block btn-primary" onclick="saveTaskChanges('${taskId}')">
            <i class="fa-solid fa-save"></i> Save Changes
        </button>
        <button class="btn-block btn-secondary" onclick="openTaskDetails('${taskId}')">
            Cancel
        </button>
    `;
}

export async function saveTaskChanges(taskId) {
    const newTitle = document.getElementById('edit-task-title').value;
    const newDesc = document.getElementById('edit-task-desc').value;

    const { error } = await supabaseClient
        .from('tasks')
        .update({ title: newTitle, description: newDesc })
        .eq('id', taskId)
        .select(); // <--- CRITICAL FIX

    if (error) {
        alert("Error updating task: " + error.message);
    } else {
        alert("Task updated successfully");
        openTaskDetails(taskId);
        
        // Refresh the lists in the background
        if(window.loadManagerTeamTasks) window.loadManagerTeamTasks();
        if(window.fetchAdminTasks) window.fetchAdminTasks();
    }
}

// Expose to window
window.enableEditTask = enableEditTask;
window.saveTaskChanges = saveTaskChanges;

export async function fetchTaskComments(taskId) {
    const list = document.getElementById('modal-comments-list');
    list.innerHTML = 'Loading...';

    const { data: comments } = await supabaseClient
        .from('comments')
        .select(`content, created_at, users(full_name)`)
        .eq('task_id', taskId)
        .order('created_at', {ascending: true});

    list.innerHTML = '';
    if(!comments || comments.length === 0) {
        list.innerHTML = '<i style="color:#cbd5e1">No comments yet.</i>';
        return;
    }

    comments.forEach(c => {
        list.innerHTML += `
            <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px;">
                <strong>${c.users.full_name}:</strong> ${c.content}
            </div>
        `;
    });
}

export async function submitComment() {
    const content = document.getElementById('new-comment-text').value;
    if(!content || !currentOpenTaskId) return;

    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient
        .from('comments')
        .insert([{
            task_id: currentOpenTaskId,
            author_id: user.id,
            content: content
        }]);

    if(error) alert(error.message);
    else {
        document.getElementById('new-comment-text').value = '';
        fetchTaskComments(currentOpenTaskId); 
    }
}

export async function updateTaskStatus(taskId, newStatusId) {
    const { error } = await supabaseClient
        .from('tasks')
        .update({ status_id: parseInt(newStatusId) })
        .eq('id', taskId);

    if (error) {
        alert("Error updating: " + error.message);
    } else {
        closeModal('task-details');
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        loadEmployeeDashboard(user.id);
    }
}

window.loadEmployeeDashboard = loadEmployeeDashboard;
window.openTaskDetails = openTaskDetails;
window.submitComment = submitComment;
window.updateTaskStatus = updateTaskStatus;