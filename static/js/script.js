// Variáveis globais
let categories = [];
let activities = [];
let rewards = [];

// Funções de Modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let modal of modals) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
}

// Dashboard
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const stats = await response.json();
        
        // Verificar se elementos existem antes de atualizar
        const totalActivitiesEl = document.getElementById('total-activities');
        const completedActivitiesEl = document.getElementById('completed-activities');
        const totalCategoriesEl = document.getElementById('total-categories');
        const weekProgressEl = document.getElementById('week-progress');
        
        if (totalActivitiesEl) totalActivitiesEl.textContent = stats.total_activities;
        if (completedActivitiesEl) completedActivitiesEl.textContent = stats.completed_activities;
        if (totalCategoriesEl) totalCategoriesEl.textContent = stats.total_categories;
        if (weekProgressEl) weekProgressEl.textContent = stats.week_progress;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}


// Determinar tipo de medição da atividade
function getMeasurementType(activity) {
    if (activity.target_value && activity.target_unit) {
        return 'units'; // Medição por unidades (100 páginas, 10 flexões)
    } else if (activity.manual_percentage !== undefined) {
        return 'percentage'; // Porcentagem direta
    } else {
        return 'boolean'; // Simples (feito/não feito)
    }
}

// script.js - Atualizar função loadRecentActivities
async function loadRecentActivities() {
    try {
        const response = await fetch('/api/activities');
        activities = await response.json();
        
        const activitiesList = document.getElementById('activities-list');
        if (!activitiesList) return;
        
        activitiesList.innerHTML = '';
        
        // Ordenar atividades por ID decrescente (as mais recentes primeiro)
        const sortedActivities = [...activities].sort((a, b) => b.id - a.id);
        const recentActivities = sortedActivities.slice(0, 5);
        
        recentActivities.forEach(activity => {
            const progress = calculateProgress(activity);
            const progressText = getProgressText(activity);
            
            const activityElement = document.createElement('div');
            activityElement.className = 'activity-item fade-in';
            activityElement.innerHTML = `
                <div class="activity-header">
                    <span class="activity-category" style="color: ${activity.category_color}">
                        ${activity.category_name}
                    </span>
                    <span class="activity-status">${getStatusText(activity.status)}</span>
                </div>
                <h4>${activity.name}</h4>
                ${activity.description ? `<p>${activity.description}</p>` : ''}
                <div class="activity-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${progressText}</span>
                </div>
            `;
            activitiesList.appendChild(activityElement);
        });
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
    }
}
function getStatusText(status) {
    const statusMap = {
        'completed': 'Concluído',
        'in_progress': 'Em Andamento',
        'want_to_do': 'Quero Fazer'
    };
    return statusMap[status] || status;
}

// Categorias
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        categories = await response.json();
        
        const categoriesGrid = document.getElementById('categories-grid');
        if (!categoriesGrid) return;
        
        categoriesGrid.innerHTML = '';
        
        categories.forEach(category => {
            const categoryElement = document.createElement('div');
            categoryElement.className = 'category-card fade-in';
            categoryElement.style.borderLeftColor = category.color;
            categoryElement.innerHTML = `
                <div class="category-header">
                    <div>
                        <span class="category-icon">${category.icon}</span>
                        <h3>${category.name}</h3>
                    </div>
                    <div class="category-actions">
                        <button class="btn btn-outline btn-sm" onclick="editCategory(${category.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="deleteCategory(${category.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${category.description ? `<p>${category.description}</p>` : ''}
                <div class="category-stats">
                    <small>${category.activity_count} atividades</small>
                </div>
            `;
            categoriesGrid.appendChild(categoryElement);
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

function showAddCategoryModal() {
    const modalTitle = document.getElementById('category-modal-title');
    const categoryForm = document.getElementById('category-form');
    const categoryId = document.getElementById('category-id');
    
    if (modalTitle && categoryForm && categoryId) {
        modalTitle.textContent = 'Nova Categoria';
        categoryForm.reset();
        categoryId.value = '';
        showModal('category-modal');
    }
}

async function editCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;
    
    const modalTitle = document.getElementById('category-modal-title');
    const categoryIdInput = document.getElementById('category-id');
    const categoryName = document.getElementById('category-name');
    const categoryDescription = document.getElementById('category-description');
    const categoryColor = document.getElementById('category-color');
    const categoryIcon = document.getElementById('category-icon');
    
    if (modalTitle && categoryIdInput && categoryName && categoryDescription && categoryColor && categoryIcon) {
        modalTitle.textContent = 'Editar Categoria';
        categoryIdInput.value = category.id;
        categoryName.value = category.name;
        categoryDescription.value = category.description || '';
        categoryColor.value = category.color;
        categoryIcon.value = category.icon;
        
        showModal('category-modal');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
    
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadCategories();
            showNotification('Categoria excluída com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        showNotification('Erro ao excluir categoria', 'error');
    }
}

// Formulário de Categoria - SÓ ADICIONA LISTENER SE O FORM EXISTIR
const categoryForm = document.getElementById('category-form');
if (categoryForm) {
    categoryForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('category-name').value,
            description: document.getElementById('category-description').value,
            color: document.getElementById('category-color').value,
            icon: document.getElementById('category-icon').value
        };
        
        const categoryId = document.getElementById('category-id').value;
        
        try {
            const url = categoryId ? `/api/categories/${categoryId}` : '/api/categories';
            const method = categoryId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                closeModal('category-modal');
                loadCategories();
                showNotification(
                    categoryId ? 'Categoria atualizada com sucesso!' : 'Categoria criada com sucesso!',
                    'success'
                );
            }
        } catch (error) {
            console.error('Erro ao salvar categoria:', error);
            showNotification('Erro ao salvar categoria', 'error');
        }
    });
}
// Recompensas - CÓDIGO CORRIGIDO
async function loadRewards() {
    try {
        const response = await fetch('/api/rewards');
        rewards = await response.json();
        
        const activeRewardsGrid = document.getElementById('active-rewards');
        const achievedRewardsGrid = document.getElementById('achieved-rewards');
        
        if (activeRewardsGrid) activeRewardsGrid.innerHTML = '';
        if (achievedRewardsGrid) achievedRewardsGrid.innerHTML = '';
        
        rewards.forEach(reward => {
            const rewardElement = createRewardElement(reward);
            
            if (reward.achieved) {
                if (achievedRewardsGrid) achievedRewardsGrid.appendChild(rewardElement);
            } else {
                if (activeRewardsGrid) activeRewardsGrid.appendChild(rewardElement);
            }
        });
        
        // Carregar atividades para o select
      //  await loadActivitiesForSelect();
        // Carregar goals para o select
        //await loadGoalsForSelect();
    } catch (error) {
        console.error('Erro ao carregar recompensas:', error);
    }
}

function createRewardElement(reward) {
    const element = document.createElement('div');
    element.className = `reward-card ${reward.achieved ? 'achieved' : ''} fade-in`;
    element.innerHTML = `
        <div class="reward-header">
            <h3>${reward.name}</h3>
            <span class="reward-badge">
                ${reward.achieved ? 'Conquistada' : 'Ativa'}
            </span>
        </div>
        ${reward.description ? `<p>${reward.description}</p>` : ''}
        <div class="reward-condition">
            <small><strong>Condição:</strong> ${getConditionText(reward)}</small>
        </div>
        ${!reward.achieved ? `
            <div class="reward-actions">
                <button class="btn btn-outline btn-sm" onclick="markRewardAchieved(${reward.id})">
                    <i class="fas fa-check"></i> Marcar como Conquistada
                </button>
                <button class="btn btn-outline btn-sm" onclick="editReward(${reward.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-outline btn-sm" onclick="deleteReward(${reward.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : `
            <div class="reward-actions">
                <button class="btn btn-outline btn-sm" onclick="deleteReward(${reward.id})">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `}
    `;
    return element;
}

function getConditionText(reward) {
    switch (reward.condition_type) {
        case 'points':
            return `Acumular ${reward.condition_value} pontos`;
        case 'activity_completion':
            return `Completar atividade específica`;
        case 'streak':
            return `Manter sequência de ${reward.condition_value} dias`;
        case 'goal_completion':
            return `Completar objetivo específico`;
        case 'custom':
            return 'Condição personalizada';
        default:
            return reward.condition_type;
    }
}

function showAddRewardModal() {
    const modalTitle = document.getElementById('reward-modal-title');
    const rewardForm = document.getElementById('reward-form');
    const rewardId = document.getElementById('reward-id');
    
    if (modalTitle && rewardForm && rewardId) {
        modalTitle.textContent = 'Nova Recompensa';
        rewardForm.reset();
        rewardId.value = '';
        toggleConditionFields();
        showModal('reward-modal');
    }
}

function toggleConditionFields() {
    const conditionType = document.getElementById('reward-condition');
    const valueGroup = document.getElementById('condition-value-group');
    const activityGroup = document.getElementById('activity-select-group');
    const goalGroup = document.getElementById('goal-select-group');
    const conditionUnit = document.getElementById('condition-unit');
    
    if (!conditionType) return;
    
    // Esconder todos os grupos primeiro
    if (valueGroup) valueGroup.style.display = 'none';
    if (activityGroup) activityGroup.style.display = 'none';
    if (goalGroup) goalGroup.style.display = 'none';
    
    // Mostrar apenas o grupo relevante
    switch (conditionType.value) {
        case 'points':
            if (valueGroup) valueGroup.style.display = 'block';
            if (conditionUnit) conditionUnit.textContent = 'pontos';
            break;
        case 'streak':
            if (valueGroup) valueGroup.style.display = 'block';
            if (conditionUnit) conditionUnit.textContent = 'dias';
            break;
        case 'activity_completion':
            if (activityGroup) activityGroup.style.display = 'block';
            break;
        case 'goal_completion':
            if (goalGroup) goalGroup.style.display = 'block';
            break;
        case 'custom':
            // Nenhum campo adicional para custom
            break;
    }
}

async function loadActivitiesForSelect() {
    try {
        const response = await fetch('/api/activities');
        const activities = await response.json();
        const select = document.getElementById('reward-activity');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione uma atividade</option>';
        activities.forEach(activity => {
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = activity.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
    }
}
/*
async function loadGoalsForSelect() {
    try {
        const response = await fetch('/api/goals');
        const goals = await response.json();
        const select = document.getElementById('reward-goal');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione um objetivo</option>';
        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = goal.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar objetivos:', error);
        // Se a API de goals não existir, esconder o grupo
        const goalGroup = document.getElementById('goal-select-group');
        if (goalGroup) goalGroup.style.display = 'none';
    }
}
*/ 

// CORRIGIDO: Formulário de Recompensa - CÓDIGO SIMPLIFICADO
const rewardForm = document.getElementById('reward-form');
if (rewardForm) {
    rewardForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('reward-name').value,
            description: document.getElementById('reward-description').value,
            points_required: parseInt(document.getElementById('reward-points').value) || 0
        };
        
        const rewardId = document.getElementById('reward-id').value;
        
        try {
            const url = rewardId ? `/api/rewards/${rewardId}` : '/api/rewards';
            const method = rewardId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                closeModal('reward-modal');
                loadRewards();
                showNotification(
                    rewardId ? 'Recompensa atualizada com sucesso!' : 'Recompensa criada com sucesso!',
                    'success'
                );
            } else {
                const errorData = await response.json();
                showNotification(errorData.message || 'Erro ao salvar recompensa', 'error');
            }
        } catch (error) {
            console.error('Erro ao salvar recompensa:', error);
            showNotification('Erro ao salvar recompensa', 'error');
        }
    });
}

// CORRIGIDO: Função para editar recompensa - versão simplificada
async function editReward(rewardId) {
    const reward = rewards.find(r => r.id === rewardId);
    if (!reward) return;
    
    const modalTitle = document.getElementById('reward-modal-title');
    const rewardIdInput = document.getElementById('reward-id');
    const rewardName = document.getElementById('reward-name');
    const rewardDescription = document.getElementById('reward-description');
    const rewardPoints = document.getElementById('reward-points');
    
    if (modalTitle && rewardIdInput && rewardName && rewardDescription && rewardPoints) {
        modalTitle.textContent = 'Editar Recompensa';
        rewardIdInput.value = reward.id;
        rewardName.value = reward.name;
        rewardDescription.value = reward.description || '';
        rewardPoints.value = reward.points_required || 0;
        
        showModal('reward-modal');
    }
}
async function markRewardAchieved(rewardId) {
    try {
        const response = await fetch(`/api/rewards/${rewardId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ achieved: true })
        });
        
        if (response.ok) {
            loadRewards();
            showNotification('Recompensa marcada como conquistada!', 'success');
        }
    } catch (error) {
        console.error('Erro ao atualizar recompensa:', error);
        showNotification('Erro ao atualizar recompensa', 'error');
    }
}

async function deleteReward(rewardId) {
    if (!confirm('Tem certeza que deseja excluir esta recompensa?')) return;
    
    try {
        const response = await fetch(`/api/rewards/${rewardId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadRewards();
            showNotification('Recompensa excluída com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao excluir recompensa:', error);
        showNotification('Erro ao excluir recompensa', 'error');
    }
}

function showRewardsTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.rewards-grid').forEach(grid => grid.style.display = 'none');
    
    event.target.classList.add('active');
    
    let targetGrid;
    switch (tab) {
        case 'active':
            targetGrid = document.getElementById('active-rewards');
            break;
        case 'achieved':
            targetGrid = document.getElementById('achieved-rewards');
            break;
        case 'goals':
            targetGrid = document.getElementById('goals-rewards');
            break;
    }
    
    if (targetGrid) targetGrid.style.display = 'grid';
}

// Adicionar esta função para carregar goals na aba de recompensas
async function loadGoalsForRewards() {
    try {
        const response = await fetch('/api/goals');
        const goals = await response.json();
        const goalsGrid = document.getElementById('goals-rewards');
        
        if (!goalsGrid) return;
        
        goalsGrid.innerHTML = '';
        
        goals.forEach(goal => {
            const goalElement = document.createElement('div');
            goalElement.className = 'reward-card fade-in';
            goalElement.innerHTML = `
                <div class="reward-header">
                    <h3>${goal.name}</h3>
                    <span class="reward-badge">Objetivo</span>
                </div>
                ${goal.description ? `<p>${goal.description}</p>` : ''}
                <div class="reward-condition">
                    <small><strong>Progresso:</strong> ${goal.progress || 0}%</small>
                </div>
                <div class="goal-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${goal.progress || 0}%"></div>
                    </div>
                </div>
            `;
            goalsGrid.appendChild(goalElement);
        });
    } catch (error) {
        console.error('Erro ao carregar objetivos:', error);
    }
}
// Sistema de Notificações
function showNotification(message, type = 'info') {
    // Remover notificações existentes
    document.querySelectorAll('.notification').forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} slide-up`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}
// ==============================================
// SISTEMA DE PROGRESSO COM TIPOS DE MEDIÇÃO
// ==============================================

// Determinar tipo de medição da atividade
function getMeasurementType(activity) {
    if (activity.target_value && activity.target_unit) {
        return 'units'; // Medição por unidades (100 páginas, 10 flexões)
    } else if (activity.manual_percentage !== undefined && activity.manual_percentage !== null) {
        return 'percentage'; // Porcentagem direta
    } else {
        return 'boolean'; // Simples (feito/não feito)
    }
}


// Obter texto descritivo do progresso
function getProgressText(activity) {
    const type = getMeasurementType(activity);
    const progress = calculateProgress(activity);
    
    switch (type) {
        case 'units':
            if (activity.target_value && activity.progress !== undefined) {
                return `${activity.progress}/${activity.target_value} ${activity.target_unit} (${progress}%)`;
            }
            return `${progress}%`;
            
        case 'percentage':
            return `${progress}% concluído`;
            
        case 'boolean':
            return activity.status === 'completed' ? 'Concluído' : 'Não iniciado';
            
        default:
            return `${progress}%`;
    }
}

// Alternar campos de medição no formulário de atividade
function toggleMeasurementFields() {
    const measurementType = document.getElementById('activity-measurement-type');
    const unitsGroup = document.getElementById('units-group');
    const percentageGroup = document.getElementById('percentage-group');
    
    if (!measurementType || !unitsGroup || !percentageGroup) return;
    
    // Esconder todos os grupos primeiro
    unitsGroup.style.display = 'none';
    percentageGroup.style.display = 'none';
    
    // Mostrar apenas o grupo relevante
    switch (measurementType.value) {
        case 'units':
            unitsGroup.style.display = 'block';
            break;
        case 'percentage':
            percentageGroup.style.display = 'block';
            break;
        case 'boolean':
            // Nenhum campo adicional para tipo booleano
            break;
    }
}


// Alternar entre tipos de progresso
function toggleProgressType() {
    const progressType = document.querySelector('input[name="progress-type"]:checked').value;
    const partialGroup = document.getElementById('partial-progress-group');
    const completeGroup = document.getElementById('complete-progress-group');
    
    if (progressType === 'complete') {
        partialGroup.style.display = 'none';
        completeGroup.style.display = 'block';
    } else {
        partialGroup.style.display = 'block';
        completeGroup.style.display = 'none';
    }
}
// Carregar categorias para select
async function loadCategoriesForSelect() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        const select = document.getElementById('activity-category');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione uma categoria</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar categorias:', error);
    }
}

// Mostrar modal de atividade
function showAddActivityModal() {
    const activityModal = document.getElementById('activity-modal');
    if (activityModal) {
        document.getElementById('activity-form').reset();
        showModal('activity-modal');
    } else {
        showNotification('Use a página de Categorias para adicionar atividades', 'info');
    }
}
// ==============================================
// ATUALIZAR: Função para calcular progresso corretamente
// ==============================================

function calculateProgress(activity) {
    if (!activity) return 0;
    
    // Usar progress_percentage se disponível (vindo da API)
    if (activity.progress_percentage !== undefined) {
        return parseFloat(activity.progress_percentage);
    }
    
    const type = getMeasurementType(activity);
    
    switch (type) {
        case 'units':
            if (activity.target_value && activity.progress !== undefined) {
                const progress = Math.min((activity.progress / activity.target_value) * 100, 100);
                return Math.round(progress);
            }
            return 0;
            
        case 'percentage':
            const percentage = parseFloat(activity.manual_percentage) || 0;
            return Math.min(percentage, 100);
            
        case 'boolean':
            return activity.status === 'completed' ? 100 : 0;
            
        default:
            return 0;
    }
}

// ==============================================
// ATUALIZAR: Configurar modal de atividade - REMOVER BARRA DE PORCENTAGEM
// ==============================================

// script.js - No setupActivityModal, atualizar a parte do submit:
async function setupActivityModal() {
    await loadCategoriesForSelect();
    
    // Configurar o toggle dos campos de medição
    const measurementType = document.getElementById('activity-measurement-type');
    if (measurementType) {
        measurementType.addEventListener('change', toggleMeasurementFields);
        toggleMeasurementFields(); // Configurar estado inicial
    }
    
    const activityForm = document.getElementById('activity-form');
    if (activityForm && !activityForm.dataset.listenerAdded) {
        activityForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const measurementType = document.getElementById('activity-measurement-type').value;
            
            const formData = {
                name: document.getElementById('activity-name').value,
                description: document.getElementById('activity-description').value,
                category_id: parseInt(document.getElementById('activity-category').value),
                status: document.getElementById('activity-status').value
            };
            
            // Adicionar campos específicos baseados no tipo de medição
            switch (measurementType) {
                case 'units':
                    formData.target_value = document.getElementById('activity-target').value || null;
                    formData.target_unit = document.getElementById('activity-unit').value || null;
                    formData.measurement_type = 'units';
                    break;
                    
                case 'percentage':
                    formData.measurement_type = 'percentage';
                    // NÃO definir manual_percentage na criação - será 0 por padrão
                    break;
                    
                case 'boolean':
                    formData.measurement_type = 'boolean';
                    break;
            }
            
            try {
                const response = await fetch('/api/activities', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    closeModal('activity-modal');
                    showNotification('Atividade criada com sucesso!', 'success');
                    
                    // Atualizar as atividades
                    await refreshActivities();
                }
            } catch (error) {
                console.error('Erro ao criar atividade:', error);
                showNotification('Erro ao criar atividade', 'error');
            }
        });
        
        // Marcar que o listener foi adicionado
        activityForm.dataset.listenerAdded = 'true';
    }
}
// ==============================================
// ATUALIZAR: Carregar atividades para progresso - SEM FILTRO DE PROGRESSO
// ==============================================

async function loadActivitiesForProgress() {
    try {
        const response = await fetch('/api/activities');
        activities = await response.json();
        const select = document.getElementById('progress-activity');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione uma atividade</option>';
        activities.forEach(activity => {
            // REMOVIDO FILTRO: Mostrar todas as atividades, não apenas não completas
            // O progresso será validado durante o envio do formulário
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = `${activity.category_name} - ${activity.name}`;
            
            // Armazenar dados da atividade para validação
            option.dataset.measurementType = getMeasurementType(activity);
            option.dataset.targetValue = activity.target_value || 0;
            option.dataset.targetUnit = activity.target_unit || 'unidades';
            option.dataset.currentProgress = activity.progress || 0;
            option.dataset.manualPercentage = activity.manual_percentage || 0;
            
            select.appendChild(option);
        });
        
        // Configurar listener para atualizar interface
        setupProgressActivityListener();
        
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
        showNotification('Erro ao carregar atividades para registro de progresso', 'error');
    }
}

// ==============================================
// ATUALIZAR: Configurar modal de progresso - ADICIONAR BARRA DE PORCENTAGEM
// ==============================================

// ==============================================
// ATUALIZAR: Configurar modal de progresso - ADICIONAR BARRA DE PORCENTAGEM
// ==============================================

async function setupProgressModal() {
    await loadActivitiesForProgress();
    
    const progressForm = document.getElementById('progress-form');
    if (progressForm) {
        progressForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const activitySelect = document.getElementById('progress-activity');
            const selectedActivity = activities.find(a => a.id === parseInt(activitySelect.value));
            
            if (!selectedActivity) {
                showNotification('Selecione uma atividade válida', 'error');
                return;
            }
            
            const measurementType = getMeasurementType(selectedActivity);
            
            let formData = {
                activity_id: parseInt(activitySelect.value),
                date: document.getElementById('progress-date').value,
                notes: document.getElementById('progress-notes').value,
                measurement_type: measurementType
            };
            
            // Adicionar campos baseados no tipo de medição
            if (measurementType === 'units') {
                const progressValue = parseFloat(document.getElementById('progress-value').value);
                if (isNaN(progressValue) || progressValue <= 0) {
                    showNotification('Por favor, insira um valor válido para o progresso', 'error');
                    return;
                }
                
                formData.value = progressValue;
                formData.unit = selectedActivity.target_unit || 'unidades';
                formData.completed = document.getElementById('progress-completed').checked;
                
            } else if (measurementType === 'percentage') {
                const percentageValue = parseFloat(document.getElementById('progress-percentage').value);
                if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
                    showNotification('A porcentagem deve estar entre 0 e 100', 'error');
                    return;
                }
                
                formData.value = percentageValue;
                formData.unit = '%';
                formData.completed = percentageValue >= 100;
                
            } else if (measurementType === 'boolean') {
                formData.value = 1;
                formData.unit = 'unidades';
                formData.completed = true;
            }
            
            try {
                const response = await fetch('/api/progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    closeModal('progress-modal');
                    showNotification(
                        formData.completed 
                            ? 'Atividade marcada como completa!' 
                            : `Progresso registrado! +${result.points_earned || 0} pontos`,
                        'success'
                    );
                    
                    // Atualizar dados do dashboard
                    await refreshActivities();  // Usar refreshActivities em vez de loadRecentActivities
                    
                } else {
                    const errorData = await response.json();
                    showNotification(errorData.message || 'Erro ao registrar progresso', 'error');
                }
            } catch (error) {
                console.error('Erro ao registrar progresso:', error);
                showNotification('Erro ao registrar progresso', 'error');
            }
        });
    }
}
async function refreshActivities() {
    try {
        const response = await fetch('/api/activities');
        activities = await response.json();
        
        // Ordenar atividades
        activities = sortActivitiesByRecent(activities);
        
        // Atualizar o dashboard se estiver na página inicial
        if (window.location.pathname === '/' || window.location.pathname === '/dashboard') {
            await loadRecentActivities();
            await loadDashboardStats();
        }
        
        return activities;
    } catch (error) {
        console.error('Erro ao atualizar atividades:', error);
        return [];
    }
}
// ==============================================
// ATUALIZAR: Configurar listener para atividade no progresso
// ==============================================

// ==============================================
// ATUALIZAR: Configurar listener para atividade no progresso
// ==============================================

function setupProgressActivityListener() {
    const activitySelect = document.getElementById('progress-activity');
    if (activitySelect) {
        activitySelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const progressUnit = document.getElementById('progress-unit');
            const progressValue = document.getElementById('progress-value');
            const percentageGroup = document.getElementById('percentage-group-progress');
            const unitsGroup = document.getElementById('units-group-progress');
            const booleanGroup = document.getElementById('boolean-group-progress');
            
            if (!selectedOption.value) return;
            
            // Encontrar a atividade selecionada
            const activityId = parseInt(selectedOption.value);
            const selectedActivity = activities.find(a => a.id === activityId);
            
            if (!selectedActivity) return;
            
            const measurementType = getMeasurementType(selectedActivity);
            
            // Esconder todos os grupos primeiro
            if (percentageGroup) percentageGroup.style.display = 'none';
            if (unitsGroup) unitsGroup.style.display = 'none';
            if (booleanGroup) booleanGroup.style.display = 'none';
            
            // Atualizar interface baseada no tipo de medição
            switch (measurementType) {
                case 'units':
                    if (unitsGroup) unitsGroup.style.display = 'block';
                    if (progressUnit) {
                        progressUnit.textContent = selectedActivity.target_unit || 'unidades';
                    }
                    if (progressValue) {
                        progressValue.min = 0;
                        progressValue.max = selectedActivity.target_value || 1000;
                        progressValue.step = 1;
                        progressValue.placeholder = `Ex: 10 (valor alvo: ${selectedActivity.target_value || 0})`;
                    }
                    break;
                    
                case 'percentage':
                    if (percentageGroup) percentageGroup.style.display = 'block';
                    const percentageSlider = document.getElementById('progress-percentage');
                    const percentageValue = document.getElementById('percentage-value-progress');
                    if (percentageSlider && percentageValue) {
                        const currentPercentage = selectedActivity.manual_percentage || 0;
                        percentageSlider.value = currentPercentage;
                        percentageValue.textContent = currentPercentage + '%';
                    }
                    break;
                    
                case 'boolean':
                    if (booleanGroup) booleanGroup.style.display = 'block';
                    break;
            }
        });
    }
}

// ==============================================
// ADICIONAR: Configurar slider de porcentagem no progresso
// ==============================================

function setupPercentageSliderProgress() {
    const percentageSlider = document.getElementById('progress-percentage');
    const percentageValue = document.getElementById('percentage-value-progress');
    
    if (percentageSlider && percentageValue) {
        percentageSlider.addEventListener('input', function() {
            percentageValue.textContent = this.value + '%';
        });
    }
}

// ==============================================
// ATUALIZAR: Mostrar modal de progresso - CARREGAR ATIVIDADES
// ==============================================

function showLogProgressModal() {
    const progressModal = document.getElementById('progress-modal');
    if (progressModal) {
        document.getElementById('progress-form').reset();
        document.getElementById('progress-date').value = new Date().toISOString().split('T')[0];
        
        // Carregar atividades
        loadActivitiesForProgress();
        
        // Configurar slider de porcentagem
        setupPercentageSliderProgress();
        
        showModal('progress-modal');
    } else {
        showNotification('Funcionalidade em desenvolvimento', 'info');
    }
}
// ==============================================
// MAPA DE ATIVIDADES - FUNÇÕES CORRIGIDAS
// ==============================================

// Mapa de Atividades - FUNÇÃO PRINCIPAL CORRIGIDA
async function loadActivityMap() {
    try {
        console.log('Carregando mapa de atividades...');
        await loadActivitiesForMap();
        await updateActivityHierarchy();
        await updateActivityCategoriesView();
    } catch (error) {
        console.error('Erro ao carregar mapa de atividades:', error);
        showNotification('Erro ao carregar mapa de atividades', 'error');
    }
}

// CARREGAR ATIVIDADES PARA O MAPA - FUNÇÃO CORRIGIDA
async function loadActivitiesForMap() {
    try {
        const response = await fetch('/api/activities');
        if (!response.ok) {
            throw new Error('Erro na resposta da API');
        }
        activities = await response.json();
        console.log('Atividades carregadas para o mapa:', activities.length);
        return activities;
    } catch (error) {
        console.error('Erro ao carregar atividades para o mapa:', error);
        showNotification('Erro ao carregar atividades', 'error');
        return [];
    }
}

// Variável global para a rede
let activityNetwork = null;

async function updateActivityHierarchy() {
    try {
        const response = await fetch('/api/activities/hierarchy');
        if (!response.ok) {
            throw new Error('Erro ao carregar hierarquia');
        }
        const hierarchy = await response.json();
        
        const flowchartContainer = document.getElementById('flowchart-container');
        if (!flowchartContainer) return;
        
        flowchartContainer.innerHTML = '';
        
        if (!hierarchy || hierarchy.length === 0) {
            flowchartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-project-diagram"></i>
                    <h3>Nenhuma atividade criada</h3>
                    <p>Comece criando sua primeira atividade!</p>
                    <button class="btn btn-primary" onclick="showAddActivityMapModal()">Criar Atividade</button>
                </div>
            `;
            return;
        }
        
        // Criar container principal
        const networkContainer = document.createElement('div');
        networkContainer.id = 'network-container';
        networkContainer.style.width = '100%';
        networkContainer.style.height = '100%';
        
        // Adicionar controles
        networkContainer.innerHTML = `
            <div class="network-controls">
                <button class="control-btn" onclick="fitNetwork()" title="Ajustar à tela">
                    <i class="fas fa-compress"></i>
                </button>
                <button class="control-btn" onclick="resetNetwork()" title="Redefinir visualização">
                    <i class="fas fa-sync"></i>
                </button>
            </div>
            <div class="zoom-controls">
                <button class="control-btn" onclick="zoomIn()" title="Zoom In">
                    <i class="fas fa-search-plus"></i>
                </button>
                <button class="control-btn" onclick="zoomOut()" title="Zoom Out">
                    <i class="fas fa-search-minus"></i>
                </button>
            </div>
        `;
        
        const canvasContainer = document.createElement('div');
        canvasContainer.style.width = '100%';
        canvasContainer.style.height = '100%';
        networkContainer.appendChild(canvasContainer);
        
        flowchartContainer.appendChild(networkContainer);
        
        // Criar nós e arestas
        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();
        
        function processHierarchy(items, parentId = null, level = 0) {
            items.forEach(item => {
                // Configurar cor baseada no status
                let nodeColor = {
                    background: '#f8f9fa',
                    border: item.category_color || '#3498db',
                    highlight: {
                        background: '#e3f2fd',
                        border: item.category_color || '#3498db'
                    }
                };
                
                if (item.status === 'completed') {
                    nodeColor.background = '#d4edda';
                    nodeColor.border = '#28a745';
                } else if (item.status === 'in_progress') {
                    nodeColor.background = '#fff3cd';
                    nodeColor.border = '#ffc107';
                }
                
                // Criar label simples sem HTML
                const shortName = item.name.length > 25 ? item.name.substring(0, 22) + '...' : item.name;
                const statusText = getStatusText(item.status);
                const progress = Math.round(item.progress || 0);
                
                // Usar label simples em vez de HTML
                const label = `${shortName}\n${statusText} - ${progress}%`;
                
                nodes.add({
                    id: item.id,
                    label: label,
                    color: nodeColor,
                    shape: 'box',
                    font: { 
                        size: 14,
                        face: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                        multi: true,
                        bold: { size: 14 }
                    },
                    margin: 12,
                    widthConstraint: {
                        minimum: 120,
                        maximum: 200
                    },
                    heightConstraint: {
                        minimum: 60,
                        maximum: 80
                    },
                    shadow: true,
                    borderWidth: 2,
                    size: 25,
                    title: `
                        <div style="padding: 10px; max-width: 300px;">
                            <strong style="font-size: 16px;">${item.name}</strong><br/>
                            <strong>Categoria:</strong> ${item.category_name}<br/>
                            <strong>Status:</strong> ${statusText}<br/>
                            <strong>Progresso:</strong> ${progress}%<br/>
                            ${item.children_count > 0 ? `<strong>Sub-atividades:</strong> ${item.children_count}` : ''}
                        </div>
                    `
                });
                
                if (parentId) {
                    edges.add({
                        from: parentId,
                        to: item.id,
                        arrows: 'to',
                        color: { 
                            color: item.category_color || '#3498db', 
                            opacity: 0.6 
                        },
                        smooth: {
                            enabled: true,
                            type: 'cubicBezier',
                            roundness: 0.4
                        },
                        width: 2
                    });
                }
                
                if (item.children && item.children.length > 0) {
                    processHierarchy(item.children, item.id, level + 1);
                }
            });
        }
        
        processHierarchy(hierarchy);
        
        // Configurações da rede
        const options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'UD',
                    sortMethod: 'directed',
                    levelSeparation: 150,  // Mais espaço entre níveis
                    nodeSpacing: 120,      // Mais espaço entre nós
                    treeSpacing: 200       // Mais espaço entre árvores
                }
            },
            physics: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                hoverConnectedEdges: false,
                selectable: true,
                selectConnectedEdges: false,
                navigationButtons: false,
                keyboard: {
                    enabled: true,
                    speed: { x: 10, y: 10, zoom: 0.02 },
                    bindToWindow: true
                },
                tooltipDelay: 200
            },
            nodes: {
                shape: 'box',
                margin: 12,
                widthConstraint: {
                    minimum: 120,
                    maximum: 200
                },
                heightConstraint: {
                    minimum: 60,
                    maximum: 80
                },
                shadow: true,
                font: {
                    size: 14,
                    face: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                    multi: true,
                    bold: { size: 14 }
                },
                borderWidth: 2,
                borderWidthSelected: 3
            },
            edges: {
                smooth: {
                    enabled: true,
                    type: 'cubicBezier',
                    roundness: 0.4
                },
                shadow: true,
                width: 2,
                color: {
                    color: '#cccccc',
                    highlight: '#3498db',
                    opacity: 0.6
                },
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.8
                    }
                }
            },
            manipulation: {
                enabled: false
            }
        };
        
        // Criar a rede
        const data = { nodes, edges };
        activityNetwork = new vis.Network(canvasContainer, data, options);
        
        // Adicionar evento de clique nos nós
        activityNetwork.on("click", function(params) {
            if (params.nodes.length > 0) {
                const activityId = params.nodes[0];
                showActivityDetail(activityId);
            }
        });
        
        // Adicionar evento de duplo clique para zoom
        activityNetwork.on("doubleClick", function(params) {
            if (params.nodes.length > 0) {
                activityNetwork.focus(params.nodes[0], { scale: 1.2, animation: true });
            }
        });
        
        // Ajustar a visualização após um curto delay
        setTimeout(() => {
            fitNetwork();
        }, 500);
        
    } catch (error) {
        console.error('Erro ao carregar hierarquia de atividades:', error);
        const flowchartContainer = document.getElementById('flowchart-container');
        if (flowchartContainer) {
            flowchartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar hierarquia</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadActivityMap()">Tentar Novamente</button>
                </div>
            `;
        }
    }
}
// Funções de controle da rede
function fitNetwork() {
    if (activityNetwork) {
        activityNetwork.fit({ animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
    }
}

function resetNetwork() {
    if (activityNetwork) {
        activityNetwork.setOptions({
            physics: { enabled: true }
        });
        setTimeout(() => {
            activityNetwork.setOptions({
                physics: { enabled: false }
            });
            fitNetwork();
        }, 500);
    }
}

function zoomIn() {
    if (activityNetwork) {
        const scale = activityNetwork.getScale();
        activityNetwork.moveTo({
            scale: Math.min(scale * 1.3, 2.0), // Limite máximo de zoom
            animation: true
        });
    }
}

function zoomOut() {
    if (activityNetwork) {
        const scale = activityNetwork.getScale();
        activityNetwork.moveTo({
            scale: Math.max(scale * 0.7, 0.1), // Limite mínimo de zoom
            animation: true
        });
    }
}

// Adicionar suporte a teclado
document.addEventListener('keydown', function(event) {
    if (!activityNetwork) return;
    
    switch(event.key) {
        case '+':
        case '=':
            event.preventDefault();
            zoomIn();
            break;
        case '-':
            event.preventDefault();
            zoomOut();
            break;
        case '0':
            event.preventDefault();
            fitNetwork();
            break;
    }
});

// FUNÇÕES AUXILIARES PARA MANIPULAR CORES
function lightenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return "#" + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

function darkenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return "#" + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}
// ATUALIZAR VISUALIZAÇÃO POR CATEGORIA - VERSÃO COMPLETA MODIFICADA
async function updateActivityCategoriesView() {
    try {
        const categoriesResponse = await fetch('/api/categories');
        if (!categoriesResponse.ok) {
            throw new Error('Erro ao carregar categorias');
        }
        const categories = await categoriesResponse.json();
        
        // Carregar atividades com informações de agendamento
        const activitiesResponse = await fetch('/api/activities');
        if (!activitiesResponse.ok) {
            throw new Error('Erro ao carregar atividades');
        }
        const currentActivities = await activitiesResponse.json();
        
        // Carregar agendamentos para verificar quais atividades estão no calendário
        const weekStart = getWeekStart(new Date());
        const year = weekStart.getFullYear();
        const month = String(weekStart.getMonth() + 1).padStart(2, '0');
        const day = String(weekStart.getDate()).padStart(2, '0');
        const weekStartStr = `${year}-${month}-${day}`;
        
        const schedulesResponse = await fetch(`/api/schedules?week_start=${weekStartStr}`);
        let scheduledActivities = [];
        if (schedulesResponse.ok) {
            scheduledActivities = await schedulesResponse.json();
        }
        
        const categoriesGrid = document.getElementById('categories-activity-grid');
        if (!categoriesGrid) return;
        
        categoriesGrid.innerHTML = '';
        
        if (categories.length === 0) {
            categoriesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder"></i>
                    <h3>Nenhuma categoria encontrada</h3>
                    <p>Crie categorias primeiro para organizar suas atividades.</p>
                    <button class="btn btn-primary" onclick="showAddCategoryModal()">Criar Categoria</button>
                </div>
            `;
            return;
        }
        
        categories.forEach(category => {
            const categoryActivities = currentActivities.filter(a => a.category_id === category.id);
            
            const categoryElement = document.createElement('div');
            categoryElement.className = 'category-activity-group fade-in';
            categoryElement.innerHTML = `
                <div class="category-activity-header" style="border-left-color: ${category.color}">
                    <span class="category-icon">${category.icon}</span>
                    <h3>${category.name}</h3>
                    <span class="activity-count">${categoryActivities.length} atividades</span>
                </div>
                <div class="category-activities">
                    ${categoryActivities.length > 0 ? 
                        categoryActivities.map(activity => {
                            const progress = activity.progress || 0;
                            const isCompleted = progress >= 100;
                            
                            // Verificar se a atividade está agendada
                            const isScheduled = scheduledActivities.some(schedule => 
                                schedule.activity_id === activity.id
                            );
                            
                            // APLICAR ESQUEMA DE CORES
                            let backgroundColor = 'white'; // padrão: fora do calendário
                            let textColor = '#333';
                            
                            if (isScheduled) {
                                if (isCompleted) {
                                    // Atividade agendada e completada - cor mais escura
                                    backgroundColor = darkenColor(activity.category_color || '#3498db', 30);
                                    textColor = 'white';
                                } else {
                                    // Atividade agendada mas não completada - cor mais clara
                                    backgroundColor = lightenColor(activity.category_color || '#3498db', 40);
                                    textColor = '#333';
                                }
                            }
                            // Se não está agendada, mantém fundo branco
                            
                            return `
                                <div class="activity-map-card" 
                                     onclick="showActivityDetail(${activity.id})"
                                     style="background-color: ${backgroundColor}; color: ${textColor}; border-left: 4px solid ${activity.category_color}">
                                    <div class="activity-map-info">
                                        <h4>${activity.name}</h4>
                                        <div class="activity-map-meta">
                                            <span class="progress-percentage">${Math.round(progress)}%</span>
                                        </div>
                                    </div>
                                    <div class="activity-map-actions">
                                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editActivityMap(${activity.id})">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); deleteActivityMap(${activity.id})">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('') : 
                        '<div class="empty-category">Nenhuma atividade nesta categoria</div>'
                    }
                </div>
            `;
            categoriesGrid.appendChild(categoryElement);
        });
        
    } catch (error) {
        console.error('Erro ao carregar visualização por categoria:', error);
        const categoriesGrid = document.getElementById('categories-activity-grid');
        if (categoriesGrid) {
            categoriesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar categorias</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// ATUALIZAR HIERARQUIA (FLUXOGRAMA) - VERSÃO COMPLETA MODIFICADA
async function updateActivityHierarchy() {
    try {
        const response = await fetch('/api/activities/hierarchy');
        if (!response.ok) {
            throw new Error('Erro ao carregar hierarquia');
        }
        const hierarchy = await response.json();
        
        // Carregar agendamentos para verificar quais atividades estão no calendário
        const weekStart = getWeekStart(new Date());
        const year = weekStart.getFullYear();
        const month = String(weekStart.getMonth() + 1).padStart(2, '0');
        const day = String(weekStart.getDate()).padStart(2, '0');
        const weekStartStr = `${year}-${month}-${day}`;
        
        const schedulesResponse = await fetch(`/api/schedules?week_start=${weekStartStr}`);
        let scheduledActivities = [];
        if (schedulesResponse.ok) {
            scheduledActivities = await schedulesResponse.json();
        }
        
        const flowchartContainer = document.getElementById('flowchart-container');
        if (!flowchartContainer) return;
        
        flowchartContainer.innerHTML = '';
        
        if (!hierarchy || hierarchy.length === 0) {
            flowchartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-project-diagram"></i>
                    <h3>Nenhuma atividade criada</h3>
                    <p>Comece criando sua primeira atividade!</p>
                    <button class="btn btn-primary" onclick="showAddActivityMapModal()">Criar Atividade</button>
                </div>
            `;
            return;
        }
        
        // Criar container principal
        const networkContainer = document.createElement('div');
        networkContainer.id = 'network-container';
        networkContainer.style.width = '100%';
        networkContainer.style.height = '100%';
        
        // Adicionar controles
        networkContainer.innerHTML = `
            <div class="network-controls">
                <button class="control-btn" onclick="fitNetwork()" title="Ajustar à tela">
                    <i class="fas fa-compress"></i>
                </button>
                <button class="control-btn" onclick="resetNetwork()" title="Redefinir visualização">
                    <i class="fas fa-sync"></i>
                </button>
            </div>
            <div class="zoom-controls">
                <button class="control-btn" onclick="zoomIn()" title="Zoom In">
                    <i class="fas fa-search-plus"></i>
                </button>
                <button class="control-btn" onclick="zoomOut()" title="Zoom Out">
                    <i class="fas fa-search-minus"></i>
                </button>
            </div>
        `;
        
        const canvasContainer = document.createElement('div');
        canvasContainer.style.width = '100%';
        canvasContainer.style.height = '100%';
        networkContainer.appendChild(canvasContainer);
        
        flowchartContainer.appendChild(networkContainer);
        
        // Criar nós e arestas
        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();
        
        const processHierarchy = (items, parentId = null, level = 0) => {
            items.forEach(item => {
                const progress = item.progress || 0;
                const isCompleted = progress >= 100;
                
                // Verificar se a atividade está agendada
                const isScheduled = scheduledActivities.some(schedule => 
                    schedule.activity_id === item.id
                );
                
                // APLICAR ESQUEMA DE CORES
                let backgroundColor = 'white'; // padrão: fora do calendário
                let borderColor = item.category_color || '#3498db';
                
                if (isScheduled) {
                    if (isCompleted) {
                        // Atividade agendada e completada - cor mais escura
                        backgroundColor = darkenColor(item.category_color || '#3498db', 30);
                        borderColor = darkenColor(item.category_color || '#3498db', 30);
                    } else {
                        // Atividade agendada mas não completada - cor mais clara
                        backgroundColor = lightenColor(item.category_color || '#3498db', 40);
                        borderColor = item.category_color || '#3498db';
                    }
                }
                
                let nodeColor = {
                    background: backgroundColor,
                    border: borderColor,
                    highlight: {
                        background: '#e3f2fd',
                        border: borderColor
                    }
                };
                
                // Criar label - APENAS NOME E PORCENTAGEM
                const shortName = item.name.length > 25 ? item.name.substring(0, 22) + '...' : item.name;
                const label = `${shortName}\n${Math.round(progress)}%`;
                
                nodes.add({
                    id: item.id,
                    label: label,
                    color: nodeColor,
                    shape: 'box',
                    font: { 
                        size: 14,
                        face: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                        multi: true
                    },
                    margin: 12,
                    widthConstraint: {
                        minimum: 120,
                        maximum: 200
                    },
                    heightConstraint: {
                        minimum: 60,
                        maximum: 80
                    },
                    shadow: true,
                    borderWidth: 2,
                    size: 25,
                    title: `
                        <div style="padding: 10px; max-width: 300px;">
                            <strong style="font-size: 16px;">${item.name}</strong><br/>
                            <strong>Progresso:</strong> ${Math.round(progress)}%<br/>
                            <strong>Agendada:</strong> ${isScheduled ? 'Sim' : 'Não'}<br/>
                            ${item.children_count > 0 ? `<strong>Sub-atividades:</strong> ${item.children_count}` : ''}
                        </div>
                    `
                });
                
                if (parentId) {
                    edges.add({
                        from: parentId,
                        to: item.id,
                        arrows: 'to',
                        color: { 
                            color: item.category_color || '#3498db', 
                            opacity: 0.6 
                        },
                        smooth: {
                            enabled: true,
                            type: 'cubicBezier',
                            roundness: 0.4
                        },
                        width: 2
                    });
                }
                
                if (item.children && item.children.length > 0) {
                    processHierarchy(item.children, item.id, level + 1);
                }
            });
        };
        
        processHierarchy(hierarchy);
        
        // Configurações da rede
        const options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'UD',
                    sortMethod: 'directed',
                    levelSeparation: 150,
                    nodeSpacing: 120,
                    treeSpacing: 200
                }
            },
            physics: {
                enabled: false
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                hoverConnectedEdges: false,
                selectable: true,
                selectConnectedEdges: false,
                navigationButtons: false,
                keyboard: {
                    enabled: true,
                    speed: { x: 10, y: 10, zoom: 0.02 },
                    bindToWindow: true
                },
                tooltipDelay: 200
            },
            nodes: {
                shape: 'box',
                margin: 12,
                widthConstraint: {
                    minimum: 120,
                    maximum: 200
                },
                heightConstraint: {
                    minimum: 60,
                    maximum: 80
                },
                shadow: true,
                font: {
                    size: 14,
                    face: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                    multi: true
                },
                borderWidth: 2,
                borderWidthSelected: 3
            },
            edges: {
                smooth: {
                    enabled: true,
                    type: 'cubicBezier',
                    roundness: 0.4
                },
                shadow: true,
                width: 2,
                color: {
                    color: '#cccccc',
                    highlight: '#3498db',
                    opacity: 0.6
                },
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.8
                    }
                }
            },
            manipulation: {
                enabled: false
            }
        };
        
        // Criar a rede
        const data = { nodes, edges };
        activityNetwork = new vis.Network(canvasContainer, data, options);
        
        // Adicionar evento de clique nos nós
        activityNetwork.on("click", function(params) {
            if (params.nodes.length > 0) {
                const activityId = params.nodes[0];
                showActivityDetail(activityId);
            }
        });
        
        // Adicionar evento de duplo clique para zoom
        activityNetwork.on("doubleClick", function(params) {
            if (params.nodes.length > 0) {
                activityNetwork.focus(params.nodes[0], { scale: 1.2, animation: true });
            }
        });
        
        // Ajustar a visualização após um curto delay
        setTimeout(() => {
            fitNetwork();
        }, 500);
        
    } catch (error) {
        console.error('Erro ao carregar hierarquia de atividades:', error);
        const flowchartContainer = document.getElementById('flowchart-container');
        if (flowchartContainer) {
            flowchartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar hierarquia</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadActivityMap()">Tentar Novamente</button>
                </div>
            `;
        }
    }
}

// FUNÇÕES DE CONTROLE DA REDE (mantidas do código original)
function fitNetwork() {
    if (activityNetwork) {
        activityNetwork.fit({ animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
    }
}

function resetNetwork() {
    if (activityNetwork) {
        activityNetwork.setOptions({
            physics: { enabled: true }
        });
        setTimeout(() => {
            activityNetwork.setOptions({
                physics: { enabled: false }
            });
            fitNetwork();
        }, 500);
    }
}

function zoomIn() {
    if (activityNetwork) {
        const scale = activityNetwork.getScale();
        activityNetwork.moveTo({
            scale: Math.min(scale * 1.3, 2.0),
            animation: true
        });
    }
}

function zoomOut() {
    if (activityNetwork) {
        const scale = activityNetwork.getScale();
        activityNetwork.moveTo({
            scale: Math.max(scale * 0.7, 0.1),
            animation: true
        });
    }
}

// FUNÇÃO getWeekStart (necessária para carregar agendamentos)
function getWeekStart(date) {
    const start = new Date(date);
    const day = start.getDay();
    
    let diff = start.getDate() - day;
    
    if (day === 0) {
        diff -= 6;
    } else {
        diff += 1;
    }
    
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    
    return start;
}

function showActivityView(view) {
    document.querySelectorAll('.view-controls .btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.activity-view-content').forEach(content => content.style.display = 'none');
    
    event.target.classList.add('active');
    
    if (view === 'flowchart') {
        document.getElementById('flowchart-view').style.display = 'block';
    } else {
        document.getElementById('categories-view').style.display = 'block';
    }
}

function showAddActivityMapModal() {
    const modalTitle = document.getElementById('activity-map-modal-title');
    const activityForm = document.getElementById('activity-map-form');
    const activityId = document.getElementById('activity-map-id');
    const categorySelect = document.getElementById('activity-map-category');
    const parentSelect = document.getElementById('activity-map-parent');
    
    if (modalTitle && activityForm && activityId && categorySelect && parentSelect) {
        modalTitle.textContent = 'Nova Atividade';
        activityForm.reset();
        activityId.value = '';
        
        // Carregar categorias e atividades para os selects
        loadCategoriesForActivitySelect();
        loadActivitiesForParentSelect();
        
        showModal('activity-map-modal');
    }
}

async function loadCategoriesForActivitySelect() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        const select = document.getElementById('activity-map-category');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Selecione uma categoria</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar categorias para select:', error);
    }
}

// FUNÇÃO AUXILIAR PARA CARREGAR ATIVIDADES PARA SELECT DO MODAL
async function loadActivitiesForParentSelect(excludeActivityId = null) {
    try {
        const response = await fetch('/api/activities');
        if (!response.ok) throw new Error('Erro ao carregar atividades');
        
        const allActivities = await response.json();
        const parentSelect = document.getElementById('activity-map-parent');
        
        if (!parentSelect) return;
        
        // Manter a primeira opção "Nenhuma"
        parentSelect.innerHTML = '<option value="">Nenhuma (Atividade Principal)</option>';
        
        allActivities.forEach(activity => {
            // Não permitir que uma atividade seja pai dela mesma
            if (excludeActivityId && activity.id === excludeActivityId) return;
            
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = `${activity.category_name} - ${activity.name}`;
            parentSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar atividades para select:', error);
    }
}

async function showActivityDetail(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}`);
        if (!response.ok) throw new Error('Erro ao carregar detalhes da atividade');

        const activity = await response.json();
        
        // ADICIONE ESTA LINHA: Armazenar a atividade atual
        window.currentActivityDetail = activity;

        const modalTitle = document.getElementById('activity-detail-title');
        const modalContent = document.getElementById('activity-detail-content');

        modalTitle.textContent = activity.name;
        
        const progress = activity.progress || 0;
        const progressClass = progress >= 100 ? 'completed' : progress >= 75 ? 'high' : progress >= 50 ? 'medium' : 'low';
        
        modalContent.innerHTML = `
            <div class="activity-detail-header">
                <div class="activity-category-badge" style="background-color: ${activity.category_color}">
                    ${activity.category_name}
                </div>
                <div class="activity-progress-large">
                    <div class="progress-bar">
                        <div class="progress-fill ${progressClass}" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${Math.round(progress)}% completo</span>
                </div>
            </div>
            
            <div class="activity-detail-content">
                <div class="detail-section">
                    <h4>Descrição</h4>
                    <p>${activity.description || 'Sem descrição'}</p>
                </div>
                
                <div class="detail-section">
                    <h4>Status</h4>
                    <span class="activity-status-badge ${activity.status}">${getStatusText(activity.status)}</span>
                </div>
                
                ${activity.parent_name ? `
                <div class="detail-section">
                    <h4>Atividade Pai</h4>
                    <p>${activity.parent_name}</p>
                </div>
                ` : ''}
                
                ${activity.target_value ? `
                <div class="detail-section">
                    <h4>Meta</h4>
                    <p>${activity.target_value} ${activity.target_unit}</p>
                </div>
                ` : ''}
                
                <div class="detail-section">
                    <h4>Sub-atividades (${activity.children.length})</h4>
                    ${activity.children.length > 0 ? `
                        <ul class="children-list">
                            ${activity.children.map(child => `
                                <li class="child-activity ${child.status}">
                                    <span>${child.name}</span>
                                    <span class="child-status">
                                        ${getStatusText(child.status)} - Progresso: ${child.progress || 0}%
                                    </span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p>Nenhuma sub-atividade</p>'}
                </div>
            </div>
            
            <div class="form-actions">
                <button class="btn btn-primary" onclick="editActivityMap(${activity.id})">Editar</button>
                <button class="btn btn-outline" onclick="closeModal('activity-detail-modal')">Fechar</button>
            </div>
        `;

        showModal('activity-detail-modal');
    } catch (error) {
        console.error('Erro ao carregar detalhes da atividade:', error);
        showNotification('Erro ao carregar detalhes da atividade', 'error');
    }
}
// ATUALIZAR A FUNÇÃO editActivityMap PARA CARREGAR CORRETAMENTE
async function editActivityMap(activityId) {
    try {
        const response = await fetch(`/api/activities/${activityId}`);
        if (!response.ok) throw new Error('Erro ao carregar atividade');
        
        const activity = await response.json();

        const modalTitle = document.getElementById('activity-map-modal-title');
        const activityIdInput = document.getElementById('activity-map-id');
        const activityName = document.getElementById('activity-map-name');
        const activityDescription = document.getElementById('activity-map-description');
        const activityCategory = document.getElementById('activity-map-category');
        const activityParent = document.getElementById('activity-map-parent');
        const activityStatus = document.getElementById('activity-map-status');
        const activityTarget = document.getElementById('activity-map-target');
        const activityUnit = document.getElementById('activity-map-unit');
        
        if (modalTitle && activityIdInput && activityName && activityDescription && 
            activityCategory && activityParent && activityStatus && activityTarget && activityUnit) {
            
            modalTitle.textContent = 'Editar Atividade';
            activityIdInput.value = activity.id;
            activityName.value = activity.name;
            activityDescription.value = activity.description || '';
            activityCategory.value = activity.category_id;
            activityStatus.value = activity.status;
            activityTarget.value = activity.target_value || '';
            activityUnit.value = activity.target_unit || 'unidades';
            
            // Carregar categorias
            await loadCategoriesForActivitySelect();
            
            // Carregar atividades pai (excluindo a própria atividade)
            await loadActivitiesForParentSelect(activityId);
            
            // Selecionar o pai correto
            activityParent.value = activity.parent_activity_id || '';
            
            showModal('activity-map-modal');
        }
    } catch (error) {
        console.error('Erro ao carregar atividade para edição:', error);
        showNotification('Erro ao carregar atividade', 'error');
    }
}

async function deleteActivityMap(activityId) {
    if (!confirm('Tem certeza que deseja excluir esta atividade? Esta ação não pode ser desfeita.')) return;
    
    try {
        const response = await fetch(`/api/activities/${activityId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadActivityMap();
            showNotification('Atividade excluída com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao excluir atividade:', error);
        showNotification('Erro ao excluir atividade', 'error');
    }
}

// Formulário de Atividade do Mapa
const activityMapForm = document.getElementById('activity-map-form');
if (activityMapForm) {
    activityMapForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('activity-map-name').value,
            description: document.getElementById('activity-map-description').value,
            category_id: parseInt(document.getElementById('activity-map-category').value),
            parent_activity_id: document.getElementById('activity-map-parent').value || null,
            status: document.getElementById('activity-map-status').value,
            target_value: document.getElementById('activity-map-target').value || null,
            target_unit: document.getElementById('activity-map-unit').value || null
        };
        
        const activityId = document.getElementById('activity-map-id').value;
        
        try {
            const url = activityId ? `/api/activities/${activityId}` : '/api/activities';
            const method = activityId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                closeModal('activity-map-modal');
                loadActivityMap();
                showNotification(
                    activityId ? 'Atividade atualizada com sucesso!' : 'Atividade criada com sucesso!',
                    'success'
                );
            }
        } catch (error) {
            console.error('Erro ao salvar atividade:', error);
            showNotification('Erro ao salvar atividade', 'error');
        }
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Fechar modais ao clicar no botão de fechar
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Inicializar campos condicionais do formulário de recompensa
    const rewardCondition = document.getElementById('reward-condition');
    if (rewardCondition) {
        rewardCondition.addEventListener('change', toggleConditionFields);
    }
    
    // Carregar dados iniciais baseado na página atual
    const path = window.location.pathname;
    
    if (path === '/categories' || path === '/') {
        loadCategories();
    }
    
    if (path === '/rewards' || path === '/') {
        loadRewards();
    }
    
    if (path === '/activity_map') {
        loadActivityMap();
    }
    
    if (path === '/') {
        loadDashboardStats();
        loadRecentActivities();
        setupActivityModal();
        setupProgressModal();
    }
    
    // Configurar modais específicos (se existirem na página)
    const activityMapModal = document.getElementById('activity-map-modal');
    if (activityMapModal) {
        activityMapModal.querySelector('.close').addEventListener('click', function() {
            closeModal('activity-map-modal');
        });
    }
    
    const activityDetailModal = document.getElementById('activity-detail-modal');
    if (activityDetailModal) {
        activityDetailModal.querySelector('.close').addEventListener('click', function() {
            closeModal('activity-detail-modal');
        });
    }
});
// Função para garantir ordenação por data de criação (ID decrescente)
function sortActivitiesByRecent(activities) {
    return [...activities].sort((a, b) => {
        // Primeiro tenta ordenar por data de criação se disponível
        if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
        }
        // Fallback para ordenação por ID
        return b.id - a.id;
    });
}