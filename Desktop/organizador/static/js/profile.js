// profile.js - ATUALIZADO COM API REAL
let profileData = null;
let charts = {};
let lastUpdated = null;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    loadProfileData();
    
    // Atualizar periodicamente (a cada 5 minutos)
    setInterval(loadProfileData, 300000);
    
    // Configurar modal
    const profileModal = document.getElementById('profile-details-modal');
    if (profileModal) {
        profileModal.querySelector('.close').addEventListener('click', function() {
            closeModal('profile-details-modal');
        });
    }
});

async function loadProfileData() {
    try {
        showLoadingState();
        
        // Carregar dados completos do perfil da API REAL
        const response = await fetch('/api/profile/complete');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        // DEBUG: Verifique os dados recebidos
        console.log('Dados recebidos da API:', data);
        
        if (!data || data.error) {
            throw new Error(data?.error || 'Dados vazios recebidos da API');
        }
        
        profileData = data;
        lastUpdated = new Date();
        
        // Processar e exibir dados
        const success = processProfileData(data);
        
        if (success) {
            updateAISummary(data);
            updateMetrics(data);
            updateAnalysisTabs(data);
            generateRecommendations(data);
            
            showNotification('Análise atualizada com sucesso!', 'success');
            
            // Atualizar status do perfil
            updateProfileStatusComplete();
        } else {
            throw new Error('Falha ao processar dados do perfil');
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados do perfil:', error);
        console.error('Stack trace:', error.stack);
        
        // Verificar se temos dados de fallback no localStorage
        const fallbackData = localStorage.getItem('profile_fallback_data');
        if (fallbackData) {
            showNotification('Usando dados em cache', 'warning');
            useCachedData(JSON.parse(fallbackData));
        } else {
            showNotification('Erro ao carregar análise. Usando dados de exemplo...', 'error');
            loadSampleData();
        }
    }
}

function showLoadingState() {
    const elements = [
        'consistency-score', 'diversification-score', 'completion-rate', 'efficiency-score',
        'consistency-details', 'diversification-details', 'completion-details', 'efficiency-details',
        'ai-summary', 'current-streak', 'most-productive-day', 'weekly-avg',
        'active-categories', 'main-category', 'neglected-category',
        'created-tasks', 'scheduled-tasks', 'scheduling-rate',
        'calendar-completion', 'on-time-tasks', 'late-tasks', 'not-started-tasks'
    ];
    
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '...';
    });
    
    document.getElementById('profile-status').innerHTML = 
        '<span class="status-badge loading">Analisando dados...</span>';
    
    document.getElementById('ai-summary').innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Analisando seus padrões de produtividade...</p>
        </div>
    `;
}

function processProfileData(data) {
    try {
        console.log('Processando dados do perfil:', data);
        
        if (!data || (!data.basic && !data.profile)) {
            console.error('Dados do perfil incompletos ou estrutura inválida');
            return false;
        }
        
        // Verificar estrutura dos dados
        const basic = data.basic || data.profile || {};
        const enhanced = data.enhanced || {};
        const activities = data.activities || [];
        const patterns = data.time_patterns || {};
        
        console.log('Dados básicos:', basic);
        console.log('Atividades:', activities.length);
        
        // Atualizar status do perfil
        updateProfileStatus(basic);
        
        // Calcular métricas derivadas
        const derivedMetrics = calculateDerivedMetrics(basic, activities, enhanced);
        
        // Armazenar para uso posterior
        profileData = {
            ...data,
            derived: derivedMetrics
        };
        
        // Salvar no localStorage como fallback
        localStorage.setItem('profile_fallback_data', JSON.stringify(profileData));
        
        return true;
        
    } catch (error) {
        console.error('Erro em processProfileData:', error);
        return false;
    }
}

function calculateDerivedMetrics(basic, activities, enhanced) {
    try {
        const metrics = {
            consistency: {
                score: basic.consistency_score || 0,
                streak: basic.current_streak || 0,
                weeklyAverage: 0,
                bestDay: basic.patterns?.most_productive_day || '--'
            },
            diversification: {
                score: calculateDiversificationScore(basic),
                activeCategories: 0,
                mainCategory: basic.patterns?.favorite_category || '--',
                neglectedCategory: '--',
                categoryBalance: 0
            },
            completion: {
                rate: basic.patterns?.completion_rate || 0,
                scheduledVsCreated: 0,
                onTimeRate: 0,
                averageCompletionDays: basic.avg_completion_days || 0
            },
            efficiency: {
                score: basic.productivity_score || 0,
                timePerTask: 0,
                peakHours: '--',
                focusScore: 0
            }
        };
        
        // Calcular diversificação
        if (basic.category_time && Array.isArray(basic.category_time) && basic.category_time.length > 0) {
            metrics.diversification.activeCategories = basic.category_time.length;
            metrics.diversification.categoryBalance = calculateCategoryBalance(basic.category_time);
            
            // Encontrar categoria negligenciada
            const neglected = findNeglectedCategory(basic.category_time, activities);
            metrics.diversification.neglectedCategory = neglected;
        } else {
            // Usar valores padrão se não houver dados
            metrics.diversification.score = 50;
            metrics.diversification.activeCategories = 0;
            metrics.diversification.neglectedCategory = '--';
        }
        
        // Calcular relação tarefas criadas vs agendadas
        if (basic.total_activities && basic.priority_metrics) {
            const created = basic.total_activities;
            const scheduled = basic.priority_metrics.month || basic.priority_metrics?.month || 0;
            metrics.completion.scheduledVsCreated = scheduled > 0 ? 
                Math.round((scheduled / created) * 100) : 0;
        }
        
        return metrics;
        
    } catch (error) {
        console.error('Erro em calculateDerivedMetrics:', error);
        return {
            consistency: { score: 0, streak: 0, weeklyAverage: 0, bestDay: '--' },
            diversification: { score: 0, activeCategories: 0, mainCategory: '--', neglectedCategory: '--', categoryBalance: 0 },
            completion: { rate: 0, scheduledVsCreated: 0, onTimeRate: 0, averageCompletionDays: 0 },
            efficiency: { score: 0, timePerTask: 0, peakHours: '--', focusScore: 0 }
        };
    }
}

function calculateDiversificationScore(basic) {
    if (!basic.category_time || !Array.isArray(basic.category_time) || basic.category_time.length === 0) {
        return 50; // Score médio quando não há dados
    }
    
    // Score baseado no número de categorias e distribuição
    const maxCategories = 8; // Número ideal de categorias
    const categoryCount = basic.category_time.length;
    
    // Pontuação por número de categorias (0-50 pontos)
    const countScore = Math.min((categoryCount / maxCategories) * 50, 50);
    
    // Pontuação por equilíbrio (0-50 pontos)
    const balanceScore = calculateCategoryBalance(basic.category_time) * 50;
    
    return Math.round(countScore + balanceScore);
}

function calculateCategoryBalance(categoryTime) {
    if (!categoryTime || !Array.isArray(categoryTime) || categoryTime.length < 2) return 0;
    
    // Extrair apenas horas numéricas
    const hoursArray = categoryTime.map(cat => {
        const hours = cat.hours || cat.total_hours || 0;
        return typeof hours === 'number' ? hours : 0;
    });
    
    const totalHours = hoursArray.reduce((sum, hours) => sum + hours, 0);
    if (totalHours === 0) return 0;
    
    // Calcular desvio padrão normalizado
    const percentages = hoursArray.map(hours => (hours / totalHours) * 100);
    const mean = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const variance = percentages.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / percentages.length;
    const stdDev = Math.sqrt(variance);
    
    // Quanto menor o desvio padrão, mais balanceado
    // Normalizar para 0-1 (1 = perfeitamente balanceado)
    const maxStdDev = 50; // Desvio padrão máximo esperado
    const balance = Math.max(0, 1 - (stdDev / maxStdDev));
    
    return balance;
}

function findNeglectedCategory(categoryTime, activities) {
    if (!categoryTime || !Array.isArray(categoryTime) || categoryTime.length === 0) return '--';
    
    try {
        // Encontrar categoria com menos tempo dedicado recentemente
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        // Filtrar atividades recentes por categoria
        const recentActivitiesByCategory = {};
        
        // Usar a estrutura correta das atividades da API
        activities.forEach(activity => {
            const activityDate = activity.created_at ? new Date(activity.created_at) : new Date();
            if (activityDate > oneWeekAgo) {
                const category = activity.category_name || activity.category || 'Geral';
                recentActivitiesByCategory[category] = (recentActivitiesByCategory[category] || 0) + 1;
            }
        });
        
        // Encontrar categoria com tempo mas sem atividades recentes
        let mostNeglected = categoryTime[0].category || categoryTime[0].name || '--';
        let minRecentActivities = Infinity;
        
        categoryTime.forEach(cat => {
            const categoryName = cat.category || cat.name;
            const recentCount = recentActivitiesByCategory[categoryName] || 0;
            const hours = cat.hours || cat.total_hours || 0;
            
            if (recentCount < minRecentActivities && hours > 0) {
                minRecentActivities = recentCount;
                mostNeglected = categoryName;
            }
        });
        
        return mostNeglected;
        
    } catch (error) {
        console.error('Erro em findNeglectedCategory:', error);
        return '--';
    }
}

function updateProfileStatus(basic) {
    const statusEl = document.getElementById('profile-status');
    if (!statusEl) return;
    
    const score = basic.productivity_score || 0;
    let status = 'beginner';
    let color = '#e74c3c';
    let text = 'Iniciante';
    
    if (score >= 80) {
        status = 'expert';
        color = '#2ecc71';
        text = 'Especialista';
    } else if (score >= 60) {
        status = 'intermediate';
        color = '#3498db';
        text = 'Intermediário';
    } else if (score >= 40) {
        status = 'learner';
        color = '#f39c12';
        text = 'Aprendiz';
    }
    
    statusEl.innerHTML = `
        <span class="status-badge" style="background: ${color}20; color: ${color}; border-color: ${color}">
            <i class="fas fa-${getStatusIcon(status)}"></i> ${text}
        </span>
    `;
}

function updateProfileStatusComplete() {
    const statusEl = document.getElementById('profile-status');
    if (!statusEl) return;
    
    const timeStr = lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '';
    
    statusEl.innerHTML = `
        <span class="status-badge" style="background: #2ecc7120; color: #2ecc71; border-color: #2ecc71">
            <i class="fas fa-check-circle"></i> Análise completa
        </span>
        <small style="display: block; margin-top: 5px; color: #666;">
            Atualizado em: ${timeStr}
        </small>
    `;
}

function getStatusIcon(status) {
    const icons = {
        expert: 'crown',
        intermediate: 'star',
        learner: 'graduation-cap',
        beginner: 'seedling'
    };
    return icons[status] || 'user';
}

function updateAISummary(data) {
    const summaryEl = document.getElementById('ai-summary');
    if (!summaryEl) return;
    
    const basic = data.basic || data.profile || {};
    const metrics = profileData?.derived || {};
    
    // Gerar resumo baseado nos dados
    const summary = generateAISummary(basic, metrics);
    
    summaryEl.innerHTML = `
        <div class="ai-insight">
            <p>${summary.main}</p>
            ${summary.details ? `<p class="ai-details">${summary.details}</p>` : ''}
            ${summary.tip ? `<div class="ai-tip"><strong>Dica:</strong> ${summary.tip}</div>` : ''}
        </div>
    `;
}

function generateAISummary(basic, metrics) {
    const consistency = metrics.consistency?.score || 0;
    const completion = metrics.completion?.rate || 0;
    const efficiency = basic.productivity_score || 0;
    
    let main = '';
    let details = '';
    let tip = '';
    
    // Análise baseada nos scores
    if (consistency >= 80 && completion >= 80) {
        main = 'Você demonstra excelente consistência e cumpre a maioria das tarefas. Seu perfil é de alto desempenho!';
        details = `Sua sequência de ${metrics.consistency.streak} dias e taxa de conclusão de ${completion}% são impressionantes.`;
        tip = 'Considere desafios mais complexos para manter o engajamento.';
    } 
    else if (consistency >= 60 && completion >= 60) {
        main = 'Bom trabalho! Você mantém regularidade e cumpre a maioria das tarefas planejadas.';
        details = `Continue assim! Sua sequência atual é de ${metrics.consistency.streak} dias.`;
        tip = 'Tente aumentar gradualmente o número de tarefas agendadas.';
    }
    else if (consistency < 40 && completion < 40) {
        main = 'Há espaço para melhorar sua consistência e cumprimento de tarefas.';
        details = 'Foque em criar uma rotina mais regular e agendar menos tarefas, mas cumpri-las completamente.';
        tip = 'Comece com 1-2 tarefas essenciais por dia e aumente gradualmente.';
    }
    else if (consistency >= 60 && completion < 40) {
        main = 'Você é consistente mas precisa melhorar o cumprimento das tarefas.';
        details = 'Sua regularidade é boa, mas muitas tarefas não estão sendo concluídas.';
        tip = 'Revise se as tarefas estão realistas ou se precisa de mais tempo.';
    }
    else {
        main = 'Seu perfil mostra áreas fortes e outras que podem ser desenvolvidas.';
        details = 'Analise os detalhes abaixo para entender melhor seus padrões.';
        tip = 'Foque em manter suas forças enquanto trabalha nas áreas de melhoria.';
    }
    
    // Adicionar informação sobre diversificação se relevante
    const diversification = metrics.diversification?.score || 0;
    if (diversification < 40) {
        details += ' Você tende a focar em poucas categorias. Experimente diversificar mais.';
    }
    
    return { main, details, tip };
}

function updateMetrics(data) {
    const metrics = profileData?.derived;
    if (!metrics) return;
    
    console.log('Atualizando métricas com:', metrics);
    
    // Atualizar scores principais
    updateMetricElement('consistency-score', metrics.consistency.score + '%');
    updateMetricElement('diversification-score', metrics.diversification.score + '%');
    updateMetricElement('completion-rate', metrics.completion.rate + '%');
    updateMetricElement('efficiency-score', metrics.efficiency.score + '%');
    
    // Atualizar barras de progresso
    updateProgressBar('consistency-progress', metrics.consistency.score);
    updateProgressBar('diversification-progress', metrics.diversification.score);
    updateProgressBar('completion-progress', metrics.completion.rate);
    updateProgressBar('efficiency-progress', metrics.efficiency.score);
    
    // Atualizar detalhes
    updateMetricDetails('consistency-details', 
        `Sequência: ${metrics.consistency.streak} dias | Melhor dia: ${metrics.consistency.bestDay}`);
    
    updateMetricDetails('diversification-details', 
        `${metrics.diversification.activeCategories} categorias ativas | Principal: ${metrics.diversification.mainCategory}`);
    
    updateMetricDetails('completion-details', 
        `Agendamento: ${metrics.completion.scheduledVsCreated}% | Média: ${metrics.completion.averageCompletionDays} dias`);
    
    updateMetricDetails('efficiency-details', 
        `Score de produtividade: ${metrics.efficiency.score}/100`);
}

function updateMetricElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateProgressBar(id, percentage) {
    const el = document.getElementById(id);
    if (el) {
        el.style.width = `${percentage}%`;
        el.style.backgroundColor = getProgressColor(percentage);
    }
}

function getProgressColor(percentage) {
    if (percentage >= 80) return '#2ecc71';
    if (percentage >= 60) return '#3498db';
    if (percentage >= 40) return '#f39c12';
    return '#e74c3c';
}

function updateMetricDetails(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function updateAnalysisTabs(data) {
    const basic = data.basic || data.profile || {};
    const enhanced = data.enhanced || {};
    const metrics = profileData?.derived;
    
    if (!metrics) return;
    
    // Tab Consistência
    updateConsistencyTab(basic, metrics);
    
    // Tab Diversificação
    updateDiversificationTab(basic);
    
    // Tab Calendário
    updateCalendarTab(basic, metrics);
    
    // Tab Padrões
    updatePatternsTab(enhanced);
}

function updateConsistencyTab(basic, metrics) {
    if (!metrics) return;
    
    // Atualizar sequência atual
    document.getElementById('current-streak').textContent = metrics.consistency.streak;
    document.getElementById('most-productive-day').textContent = metrics.consistency.bestDay;
    
    // Buscar progresso semanal real
    if (basic.weekly_progress && basic.weekly_progress.length > 0) {
        const weeklyCompleted = basic.weekly_progress.reduce((sum, day) => sum + (day.completed || 0), 0);
        document.getElementById('weekly-avg').textContent = weeklyCompleted;
    } else {
        document.getElementById('weekly-avg').textContent = basic.weekly_avg || '--';
    }
    
    // Criar gráfico de sequência
    createStreakChart(basic);
    
    // Criar gráfico semanal
    createWeeklyChart(basic);
}

function createStreakChart(basic) {
    const ctx = document.getElementById('streakChart');
    if (!ctx) return;
    
    try {
        // Usar dados reais se disponíveis
        let labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        let data = [5, 7, 3, 10, 8, 12];
        
        if (basic.weekly_progress && basic.weekly_progress.length > 0) {
            labels = basic.weekly_progress.slice(0, 6).map(w => w.day_name || 'Semana');
            data = basic.weekly_progress.slice(0, 6).map(w => w.completed || 0);
        }
        
        if (charts.streakChart) charts.streakChart.destroy();
        
        charts.streakChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sequência (dias)',
                    data: data,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Dias consecutivos'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao criar gráfico de sequência:', error);
    }
}

function createWeeklyChart(basic) {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;
    
    try {
        let weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        let activitiesByDay = [4, 5, 7, 3, 6, 2, 1];
        
        // Tentar usar dados reais
        if (basic.weekly_progress && basic.weekly_progress.length >= 7) {
            activitiesByDay = basic.weekly_progress.map(day => day.completed || 0);
        }
        
        if (charts.weeklyChart) charts.weeklyChart.destroy();
        
        charts.weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekDays,
                datasets: [{
                    label: 'Atividades',
                    data: activitiesByDay,
                    backgroundColor: weekDays.map((_, i) => 
                        i === 2 ? '#3498db' : 'rgba(52, 152, 219, 0.6)'
                    ),
                    borderColor: '#3498db',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Número de atividades'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao criar gráfico semanal:', error);
    }
}

function updateDiversificationTab(basic) {
    document.getElementById('active-categories').textContent = basic.category_time?.length || 0;
    
    // Encontrar categoria principal
    if (basic.category_time && basic.category_time.length > 0) {
        const mainCategory = basic.category_time.reduce((max, cat) => {
            const currentHours = cat.hours || cat.total_hours || 0;
            const maxHours = max.hours || max.total_hours || 0;
            return currentHours > maxHours ? cat : max;
        }, basic.category_time[0]);
        
        if (mainCategory) {
            document.getElementById('main-category').textContent = mainCategory.category || mainCategory.name || '--';
        }
        
        // Criar gráfico de categorias
        createCategoryChart(basic.category_time);
    }
}

function createCategoryChart(categoryTime) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    
    try {
        const labels = categoryTime.map(cat => cat.category || cat.name || 'Categoria');
        const data = categoryTime.map(cat => cat.hours || cat.total_hours || 0);
        
        // Gerar cores se não tiver
        const colors = categoryTime.map((cat, i) => 
            cat.color || getCategoryColor(i)
        );
        
        if (charts.categoryChart) charts.categoryChart.destroy();
        
        charts.categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 15
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao criar gráfico de categorias:', error);
    }
}

function getCategoryColor(index) {
    const colors = ['#4ECDC4', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#073B4C', '#7209B7'];
    return colors[index % colors.length];
}

function updateCalendarTab(basic, metrics) {
    if (!basic || !metrics) return;
    
    document.getElementById('created-tasks').textContent = basic.total_activities || 0;
    document.getElementById('scheduled-tasks').textContent = basic.priority_metrics?.month || basic.priority_metrics?.month || 0;
    document.getElementById('scheduling-rate').textContent = metrics.completion.scheduledVsCreated + '%';
    document.getElementById('calendar-completion').textContent = metrics.completion.rate + '%';
    
    // Calcular distribuição realista
    const totalScheduled = basic.priority_metrics?.month || 0;
    const completedRate = metrics.completion.rate || 0;
    
    const onTimeTasks = Math.round((completedRate / 100) * totalScheduled);
    const lateTasks = Math.round(0.1 * totalScheduled);
    const notStartedTasks = Math.max(0, totalScheduled - onTimeTasks - lateTasks);
    
    document.getElementById('on-time-tasks').textContent = onTimeTasks;
    document.getElementById('late-tasks').textContent = lateTasks;
    document.getElementById('not-started-tasks').textContent = notStartedTasks;
}

function updatePatternsTab(enhanced) {
    if (!enhanced) return;
    
    // Atualizar tipo de perfil
    const profileType = enhanced.characterization || {};
    document.getElementById('profile-type-name').textContent = profileType.type || 'Analisando...';
    document.getElementById('profile-type-desc').textContent = profileType.description || '';
    
    // Atualizar pontos fortes
    const strengthsEl = document.getElementById('profile-strengths');
    if (strengthsEl && profileType.strengths) {
        strengthsEl.innerHTML = profileType.strengths.map(strength => 
            `<span class="strength-tag">${strength}</span>`
        ).join('');
    } else if (strengthsEl) {
        strengthsEl.innerHTML = '<span class="strength-tag">Consistência</span><span class="strength-tag">Dedicação</span>';
    }
    
    // Criar gráfico de evolução
    createEvolutionChart(enhanced);
}

function createEvolutionChart(enhanced) {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx) return;
    
    try {
        // Usar dados reais se disponíveis
        let months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        let productivity = [45, 52, 60, 65, 70, 78];
        let consistency = [40, 48, 55, 58, 62, 68];
        
        if (enhanced.time_analysis && enhanced.time_analysis.monthly) {
            // Tentar extrair dados mensais
            const monthlyData = enhanced.time_analysis.monthly;
            if (monthlyData.by_month) {
                months = monthlyData.by_month.map(m => m.month);
                productivity = monthlyData.by_month.map(m => m.productivity || 0);
                consistency = monthlyData.by_month.map(m => m.consistency || 0);
            }
        }
        
        if (charts.evolutionChart) charts.evolutionChart.destroy();
        
        charts.evolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Produtividade',
                        data: productivity,
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Consistência',
                        data: consistency,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Score (%)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao criar gráfico de evolução:', error);
    }
}

function generateRecommendations(data) {
    const recommendationsEl = document.getElementById('recommendations');
    if (!recommendationsEl) return;
    
    const basic = data.basic || data.profile || {};
    const metrics = profileData?.derived;
    if (!metrics) return;
    
    const recommendations = [];
    
    // Recomendações baseadas em consistência
    if (metrics.consistency.score < 60) {
        recommendations.push({
            icon: 'calendar-plus',
            title: 'Melhore sua consistência',
            description: 'Tente manter uma sequência mínima de 3 dias por semana nas suas principais atividades.',
            priority: 'high'
        });
    }
    
    // Recomendações baseadas em diversificação
    if (metrics.diversification.score < 50) {
        recommendations.push({
            icon: 'expand-arrows-alt',
            title: 'Diversifique suas atividades',
            description: `Você foca muito em "${metrics.diversification.mainCategory}". Experimente adicionar atividades em outras áreas.`,
            priority: 'medium'
        });
    }
    
    // Recomendações baseadas em cumprimento
    if (metrics.completion.rate < 70) {
        recommendations.push({
            icon: 'check-circle',
            title: 'Aumente a taxa de conclusão',
            description: 'Agende menos tarefas, mas comprometa-se a cumpri-las completamente.',
            priority: 'high'
        });
    }
    
    // Recomendação baseada em agendamento
    if (metrics.completion.scheduledVsCreated < 30) {
        recommendations.push({
            icon: 'calendar-check',
            title: 'Use mais o calendário',
            description: 'Apenas ' + metrics.completion.scheduledVsCreated + '% das suas tarefas estão agendadas. Planeje melhor seu tempo.',
            priority: 'medium'
        });
    }
    
    // Recomendação positiva (reforço)
    if (metrics.consistency.streak >= 7) {
        recommendations.push({
            icon: 'trophy',
            title: 'Ótima sequência!',
            description: `Você mantém uma sequência de ${metrics.consistency.streak} dias. Continue assim!`,
            priority: 'low',
            positive: true
        });
    }
    
    // Se não houver recomendações específicas
    if (recommendations.length === 0) {
        recommendations.push({
            icon: 'smile',
            title: 'Bom trabalho!',
            description: 'Seus padrões estão equilibrados. Continue mantendo a consistência.',
            priority: 'low',
            positive: true
        });
    }
    
    // Ordenar por prioridade
    recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    // Renderizar recomendações
    recommendationsEl.innerHTML = recommendations.map(rec => `
        <div class="recommendation-card ${rec.positive ? 'positive' : ''}">
            <div class="recommendation-header">
                <i class="fas fa-${rec.icon}"></i>
                <h4>${rec.title}</h4>
                ${rec.priority === 'high' ? '<span class="priority-badge high">Alta</span>' : 
                  rec.priority === 'medium' ? '<span class="priority-badge medium">Média</span>' : ''}
            </div>
            <p>${rec.description}</p>
        </div>
    `).join('');
}

function showTab(tabName) {
    // Remover active de todas as tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    // Ativar tab clicada
    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function refreshAnalysis() {
    loadProfileData();
    showNotification('Atualizando análise...', 'info');
}

function exportProfileData() {
    if (!profileData) {
        showNotification('Carregue os dados primeiro', 'warning');
        return;
    }
    
    // Criar relatório em formato de texto
    const report = generateProfileReport(profileData);
    
    // Criar blob e link para download
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-produtividade-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Relatório exportado com sucesso!', 'success');
}

function generateProfileReport(data) {
    const basic = data.basic || data.profile || {};
    const metrics = profileData?.derived || {};
    
    return `
RELATÓRIO DE PRODUTIVIDADE
===========================
Data: ${new Date().toLocaleDateString('pt-BR')}
Última atualização: ${lastUpdated ? lastUpdated.toLocaleString('pt-BR') : 'N/A'}

RESUMO EXECUTIVO
----------------
Score de Produtividade: ${basic.productivity_score || 0}/100
Score de Consistência: ${metrics.consistency?.score || 0}/100
Taxa de Conclusão: ${metrics.completion?.rate || 0}%
Score de Diversificação: ${metrics.diversification?.score || 0}/100

MÉTRICAS DETALHADAS
-------------------
Consistência:
- Sequência atual: ${metrics.consistency?.streak || 0} dias
- Dia mais produtivo: ${metrics.consistency?.bestDay || '--'}
- Score: ${metrics.consistency?.score || 0}/100

Diversificação:
- Categorias ativas: ${metrics.diversification?.activeCategories || 0}
- Categoria principal: ${metrics.diversification?.mainCategory || '--'}
- Área negligenciada: ${metrics.diversification?.neglectedCategory || '--'}
- Score: ${metrics.diversification?.score || 0}/100

Calendário:
- Tarefas criadas: ${basic.total_activities || 0}
- Tarefas agendadas: ${basic.priority_metrics?.month || 0}
- Taxa de agendamento: ${metrics.completion?.scheduledVsCreated || 0}%
- Taxa de conclusão: ${metrics.completion?.rate || 0}%

ATIVIDADES POR CATEGORIA
------------------------
${(basic.category_time || []).map(cat => 
    `- ${cat.category || cat.name}: ${cat.hours || cat.total_hours || 0} horas`
).join('\n')}

RECOMENDAÇÕES
-------------
${document.querySelectorAll('.recommendation-card').length} recomendações geradas.
Verifique a interface para detalhes específicos.

ANÁLISE DA IA
-------------
${document.getElementById('ai-summary')?.textContent || 'N/A'}

---
Relatório gerado automaticamente pelo Sistema de Gamificação
`;
}

function useCachedData(cachedData) {
    profileData = cachedData;
    lastUpdated = new Date();
    
    processProfileData(cachedData);
    updateAISummary(cachedData);
    updateMetrics(cachedData);
    updateAnalysisTabs(cachedData);
    generateRecommendations(cachedData);
    
    updateProfileStatusComplete();
}

function loadSampleData() {
    console.log("Carregando dados de exemplo...");
    
    // Dados de exemplo para demonstração
    profileData = {
        basic: {
            productivity_score: 78,
            consistency_score: 85,
            current_streak: 7,
            total_activities: 42,
            avg_completion_days: 3,
            priority_metrics: { today: 3, week: 12, month: 45 },
            patterns: {
                most_productive_day: 'Quarta-feira',
                favorite_category: 'Desenvolvimento',
                completion_rate: 75,
                recent_trend: 'up',
                busiest_time: '10:00'
            },
            category_time: [
                { category: 'Desenvolvimento', color: '#4ECDC4', hours: 45 },
                { category: 'Estudos', color: '#FF6B6B', hours: 30 },
                { category: 'Exercícios', color: '#FFD166', hours: 20 },
                { category: 'Lazer', color: '#06D6A0', hours: 15 }
            ],
            weekly_progress: [
                { day_name: 'Seg', score: 70, scheduled: 5, completed: 4 },
                { day_name: 'Ter', score: 85, scheduled: 6, completed: 5 },
                { day_name: 'Qua', score: 90, scheduled: 7, completed: 6 },
                { day_name: 'Qui', score: 65, scheduled: 5, completed: 3 },
                { day_name: 'Sex', score: 75, scheduled: 6, completed: 5 },
                { day_name: 'Sáb', score: 50, scheduled: 4, completed: 2 },
                { day_name: 'Dom', score: 40, scheduled: 3, completed: 1 }
            ]
        },
        enhanced: {
            characterization: {
                type: 'Realizador',
                description: 'Perfil de alta realização com forte capacidade de finalização',
                strengths: ['Conclusão', 'Foco', 'Persistência']
            }
        },
        activities: [],
        time_patterns: {}
    };
    
    // Processar e exibir dados
    const derivedMetrics = processProfileData(profileData);
    profileData.derived = derivedMetrics;
    
    updateAISummary(profileData);
    updateMetrics(profileData);
    updateAnalysisTabs(profileData);
    generateRecommendations(profileData);
    
    showNotification('Carregados dados de exemplo para demonstração', 'info');
}

// Utilitários compartilhados
function showNotification(message, type = 'info') {
    // Criar uma notificação simples
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Estilos básicos para notificação
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
        color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
        padding: 12px 20px;
        border-radius: 5px;
        border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    
    document.body.appendChild(notification);
    
    // Remover após 3 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}