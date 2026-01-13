import { supabaseClient } from './config.js';
import { closeModal, switchView } from './utils.js';

export async function loadAdminDashboard() {
    switchView('admin');
    fetchUsers();
    fetchAdminTasks();
}

export function switchAdminTab(tabName) {
    const tabs = ['users', 'teams', 'tasks', 'comments'];
    
    // Hide all tabs
    tabs.forEach(t => {
        const el = document.getElementById(`admin-${t}-tab`);
        if(el) el.classList.add('hidden-tab');
    });

    // Show selected tab
    const target = document.getElementById(`admin-${tabName}-tab`);
    if(target) target.classList.remove('hidden-tab');

    // Fetch Data for specific tabs
    if (tabName === 'users') fetchUsers();
    if (tabName === 'teams') fetchTeams();
    if (tabName === 'tasks') fetchAdminTasks();
    if (tabName === 'comments') fetchComments();

    // Update Sidebar Active State
    if (typeof event !== 'undefined' && event.currentTarget) {
        const items = document.querySelectorAll('.sidebar-menu li');
        items.forEach(i => i.classList.remove('active-tab'));
        event.currentTarget.classList.add('active-tab');
    }
}

export async function fetchUsers() {
    // 1. Fetch data
    const { data: users, error } = await supabaseClient
        .from('users')
        .select(`
            id, full_name, email, role, team_id,
            teams:teams!users_team_id_fkey(name) 
        `)
        .order('full_name');

    if (error) { 
        console.error('Error fetching users:', error); 
        // Show error in table so you know it failed
        document.getElementById('admin-user-list').innerHTML = `<tr><td colspan="5" style="color:red">Error loading users: ${error.message}</td></tr>`;
        return; 
    }

    const tbody = document.getElementById('admin-user-list');
    tbody.innerHTML = '';

    // 2. Render Rows
    users.forEach(user => {
        // Safe check for team name. Supabase returns an object for 1:1 relations.
        // If team is null, user.teams will be null.
        const teamName = user.teams ? user.teams.name : 'Unassigned';
        
        const row = `
            <tr>
                <td><div style="font-weight:600;">${user.full_name}</div></td>
                <td style="color:var(--text-muted); font-size:0.9rem;">${user.email}</td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--primary)">${user.role}</span></td>
                <td>${teamName}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="openEditUserModal('${user.id}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn-danger btn-sm" onclick="deleteUser('${user.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

export async function openEditUserModal(userId) {
    const modal = document.getElementById('modal-edit-user');
    if (modal) modal.classList.remove('hidden-view');

    // Clear previous values / Show loading state
    document.getElementById('edit-user-name').value = "Loading...";
    document.getElementById('edit-user-team').innerHTML = '<option>Loading...</option>';

    // 1. Fetch User Details & All Teams in parallel
    const [userRes, teamRes] = await Promise.all([
        supabaseClient.from('users').select('*').eq('id', userId).single(),
        supabaseClient.from('teams').select('id, name')
    ]);

    if (userRes.error) { 
        alert("Error fetching user: " + userRes.error.message); 
        closeModal('edit-user');
        return; 
    }

    const user = userRes.data;
    const teams = teamRes.data || [];

    // 2. Populate Fields
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-name').value = user.full_name;
    document.getElementById('edit-user-role').value = user.role;

    // 3. Populate Team Select (Fixed Logic)
    const teamSelect = document.getElementById('edit-user-team');
    teamSelect.innerHTML = '<option value="">No Team / Unassigned</option>';

    teams.forEach(t => {
        // Create option element properly to ensure 'selected' works
        const option = document.createElement('option');
        option.value = t.id;
        option.innerText = t.name;
        
        // Robust check for ID match
        if (user.team_id && user.team_id === t.id) {
            option.selected = true;
        }
        
        teamSelect.appendChild(option);
    });
}

export async function saveUserChanges() {
    const id = document.getElementById('edit-user-id').value;
    const name = document.getElementById('edit-user-name').value;
    const role = document.getElementById('edit-user-role').value;
    const teamId = document.getElementById('edit-user-team').value;

    // ADDED .select() at the end
    const { data, error } = await supabaseClient
        .from('users')
        .update({
            full_name: name,
            role: role,
            team_id: teamId || null
        })
        .eq('id', id)
        .select(); // <--- CRITICAL FIX

    if (error) {
        alert("Update failed: " + error.message);
    } else {
        closeModal('edit-user');
        await fetchUsers(); // Now this will definitely get the new data
        
        // Restore search if you were searching
        const searchVal = document.querySelector('.search-input').value;
        if(searchVal) filterTable('admin-user-list', searchVal);
    }
}
export async function submitNewUser() {
    const name = document.getElementById('new-user-name').value;
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    const teamId = document.getElementById('new-user-team').value;

    if(!email || !password || !name) {
        alert("Please fill all fields");
        return;
    }

    // 1. Register in Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
    });

    if (authError) {
        alert("Auth Error: " + authError.message);
        return;
    }

    // 2. Add details to public.users table
    const { error: dbError } = await supabaseClient
        .from('users')
        .insert([{
            id: authData.user.id,
            email: email,
            full_name: name,
            role: role,
            team_id: teamId || null,
            status: 'Active'
        }]);

    if (dbError) {
        alert("Database Error: " + dbError.message);
    } else {
        alert("User Created Successfully!");
        closeModal('add-user');
        fetchUsers();
    }
}

export async function editUserRole(userId, currentRole) {
    const newRole = prompt("Enter new role (Admin, Manager, Employee):", currentRole);
    if (!newRole || newRole === currentRole) return;

    const { error } = await supabaseClient
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) {
        alert("Update failed: " + error.message);
    } else {
        fetchUsers();
    }
}

export async function deleteUser(userId) {
    if(!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

    // Delete from public.users (Auth user deletion usually requires Service Role key, handled server-side ideally)
    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('id', userId);

    if(error) {
        alert("Error deleting user: " + error.message);
    } else {
        alert("User deleted from database.");
        fetchUsers();
    }
}

export function exportUsersToCSV() {
    const table = document.getElementById("admin-user-list");
    let rows = [];
    rows.push(["Name", "Email", "Role", "Team", "Status"]);

    for (let i = 0, row; row = table.rows[i]; i++) {
        let cols = [];
        for (let j = 0; j < 5; j++) { 
            cols.push(row.cells[j].innerText);
        }
        rows.push(cols);
    }

    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "users_export.csv");
    document.body.appendChild(link);
    link.click();
}

/* ============================
   TEAM MANAGEMENT
   ============================ */

export async function fetchTeams() {
    const { data: teams, error } = await supabaseClient
        .from('teams')
        .select(`
            id, 
            name, 
            manager:users!teams_manager_id_fkey(full_name),
            users!users_team_id_fkey(count)
        `);

    if (error) { console.error('Error fetching teams:', error); return; }

    const tbody = document.getElementById('admin-team-list');
    tbody.innerHTML = '';

    teams.forEach(team => {
        const managerName = team.manager ? team.manager.full_name : 'No Manager';
        const memberCount = team.users ? team.users[0].count : 0;

        tbody.innerHTML += `
            <tr>
                <td><strong>${team.name}</strong></td>
                <td>${managerName}</td>
                <td>${memberCount} Members</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="deleteTeam('${team.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

export async function submitTeam() {
    const name = document.getElementById('team-name').value;
    const managerId = document.getElementById('team-manager').value;
    
    if(!name) { alert("Team name is required"); return; }

    const payload = {
        name: name,
        manager_id: managerId || null
    };

    const { error } = await supabaseClient.from('teams').insert([payload]);

    if(error) alert("Error: " + error.message);
    else {
        alert("Team Saved!");
        closeModal('manage-team');
        fetchTeams();
    }
}

export async function deleteTeam(id) {
    if(!confirm("Delete this team? Users in this team will become unassigned.")) return;
    const { error } = await supabaseClient.from('teams').delete().eq('id', id);
    if(error) alert(error.message);
    else fetchTeams();
}

/* ============================
   TASK MASTER LOGIC
   ============================ */

// In js/admin.js

export async function fetchAdminTasks() {
    const tbody = document.getElementById('admin-task-list');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select(`
            id, title, status_id, priority_id, deadline,
            task_statuses(name), 
            task_priorities(name),
            creator:users!creator_id(teams!users_team_id_fkey(name)), 
            task_assignments(users(full_name))
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Admin Task Fetch Error:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';

    if(!tasks || tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999;">No tasks found in the system.</td></tr>`;
        return;
    }

    tasks.forEach(task => {
        const statusName = task.task_statuses?.name || 'Unknown';
        const priorityName = task.task_priorities?.name || 'Normal';
        
        // Handle the nested team name safely
        const teamName = task.creator?.teams?.name || 'General';
        
        const assignees = task.task_assignments.map(a => a.users.full_name).join(", ") || '<span style="color:#ccc">Unassigned</span>';
        
        const priorityBadge = priorityName === 'High' 
            ? '<span class="badge" style="background:#fee2e2; color:#b91c1c">High</span>' 
            : priorityName === 'Medium' 
            ? '<span class="badge" style="background:#fff7ed; color:#c2410c">Medium</span>'
            : '<span class="badge" style="background:#f1f5f9; color:#475569">Low</span>';

        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${task.title}</strong><br>
                    <small style="color:#aaa;">Due: ${new Date(task.deadline).toLocaleDateString()}</small>
                </td>
                <td>${teamName}</td>
                <td>${assignees}</td>
                <td>
                    <span class="badge ${getStatusClass(statusName)}">${statusName}</span>
                    ${priorityBadge}
                </td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="openAssignmentModal('${task.id}')" title="Assign Users">
                        <i class="fa-solid fa-user-plus"></i>
                    </button>
                    <button class="btn-secondary btn-sm" onclick="enableEditTask('${task.id}')" title="Edit">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-danger btn-sm" onclick="deleteTask('${task.id}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

export async function submitNewTask() {
    const title = document.getElementById('new-task-title').value;
    const desc = document.getElementById('new-task-desc').value;
    const deadline = document.getElementById('new-task-date').value;
    const priority = document.getElementById('new-task-priority').value;
    const assigneeId = document.getElementById('new-task-assignee').value;

    const { data: { user } } = await supabaseClient.auth.getUser();

    if(!title || !assigneeId || !deadline) {
        alert("Please fill required fields (Title, Assignee, Deadline)");
        return;
    }

    // 1. Insert Task
    const { data: taskData, error: taskError } = await supabaseClient
        .from('tasks')
        .insert([{
            title: title,
            description: desc,
            deadline: deadline,
            priority_id: parseInt(priority),
            status_id: 1, // Default to Pending
            creator_id: user.id
        }])
        .select()
        .single();

    if (taskError) {
        alert("Error creating task: " + taskError.message);
        return;
    }

    // 2. Assign Task
    const { error: assignError } = await supabaseClient
        .from('task_assignments')
        .insert([{
            task_id: taskData.id,
            employee_id: assigneeId
        }]);

    if (assignError) {
        alert("Task created but assignment failed: " + assignError.message);
    } else {
        alert("Task Created & Assigned!");
        closeModal('add-task');
        fetchAdminTasks();
    }
}

export async function openAssignmentModal(taskId) {
    const modal = document.getElementById('modal-manage-assignments');
    if(modal) modal.classList.remove('hidden-view');

    document.getElementById('assignment-task-id').value = taskId;
    const list = document.getElementById('assignment-list');
    list.innerHTML = 'Loading...';

    // 1. Fetch all employees
    const { data: employees } = await supabaseClient
        .from('users')
        .select('id, full_name')
        .neq('role', 'Admin');

    // 2. Fetch current assignments
    const { data: current } = await supabaseClient
        .from('task_assignments')
        .select('employee_id')
        .eq('task_id', taskId);

    const currentIds = current.map(c => c.employee_id);

    list.innerHTML = '';
    employees.forEach(emp => {
        const isChecked = currentIds.includes(emp.id) ? 'checked' : '';
        list.innerHTML += `
            <div style="margin-bottom: 8px;">
                <input type="checkbox" class="assign-checkbox" value="${emp.id}" ${isChecked}>
                <span>${emp.full_name}</span>
            </div>
        `;
    });
}

export async function saveAssignments() {
    const taskId = document.getElementById('assignment-task-id').value;
    const checkboxes = document.querySelectorAll('.assign-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    // 1. Delete existing
    await supabaseClient.from('task_assignments').delete().eq('task_id', taskId);

    // 2. Insert new
    if (selectedIds.length > 0) {
        const rows = selectedIds.map(uid => ({ task_id: taskId, employee_id: uid }));
        const { error } = await supabaseClient.from('task_assignments').insert(rows);
        if(error) { alert("Error assigning: " + error.message); return; }
    }

    alert("Assignments Updated!");
    closeModal('manage-assignments');
    fetchAdminTasks();
}

/* ============================
   MODAL DATA POPULATION
   ============================ */

export async function openModal(type) {
    // Show the modal
    const modal = document.getElementById(`modal-${type}`);
    if (modal) modal.classList.remove('hidden-view');

    // Populate Data based on type
    if (type === 'manage-team') {
        const { data: managers } = await supabaseClient
            .from('users')
            .select('id, full_name')
            .eq('role', 'Manager');
            
        const select = document.getElementById('team-manager');
        select.innerHTML = '<option value="">Select a Manager</option>';
        if(managers) {
            managers.forEach(m => {
                select.innerHTML += `<option value="${m.id}">${m.full_name}</option>`;
            });
        }
    } 
    else if (type === 'add-user') {
         const { data: teams } = await supabaseClient.from('teams').select('id, name');
         const teamSelect = document.getElementById('new-user-team');
         teamSelect.innerHTML = '<option value="">Select a Team</option>';
         if(teams) teams.forEach(t => teamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
    } 
    else if (type === 'add-task') {
         const { data: users } = await supabaseClient.from('users').select('id, full_name').in('role', ['Employee', 'Manager']);
         const userSelect = document.getElementById('new-task-assignee');
         userSelect.innerHTML = '<option value="">Select Employee</option>';
         if(users) users.forEach(u => userSelect.innerHTML += `<option value="${u.id}">${u.full_name}</option>`);
    }
}

/* ============================
   COMMENTS & HELPERS
   ============================ */

export async function fetchComments() {
    const { data: comments, error } = await supabaseClient
        .from('comments')
        .select(`
            id, content, created_at,
            author:users!comments_author_id_fkey(full_name),
            task:tasks!comments_task_id_fkey(title)
        `)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    const tbody = document.getElementById('admin-comments-list');
    tbody.innerHTML = '';

    comments.forEach(c => {
        const authorName = c.author ? c.author.full_name : 'Unknown';
        const taskTitle = c.task ? c.task.title : 'Deleted Task';
        const date = new Date(c.created_at).toLocaleDateString();

        tbody.innerHTML += `
            <tr>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${c.content}</td>
                <td>${authorName}</td>
                <td>${taskTitle}</td>
                <td>${date}</td>
                <td>
                    <button class="btn-danger btn-sm" onclick="deleteComment('${c.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
}

export async function deleteComment(id) {
    if(!confirm("Permanently delete this comment?")) return;
    const { error } = await supabaseClient.from('comments').delete().eq('id', id);
    if(error) alert(error.message);
    else fetchComments();
}

function getStatusClass(status) {
    switch(status) {
        case 'Completed': return 'status-completed';
        case 'In Progress': return 'status-medium';
        default: return 'status-pending';
    }
}

window.loadAdminDashboard = loadAdminDashboard;
window.switchAdminTab = switchAdminTab;
window.fetchUsers = fetchUsers;
window.submitNewUser = submitNewUser;
window.editUserRole = editUserRole;
window.deleteUser = deleteUser;
window.exportUsersToCSV = exportUsersToCSV;
window.fetchTeams = fetchTeams;
window.submitTeam = submitTeam;
window.deleteTeam = deleteTeam;
window.fetchAdminTasks = fetchAdminTasks;
window.submitNewTask = submitNewTask;
window.openAssignmentModal = openAssignmentModal;
window.saveAssignments = saveAssignments;
window.openModal = openModal;
window.fetchComments = fetchComments;
window.deleteComment = deleteComment;
window.openEditUserModal = openEditUserModal;
window.saveUserChanges = saveUserChanges;