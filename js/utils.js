
export const views = {
    login: document.getElementById('login-view'),
    signup: document.getElementById('signup-view'),
    manager: document.getElementById('manager-view'),
    admin: document.getElementById('admin-view'),
    employee: document.getElementById('employee-view')
};

export function switchView(viewName) {
    Object.values(views).forEach(el => {
        if (el) {
            el.classList.remove('active-view');
            el.classList.add('hidden-view');
        }
    });
    const target = views[viewName];
    if (target) {
        target.classList.remove('hidden-view');
        target.classList.add('active-view');
    }
}

export function openModal(type) {
    const modal = document.getElementById(`modal-${type}`);
    if(modal) modal.classList.remove('hidden-view');
}

export function closeModal(type) {
    const modal = document.getElementById(`modal-${type}`);
    if(modal) modal.classList.add('hidden-view');
}

export function toggleLoginMode(mode) {
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

export function filterTable(tableId, query) {
    const table = document.getElementById(tableId);
    const rows = table.getElementsByTagName('tr');
    const lowerQuery = query.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        let match = false;
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].innerText.toLowerCase().includes(lowerQuery)) {
                match = true;
                break;
            }
        }
        rows[i].style.display = match ? '' : 'none';
    }
}

window.toggleLoginMode = toggleLoginMode;
window.openModal = openModal;
window.closeModal = closeModal;
window.filterTable = filterTable;