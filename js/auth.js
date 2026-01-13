import { switchView, toggleLoginMode } from './utils.js';
import { supabaseClient } from './config.js';
import { loadAdminDashboard } from './admin.js';
import { loadManagerDashboard } from './manager.js';
import { loadEmployeeDashboard } from './employee.js';

export async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('login-msg');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        msg.innerText = "Login Failed: " + error.message;
    } else {
        checkUserRole(data.user.id);
    }
}

export async function handleSignup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const fullName = document.getElementById('signup-name').value;
    const msg = document.getElementById('signup-msg');

    if(!email || !password || !fullName) {
        msg.innerText = "Please fill in all fields.";
        return;
    }

    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: fullName } }
    });

    if (authError) {
        msg.innerText = "Error: " + authError.message;
        return;
    }

    const { error: dbError } = await supabaseClient
        .from('users')
        .upsert([{ 
            id: authData.user.id, 
            email: email, 
            full_name: fullName,
            role: 'Employee',
            status: 'Pending'
        }]);

    if(dbError) {
        msg.innerText = "Profile setup failed: " + dbError.message;
    } else {
        msg.style.color = "green";
        msg.innerText = "Success! Please log in.";
        setTimeout(() => toggleLoginMode('login'), 2000);
    }
}

export async function handleLogout() {
    await supabaseClient.auth.signOut();
    switchView('login');
}

export async function checkUserRole(userId) {
    const { data: userProfile } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (userProfile) {
        if (userProfile.role === 'Admin') loadAdminDashboard();
        else if (userProfile.role === 'Manager') loadManagerDashboard();
        else loadEmployeeDashboard(userId);
    }
}

window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleLogout = handleLogout;

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        // If logged in, redirect to their dashboard
        checkUserRole(session.user.id);
    }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.switchView('login');
    }
});