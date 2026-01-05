const supabaseUrl = 'https://rgewvdiehmbptbkgwnbq.supabase.co';
const supabaseKey = 'sb_publishable_b17Mkuk7XjQxpPyuNMyCUg_nEqyxblH';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    manager: document.getElementById('manager-view'),
    admin: document.getElementById('admin-view'),
    employee: document.getElementById('employee-view')
};

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
    Object.values(views).forEach(el => el.classList.remove('active-view'));
    Object.values(views).forEach(el => el.classList.add('hidden-view'));
    views[viewName].classList.remove('hidden-view');
    views[viewName].classList.add('active-view');
}


async function loadAdminDashboard() {
    switchView('admin');
    fetchUsers();
    fetchAdminTasks();
}

async function fetchUsers() {
    const { data: users, error } = await supabaseClient
        .from('users')
        .select(`id, full_name, email, role, teams(name)`); // Joining teams table [cite: 269]

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    const tbody = document.getElementById('admin-user-list');
    tbody.innerHTML = '';

    users.forEach(user => {
        // Mock status logic (Active/Inactive) based on role or data
        const status = user.role === 'Admin' ? 'Active' : 'Active'; 
        const statusClass = status === 'Active' ? 'status-active' : 'status-inactive';
        
        const row = `
            <tr>
                <td><strong>${user.full_name}</strong></td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${user.teams ? user.teams.name : 'Unassigned'}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>
                    <button class="btn-secondary" style="padding: 5px 10px;">Edit</button>
                    <button class="btn-secondary" style="padding: 5px 10px; color: red; border-color: red;" onclick="deleteUser('${user.id}')">Delete</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// Fetch and Render Tasks for Admin 
async function fetchAdminTasks() {
    const { data: tasks } = await supabaseClient
        .from('tasks')
        .select(`
            title, 
            task_statuses(name), 
            teams(name), 
            users!task_assignments(full_name) 
        `); 
        // Note: This query assumes relationships are set up in Supabase as per ERD

    const tbody = document.getElementById('admin-task-list');
    tbody.innerHTML = '';

    if(tasks) {
        tasks.forEach(task => {
            const statusClass = getStatusClass(task.task_statuses.name);
            const employeeName = task.users ? task.users.full_name : 'Unassigned';
            
            tbody.innerHTML += `
                <tr>
                    <td>${task.title}</td>
                    <td>${task.teams ? task.teams.name : 'General'}</td>
                    <td>${employeeName}</td>
                    <td><span class="badge ${statusClass}">${task.task_statuses.name}</span></td>
                </tr>
            `;
        });
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

// Tab Switching Logic
function switchAdminTab(tabName) {
    // Hide all tabs
    document.getElementById('admin-users-tab').style.display = 'none';
    document.getElementById('admin-tasks-tab').style.display = 'none';
    
    // Show selected
    if(tabName === 'users') document.getElementById('admin-users-tab').style.display = 'block';
    if(tabName === 'tasks') document.getElementById('admin-tasks-tab').style.display = 'block';

    // Update Sidebar Active State
    const items = document.querySelectorAll('.sidebar-menu li');
    items.forEach(i => i.classList.remove('active-tab'));
    event.currentTarget.classList.add('active-tab');
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