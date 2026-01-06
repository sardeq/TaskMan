const supabaseUrl = 'https://rgewvdiehmbptbkgwnbq.supabase.co';
const supabaseKey = 'sb_publishable_b17Mkuk7XjQxpPyuNMyCUg_nEqyxblH';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    signup: document.getElementById('signup-view'),
    manager: document.getElementById('manager-view'),
    admin: document.getElementById('admin-view'),
    employee: document.getElementById('employee-view')
};

async function handleSignup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const fullName = document.getElementById('signup-name').value;
    const msg = document.getElementById('signup-msg');

    if(!email || !password || !fullName) {
        msg.innerText = "Please fill in all fields.";
        return;
    }

    // 1. Create Auth User
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: fullName } }
    });

    if (authError) {
        msg.innerText = "Error: " + authError.message;
        return;
    }

    // 2. Insert into public.users
    // We use upsert here just in case the row partially exists or to handle retries safely
    const { error: dbError } = await supabaseClient
        .from('users')
        .upsert([{ 
            id: authData.user.id, 
            email: email, 
            full_name: fullName,
            role: 'Employee',
            status: 'Pending' // This requires the SQL fix from Step 1
        }]);

    if(dbError) {
        console.error("DB Insert Error", dbError);
        msg.innerText = "Account created, but profile setup failed: " + dbError.message;
    } else {
        msg.style.color = "green";
        msg.innerText = "Success! Please log in.";
        setTimeout(() => toggleLoginMode('login'), 2000);
    }
}

function toggleLoginMode(mode) {
    if(mode === 'signup') {
        document.getElementById('login-view').classList.add('hidden-view');
        document.getElementById('login-view').classList.remove('active-view');
        document.getElementById('signup-view').classList.remove('hidden-view');
        document.getElementById('signup-view').classList.add('active-view');
    } else {
        document.getElementById('signup-view').classList.add('hidden-view');
        document.getElementById('signup-view').classList.remove('active-view');
        document.getElementById('login-view').classList.remove('hidden-view');
        document.getElementById('login-view').classList.add('active-view');
    }
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        document.getElementById('login-msg').innerText = "Login Failed: " + error.message;
    } else {
        checkUserRole(data.user.id);
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    switchView('login');
}

async function checkUserRole(userId) {
    const { data: userProfile, error } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (userProfile) {
        if (userProfile.role === 'Admin') {
            loadAdminDashboard();
        } else if (userProfile.role === 'Manager') {
            loadAdminDashboard();
        } else {
            loadEmployeeDashboard(userId);
        }
    }
}

function switchView(viewName) {
    // 1. Hide all views (safely)
    Object.values(views).forEach(el => {
        if (el) { // Only proceed if the element actually exists
            el.classList.remove('active-view');
            el.classList.add('hidden-view');
        }
    });

    // 2. Show the specific view
    const target = views[viewName];
    if (target) {
        target.classList.remove('hidden-view');
        target.classList.add('active-view');
    } else {
        console.error(`Error: Element for view '${viewName}' not found in DOM.`);
    }
}


async function loadAdminDashboard() {
    switchView('admin');
    fetchUsers();
    fetchAdminTasks();
}

async function fetchUsers() {
    const { data: users, error } = await supabaseClient
        .from('users')
        .select(`
            id, 
            full_name, 
            email, 
            role, 
            teams!users_team_id_fkey(name)
        `); 

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    const tbody = document.getElementById('admin-user-list');
    tbody.innerHTML = '';

    users.forEach(user => {
        // Handle case where user has no team (null)
        const teamName = user.teams ? user.teams.name : 'Unassigned';
        
        // Status logic
        const status = 'Active'; 
        const statusClass = 'status-active';
        
        const row = `
            <tr>
                <td><strong>${user.full_name}</strong></td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${teamName}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>
                    <button class="btn-secondary" style="padding: 5px 10px;" onclick="editUserRole('${user.id}', '${user.role}')">Edit</button>
                    <button class="btn-secondary" style="padding: 5px 10px; color: red; border-color: red;" onclick="deleteUser('${user.id}')">Delete</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

async function fetchAdminTasks() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select(`
            id, title, task_statuses(name), 
            creator:users!tasks_creator_id_fkey(teams(name)),
            task_assignments(users(full_name))
        `); 

    if (error) return;

    const tbody = document.getElementById('admin-task-list');
    tbody.innerHTML = '';

    if(tasks) {
        tasks.forEach(task => {
            const statusName = task.task_statuses?.name || 'Unknown';
            const statusClass = getStatusClass(statusName);
            const teamName = task.creator?.teams?.name || 'General';
            
            const assignees = task.task_assignments.map(a => a.users.full_name).join(", ") || 'Unassigned';
            
            tbody.innerHTML += `
                <tr>
                    <td><strong>${task.title}</strong></td>
                    <td>${teamName}</td>
                    <td>${assignees}</td>
                    <td><span class="badge ${statusClass}">${statusName}</span></td>
                    <td>
                        <button class="btn-secondary btn-sm" onclick="openAssignmentModal('${task.id}')">
                            <i class="fa-solid fa-user-plus"></i> Assign
                        </button>
                    </td>
                </tr>
            `;
        });
    }
}


async function openAssignmentModal(taskId) {
    document.getElementById('modal-manage-assignments').classList.remove('hidden-view');
    document.getElementById('assignment-task-id').value = taskId;
    
    const list = document.getElementById('assignment-list');
    list.innerHTML = 'Loading...';

    // 1. Fetch all employees
    const { data: employees } = await supabaseClient
        .from('users')
        .select('id, full_name')
        .neq('role', 'Admin'); // Admins usually don't do tasks

    // 2. Fetch current assignments for this task
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

async function saveAssignments() {
    const taskId = document.getElementById('assignment-task-id').value;
    const checkboxes = document.querySelectorAll('.assign-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    // 1. Delete all existing assignments for this task
    await supabaseClient.from('task_assignments').delete().eq('task_id', taskId);

    // 2. Insert new assignments
    if (selectedIds.length > 0) {
        const rows = selectedIds.map(uid => ({ task_id: taskId, employee_id: uid }));
        const { error } = await supabaseClient.from('task_assignments').insert(rows);
        if(error) { alert("Error assigning: " + error.message); return; }
    }

    alert("Assignments Updated!");
    closeModal('manage-assignments');
    fetchAdminTasks();
}

/* --- NEW: COMMENTS MODERATION LOGIC --- */
async function fetchComments() {
    // [cite: 272] Fetch comments with Author and Task Title
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

async function deleteComment(id) {
    if(!confirm("Permanently delete this comment?")) return;
    const { error } = await supabaseClient.from('comments').delete().eq('id', id);
    if(error) alert(error.message);
    else fetchComments();
}


async function deleteUser(userId) {
    if(!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

    // Delete from public.users
    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('id', userId);

    if(error) {
        alert("Error deleting user: " + error.message);
    } else {
        alert("User deleted from database.");
        fetchUsers(); // Refresh the table
    }
}

async function editUserRole(userId, currentRole) {
    const newRole = prompt("Enter new role (Admin, Manager, Employee):", currentRole);
    if (!newRole || newRole === currentRole) return;

    const { error } = await supabaseClient
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) {
        alert("Update failed: " + error.message);
    } else {
        fetchUsers(); // Refresh
    }
}

function getStatusClass(status) {
    switch(status) {
        case 'Completed': return 'status-completed';
        case 'In Progress': return 'status-medium';
        default: return 'status-pending';
    }
}

function exportUsersToCSV() {
    const table = document.getElementById("admin-user-list");
    let rows = [];
    
    // Add Header
    rows.push(["Name", "Email", "Role", "Team", "Status"]);

    // Iterate table rows
    for (let i = 0, row; row = table.rows[i]; i++) {
        let cols = [];
        for (let j = 0; j < 5; j++) { // Get first 5 columns
            cols.push(row.cells[j].innerText);
        }
        rows.push(cols);
    }

    let csvContent = "data:text/csv;charset=utf-8," 
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "users_export.csv");
    document.body.appendChild(link);
    link.click();
}

function switchAdminTab(tabName) {
    const tabs = ['users', 'teams', 'tasks', 'comments'];
    
    // Hide all tabs
    tabs.forEach(t => {
        document.getElementById(`admin-${t}-tab`).classList.add('hidden-tab');
    });

    // Show selected tab
    document.getElementById(`admin-${tabName}-tab`).classList.remove('hidden-tab');

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

/* --- NEW: TEAM MANAGEMENT LOGIC --- */
async function fetchTeams() {
    // [cite: 269] Fetch teams and join with users to get manager name
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
        const memberCount = team.users ? team.users[0].count : 0; // Supabase count returns array

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

async function submitTeam() {
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

async function deleteTeam(id) {
    if(!confirm("Delete this team? Users in this team will become unassigned.")) return;
    const { error } = await supabaseClient.from('teams').delete().eq('id', id);
    if(error) alert(error.message);
    else fetchTeams();
}

// 3. Manager Dashboard Logic
async function loadManagerDashboard() {
    switchView('manager');
    
    // Fetch all tasks [cite: 154]
    const { data: tasks } = await supabaseClient
        .from('tasks')
        .select(`*, task_statuses(name), task_priorities(name)`);

    const list = document.getElementById('manager-task-list');
    list.innerHTML = '';

    // Render Table
    tasks.forEach(task => {
        const row = `
            <tr>
                <td>${task.title}</td>
                <td>--</td> <td>${task.task_priorities.name}</td>
                <td>${task.task_statuses.name}</td>
                <td><button onclick="deleteTask('${task.id}')">Delete</button></td>
            </tr>
        `;
        list.innerHTML += row;
    });

    // Render Analytics Chart [cite: 172]
    renderChart(tasks);
}

function renderChart(tasks) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    // Count statuses
    const counts = { 'Pending': 0, 'In Progress': 0, 'Completed': 0 };
    tasks.forEach(t => {
        const status = t.task_statuses.name;
        if (counts[status] !== undefined) counts[status]++;
    });

    new Chart(ctx, {
        type: 'doughnut', // [cite: 90]
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#ffc107', '#007bff', '#28a745']
            }]
        }
    });
}

// 4. Employee Dashboard Logic
async function loadEmployeeDashboard(userId) {
    switchView('employee');

    // Fetch only assigned tasks [cite: 154]
    // Note: We filter by the RLS policy automatically, but we join strictly here.
    const { data: tasks } = await supabaseClient
        .from('tasks')
        .select(`*, task_statuses(name), task_priorities(name)`); 
        // Logic relies on RLS to only return assigned tasks

    const cols = {
        'Pending': document.getElementById('col-pending'),
        'In Progress': document.getElementById('col-progress'),
        'Completed': document.getElementById('col-completed')
    };

    // Clear columns
    Object.values(cols).forEach(col => col.innerHTML = '');

    tasks.forEach(task => {
        const statusName = task.task_statuses.name;
        const priorityClass = task.task_priorities.name.toLowerCase(); // Low, Medium, High
        
        const card = document.createElement('div');
        card.className = `task-card ${priorityClass}`;
        card.innerHTML = `
            <h4>${task.title}</h4>
            <p>${task.description || ''}</p>
            <small>Deadline: ${new Date(task.deadline).toLocaleDateString()}</small>
            <br>
            <select class="status-select" onchange="updateStatus('${task.id}', this.value)">
                <option value="1" ${statusName === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="2" ${statusName === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="3" ${statusName === 'Completed' ? 'selected' : ''}>Completed</option>
            </select>
        `;

        if(cols[statusName]) cols[statusName].appendChild(card);
    });
}

// Update Status Function [cite: 163]
async function updateStatus(taskId, newStatusId) {
    const { error } = await supabaseClient
        .from('tasks')
        .update({ status_id: parseInt(newStatusId) })
        .eq('id', taskId);

    if (error) alert("Error updating: " + error.message);
    else {
        // Refresh view
        const { data: { user } } = await supabaseClient.auth.getUser();
        loadEmployeeDashboard(user.id);
    }
}

async function openModal(type) {
    if (type === 'manage-team') {
        document.getElementById('modal-manage-team').classList.remove('hidden-view');
        
        // Populate Managers Dropdown
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
    // Handle existing modals (add-user, add-task)
    else if (type === 'add-user' || type === 'add-task') {
        if (type === 'add-user') {
             document.getElementById('modal-add-user').classList.remove('hidden-view');
             const { data: teams } = await supabaseClient.from('teams').select('id, name');
             const teamSelect = document.getElementById('new-user-team');
             teamSelect.innerHTML = '<option value="">Select a Team</option>';
             if(teams) teams.forEach(t => teamSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
        } else {
             document.getElementById('modal-add-task').classList.remove('hidden-view');
             const { data: users } = await supabaseClient.from('users').select('id, full_name').in('role', ['Employee', 'Manager']);
             const userSelect = document.getElementById('new-task-assignee');
             userSelect.innerHTML = '<option value="">Select Employee</option>';
             if(users) users.forEach(u => userSelect.innerHTML += `<option value="${u.id}">${u.full_name}</option>`);
        }
    }
}

function closeModal(type) {
    document.getElementById(`modal-${type}`).classList.add('hidden-view');
}

// --- FILTER FUNCTION ---
function filterTable(tableId, query) {
    const table = document.getElementById(tableId);
    const rows = table.getElementsByTagName('tr');
    const lowerQuery = query.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        let match = false;
        // Check all text cells in the row
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].innerText.toLowerCase().includes(lowerQuery)) {
                match = true;
                break;
            }
        }
        rows[i].style.display = match ? '' : 'none';
    }
}

// --- CREATE NEW USER LOGIC ---
async function submitNewUser() {
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
    // NOTE: In a real app, this might log the admin out. 
    // For this prototype, we'll proceed, but be aware of session changes.
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
        fetchUsers(); // Refresh list
    }
}

// --- CREATE NEW TASK LOGIC ---
async function submitNewTask() {
    const title = document.getElementById('new-task-title').value;
    const desc = document.getElementById('new-task-desc').value;
    const deadline = document.getElementById('new-task-date').value;
    const priority = document.getElementById('new-task-priority').value;
    const assigneeId = document.getElementById('new-task-assignee').value;

    // Get current Admin ID (Creator)
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

    // 2. Assign Task to User (Insert into Junction Table)
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
        fetchAdminTasks(); // Refresh list
    }
}