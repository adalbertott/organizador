// login.js - Sistema de Login/Logout
document.addEventListener('DOMContentLoaded', function() {
    // Verificar se já está logado
    checkLoginStatus();
    
    // Configurar botões de login/logout
    setupLoginButtons();
});

// Verificar status de login
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (data.logged_in) {
            updateUIForLoggedInUser(data.user_id);
        } else {
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Erro ao verificar status de login:', error);
        updateUIForLoggedOutUser();
    }
}

// Configurar botões de login/logout
function setupLoginButtons() {
    // Botão de login na barra superior
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', showLoginModal);
    }
    
    // Botão de logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }
    
    // Botão de resetar banco de dados
    const resetDbBtn = document.getElementById('reset-db-btn');
    if (resetDbBtn) {
        resetDbBtn.addEventListener('click', resetDatabase);
    }
    
    // Formulário de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await loginUser();
        });
    }
    
    // Configurar fechamento do modal
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        const closeBtn = loginModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                closeModal('login-modal');
            });
        }
    }
}

// Mostrar modal de login
function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        // Limpar formulário
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.reset();
        }
        
        showModal('login-modal');
    }
}

// Login do usuário
async function loginUser() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showNotification('Por favor, preencha todos os campos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Login realizado com sucesso!', 'success');
            closeModal('login-modal');
            
            // Recarregar a página para atualizar dados
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showNotification(data.message || 'Erro ao fazer login', 'error');
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        showNotification('Erro ao fazer login', 'error');
    }
}

// Logout do usuário
async function logoutUser() {
    if (!confirm('Tem certeza que deseja sair?')) return;
    
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('Logout realizado com sucesso!', 'success');
            
            // Recarregar a página
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        showNotification('Erro ao fazer logout', 'error');
    }
}

// Resetar banco de dados
async function resetDatabase() {
    if (!confirm('⚠️ ATENÇÃO: Esta ação irá APAGAR TODOS os dados do banco de dados para o usuário atual.\n\nIsso inclui:\n• Todas as atividades\n• Todas as categorias\n• Todo o progresso registrado\n• Todas as recompensas\n• Todo o histórico\n\nTem certeza que deseja continuar?')) {
        return;
    }
    
    try {
        showNotification('Resetando banco de dados...', 'info');
        
        const response = await fetch('/api/auth/reset_database', {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('✅ Banco de dados resetado com sucesso!', 'success');
            
            // Recarregar a página para mostrar dados vazios
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            const data = await response.json();
            showNotification(data.message || 'Erro ao resetar banco de dados', 'error');
        }
    } catch (error) {
        console.error('Erro ao resetar banco de dados:', error);
        showNotification('Erro ao resetar banco de dados', 'error');
    }
}

// Atualizar UI para usuário logado
function updateUIForLoggedInUser(userId) {
    // Esta função é chamada automaticamente pelo checkLoginStatus
    // A barra superior já mostra as informações corretas via template
    console.log(`Usuário ${userId} está logado`);
}

// Atualizar UI para usuário não logado
function updateUIForLoggedOutUser() {
    // Esta função é chamada automaticamente pelo checkLoginStatus
    console.log('Usuário não está logado');
}