// ============================================
// PÁGINA DE HISTÓRICO - SISTEMA DE REGISTROS
// ============================================

// Evitar conflito de variáveis - usar escopo local
(function() {
    // Variáveis locais para o histórico
    let historyData = [];
    let filteredData = [];
    let currentPage = 1;
    const itemsPerPage = 15;
    let currentView = 'timeline';
    let historyCategories = []; // Nome diferente para evitar conflito
    let historyFilters = {
        dateRange: '30',
        startDate: null,
        endDate: null,
        category: 'all',
        type: 'all'
    };

    // Inicializar página de histórico
    function initHistoryPage() {
        console.log('Inicializando página de histórico...');
        
        // Configurar datas padrão
        setupDefaultDates();
        
        // Carregar categorias para filtro
        loadCategoriesForFilter();
        
        // Carregar dados do histórico
        loadHistoryData();
        
        // Configurar event listeners
        setupHistoryEventListeners();
    }

    // Configurar datas padrão
    function setupDefaultDates() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Últimos 30 dias
        
        document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    }

    // Carregar categorias para o filtro
    async function loadCategoriesForFilter() {
        try {
            const response = await fetch('/api/categories');
            historyCategories = await response.json();
            
            const categoryFilter = document.getElementById('category-filter');
            historyCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categoryFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    // Carregar dados do histórico
    async function loadHistoryData() {
        try {
            showLoadingState();
            
            // Carregar dados do histórico da API
            const response = await fetch('/api/profile/historical?days=90');
            if (!response.ok) throw new Error('Erro ao carregar histórico');
            
            const data = await response.json();
            
            // Processar dados históricos
            processHistoryData(data);
            
            // Carregar progressos recentes para detalhes
            await loadRecentProgress();
            
            // Atualizar estatísticas
            updateStatistics();
            
            // Aplicar filtros
            applyFilters();
            
        } catch (error) {
            console.error('Erro ao carregar dados históricos:', error);
            showNotification('Erro ao carregar histórico de atividades', 'error');
            showErrorState();
        }
    }

    // Processar dados históricos
    function processHistoryData(data) {
        historyData = [];
        
        // Processar timeline data
        if (data.timeline && Array.isArray(data.timeline)) {
            data.timeline.forEach(day => {
                historyData.push({
                    id: `day-${day.date}`,
                    date: day.date,
                    type: 'day_summary',
                    activities_completed: day.completed || 0,
                    scheduled_activities: day.scheduled || 0,
                    points_earned: day.points || 0,
                    time_spent: day.time_spent || 0
                });
            });
        }
        
        // Ordenar por data (mais recente primeiro)
        historyData.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Carregar progressos recentes para detalhes
    async function loadRecentProgress() {
        try {
            const response = await fetch('/api/progress/recent?since=2024-01-01');
            if (!response.ok) return;
            
            const progressData = await response.json();
            
            // Adicionar progressos ao histórico
            progressData.forEach(progress => {
                historyData.push({
                    id: progress.id,
                    date: progress.date,
                    type: 'progress',
                    activity_id: progress.activity_id,
                    activity_name: progress.activity_name,
                    category: progress.category || 'Geral',
                    value: progress.value,
                    unit: progress.unit,
                    notes: progress.notes,
                    completed: progress.completed,
                    points_earned: progress.points_earned,
                    streak_bonus: progress.streak_bonus,
                    target_value: progress.target_value
                });
            });
            
            // Ordenar novamente após adicionar progressos
            historyData.sort((a, b) => new Date(b.date) - new Date(a.date));
            
        } catch (error) {
            console.error('Erro ao carregar progressos:', error);
        }
    }

    // Atualizar estatísticas
    function updateStatistics() {
        // Calcular totais
        const totals = calculateHistoryTotals();
        
        // Atualizar elementos
        document.getElementById('total-activities').textContent = totals.totalActivities;
        document.getElementById('total-points').textContent = totals.totalPoints;
        document.getElementById('total-hours').textContent = Math.round(totals.totalHours);
        document.getElementById('streak-days').textContent = totals.streakDays;
    }

    // Calcular totais do histórico
    function calculateHistoryTotals() {
        let totalActivities = 0;
        let totalPoints = 0;
        let totalMinutes = 0;
        
        // Usar apenas os últimos 30 dias para cálculos
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        historyData.forEach(item => {
            const itemDate = new Date(item.date);
            if (itemDate >= thirtyDaysAgo) {
                if (item.type === 'day_summary') {
                    totalActivities += item.activities_completed || 0;
                    totalPoints += item.points_earned || 0;
                    totalMinutes += item.time_spent || 0;
                } else if (item.type === 'progress' && item.points_earned) {
                    totalPoints += item.points_earned;
                    totalActivities += item.completed ? 1 : 0.5; // Progresso parcial conta como meia atividade
                }
            }
        });
        
        // Calcular sequência de dias com atividade
        const streakDays = calculateStreakDays();
        
        return {
            totalActivities: totalActivities,
            totalPoints: totalPoints,
            totalHours: totalMinutes / 60,
            streakDays: streakDays
        };
    }

    // Calcular sequência de dias com atividade
    function calculateStreakDays() {
        const today = new Date();
        let streak = 0;
        let checkingDate = new Date(today);
        
        // Ordenar datas das atividades
        const activityDates = [...new Set(historyData
            .filter(item => item.activities_completed > 0 || item.type === 'progress')
            .map(item => item.date))].sort((a, b) => new Date(b) - new Date(a));
        
        if (activityDates.length === 0) return 0;
        
        // Verificar sequência a partir de hoje
        for (let i = 0; i < 30; i++) { // Verificar até 30 dias atrás
            const dateStr = checkingDate.toISOString().split('T')[0];
            if (activityDates.includes(dateStr)) {
                streak++;
                checkingDate.setDate(checkingDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        return streak;
    }

    // Configurar event listeners
    function setupHistoryEventListeners() {
        // Filtro de período
        const dateRangeSelect = document.getElementById('date-range');
        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', updateDateRange);
        }
        
        // Filtros
        const categoryFilter = document.getElementById('category-filter');
        const typeFilter = document.getElementById('type-filter');
        
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                historyFilters.category = categoryFilter.value;
                filterHistory();
            });
        }
        
        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                historyFilters.type = typeFilter.value;
                filterHistory();
            });
        }
        
        // Botões de exportação
        const exportBtn = document.querySelector('#export-history-btn');
        const refreshBtn = document.querySelector('#refresh-history-btn');
        
        if (exportBtn) exportBtn.addEventListener('click', exportHistory);
        if (refreshBtn) refreshBtn.addEventListener('click', refreshHistory);
    }

    // Atualizar intervalo de datas
    function updateDateRange() {
        const dateRange = document.getElementById('date-range').value;
        const customRange = document.getElementById('custom-date-range');
        
        if (dateRange === 'custom') {
            customRange.style.display = 'flex';
        } else {
            customRange.style.display = 'none';
            
            // Calcular datas baseadas no intervalo selecionado
            const endDate = new Date();
            const startDate = new Date();
            
            switch (dateRange) {
                case '7':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case '30':
                    startDate.setDate(startDate.getDate() - 30);
                    break;
                case '90':
                    startDate.setDate(startDate.getDate() - 90);
                    break;
                case '365':
                    startDate.setDate(startDate.getDate() - 365);
                    break;
            }
            
            historyFilters.dateRange = dateRange;
            historyFilters.startDate = startDate.toISOString().split('T')[0];
            historyFilters.endDate = endDate.toISOString().split('T')[0];
            
            filterHistory();
        }
    }

    // Aplicar intervalo de datas personalizado
    function applyCustomDateRange() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        
        if (!startDate || !endDate) {
            showNotification('Selecione ambas as datas', 'error');
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            showNotification('A data inicial não pode ser posterior à data final', 'error');
            return;
        }
        
        historyFilters.dateRange = 'custom';
        historyFilters.startDate = startDate;
        historyFilters.endDate = endDate;
        
        filterHistory();
    }

    // Filtrar histórico
    function filterHistory() {
        // Aplicar filtros aos dados
        filteredData = historyData.filter(item => {
            const itemDate = new Date(item.date);
            const startDate = historyFilters.startDate ? new Date(historyFilters.startDate) : null;
            const endDate = historyFilters.endDate ? new Date(historyFilters.endDate) : null;
            
            // Filtro de data
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
            
            // Filtro de categoria (para itens de progresso)
            if (historyFilters.category !== 'all' && item.type === 'progress') {
                const categoryId = historyCategories.find(cat => cat.name === item.category)?.id;
                if (categoryId !== parseInt(historyFilters.category)) return false;
            }
            
            // Filtro de tipo
            if (historyFilters.type !== 'all') {
                if (historyFilters.type === 'progress' && item.type !== 'progress') return false;
                if (historyFilters.type === 'completion' && !item.completed) return false;
                if (historyFilters.type === 'schedule' && item.type !== 'day_summary') return false;
            }
            
            return true;
        });
        
        // Atualizar visualização
        updateHistoryView();
        
        // Atualizar estatísticas com dados filtrados
        updateFilteredStatistics();
    }

    // Atualizar estatísticas com dados filtrados
    function updateFilteredStatistics() {
        const totals = calculateFilteredTotals();
        
        // Atualizar elementos (manter originais por enquanto)
        console.log('Estatísticas filtradas:', totals);
    }

    // Calcular totais filtrados
    function calculateFilteredTotals() {
        let totalActivities = 0;
        let totalPoints = 0;
        let totalMinutes = 0;
        
        filteredData.forEach(item => {
            if (item.type === 'day_summary') {
                totalActivities += item.activities_completed || 0;
                totalPoints += item.points_earned || 0;
                totalMinutes += item.time_spent || 0;
            } else if (item.type === 'progress') {
                totalPoints += item.points_earned || 0;
                totalActivities += item.completed ? 1 : 0.5;
            }
        });
        
        return {
            totalActivities: totalActivities,
            totalPoints: totalPoints,
            totalHours: totalMinutes / 60
        };
    }

    // Atualizar visualização do histórico
    function updateHistoryView() {
        // Resetar página
        currentPage = 1;
        
        // Atualizar timeline
        updateTimelineView();
        
        // Atualizar tabela
        updateHistoryTable();
        
        // Atualizar paginação
        updatePagination();
    }

    // Atualizar visualização da timeline
    function updateTimelineView() {
        const timelineContainer = document.getElementById('history-timeline');
        
        if (filteredData.length === 0) {
            timelineContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Nenhum registro encontrado</h3>
                    <p>Tente ajustar os filtros ou registrar algumas atividades.</p>
                    <button class="btn btn-primary" onclick="resetFilters()">
                        Limpar filtros
                    </button>
                </div>
            `;
            return;
        }
        
        // Agrupar por mês
        const groupedByMonth = groupHistoryByMonth(filteredData);
        
        let timelineHTML = '';
        
        Object.keys(groupedByMonth).sort((a, b) => new Date(b) - new Date(a)).forEach(month => {
            const monthData = groupedByMonth[month];
            const monthName = getMonthName(new Date(month));
            
            timelineHTML += `
                <div class="timeline-month">
                    <div class="timeline-month-header">
                        <h4>${monthName} ${new Date(month).getFullYear()}</h4>
                        <span class="month-stats">
                            ${monthData.totalActivities} atividades • ${monthData.totalPoints} pontos
                        </span>
                    </div>
                    <div class="timeline-days">
            `;
            
            // Ordenar dias do mês (do mais recente para o mais antigo)
            monthData.days.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(day => {
                const date = new Date(day.date);
                const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' });
                const dayNumber = date.getDate();
                
                timelineHTML += `
                    <div class="timeline-day ${day.activities_completed > 0 ? 'has-activities' : 'no-activities'}" 
                         onclick="showDayDetails('${day.date}')"
                         title="${day.activities_completed} atividades • ${day.points_earned} pontos">
                        <div class="day-header">
                            <span class="day-name">${dayName}</span>
                            <span class="day-number">${dayNumber}</span>
                        </div>
                        <div class="day-indicator">
                            ${day.activities_completed > 0 ? `
                                <div class="activity-dots">
                                    ${'•'.repeat(Math.min(day.activities_completed, 5))}
                                </div>
                            ` : ''}
                        </div>
                        ${day.activities_completed > 0 ? `
                            <div class="day-stats">
                                <small>${day.activities_completed} ativ</small>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            timelineHTML += `
                    </div>
                </div>
            `;
        });
        
        timelineContainer.innerHTML = timelineHTML;
    }

    // Agrupar histórico por mês
    function groupHistoryByMonth(data) {
        const grouped = {};
        
        data.forEach(item => {
            if (item.type !== 'day_summary') return;
            
            const date = new Date(item.date);
            const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
            
            if (!grouped[monthKey]) {
                grouped[monthKey] = {
                    days: [],
                    totalActivities: 0,
                    totalPoints: 0
                };
            }
            
            grouped[monthKey].days.push(item);
            grouped[monthKey].totalActivities += item.activities_completed || 0;
            grouped[monthKey].totalPoints += item.points_earned || 0;
        });
        
        return grouped;
    }

    // Obter nome do mês
    function getMonthName(date) {
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return months[date.getMonth()];
    }

    // Atualizar tabela de histórico
    function updateHistoryTable() {
        const tableBody = document.getElementById('history-table-body');
        
        if (filteredData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <div class="empty-state small">
                            <i class="fas fa-search"></i>
                            <p>Nenhum registro encontrado com os filtros atuais</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Calcular índice de início e fim para a página atual
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
        const pageData = filteredData.slice(startIndex, endIndex);
        
        let tableHTML = '';
        
        pageData.forEach(item => {
            if (item.type === 'day_summary') {
                tableHTML += createDaySummaryRow(item);
            } else if (item.type === 'progress') {
                tableHTML += createProgressRow(item);
            }
        });
        
        tableBody.innerHTML = tableHTML;
    }

    // Criar linha de resumo do dia
    function createDaySummaryRow(item) {
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: 'short'
        });
        
        return `
            <tr class="day-summary-row">
                <td>
                    <strong>${formattedDate}</strong>
                    <small>${date.getFullYear()}</small>
                </td>
                <td colspan="2">
                    <div class="day-summary">
                        <i class="fas fa-calendar-day"></i>
                        <div>
                            <strong>Resumo do dia</strong>
                            <small>${item.activities_completed} atividades realizadas</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="progress-badge">
                        ${item.activities_completed > 0 ? 'Dia produtivo' : 'Sem atividades'}
                    </div>
                </td>
                <td>
                    <span class="points-badge">
                        <i class="fas fa-star"></i>
                        ${item.points_earned || 0}
                    </span>
                </td>
                <td>
                    ${item.time_spent ? `${Math.round(item.time_spent / 60)}h` : '-'}
                </td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="showDayDetails('${item.date}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    // Criar linha de progresso
    function createProgressRow(item) {
        const date = new Date(item.date);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <tr class="progress-row">
                <td>
                    ${formattedDate}
                </td>
                <td>
                    <div class="activity-name">
                        <strong>${item.activity_name || 'Atividade'}</strong>
                        ${item.notes ? `<small>${item.notes}</small>` : ''}
                    </div>
                </td>
                <td>
                    <span class="category-badge" style="background-color: ${getCategoryColor(item.category)}">
                        ${item.category || 'Geral'}
                    </span>
                </td>
                <td>
                    <div class="progress-display">
                        ${item.completed ? `
                            <span class="status-badge completed">
                                <i class="fas fa-check"></i> Concluído
                            </span>
                        ` : `
                            <span class="progress-value">
                                ${item.value} ${item.unit || ''}
                            </span>
                        `}
                    </div>
                </td>
                <td>
                    ${item.points_earned ? `
                        <span class="points-badge">
                            <i class="fas fa-star"></i>
                            ${item.points_earned}
                            ${item.streak_bonus ? `<small>+${item.streak_bonus}</small>` : ''}
                        </span>
                    ` : '-'}
                </td>
                <td>
                    ${item.value && item.unit === 'minutos' ? `${Math.round(item.value)}min` : '-'}
                </td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="showProgressDetail(${item.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    // Obter cor da categoria
    function getCategoryColor(categoryName) {
        const category = historyCategories.find(cat => cat.name === categoryName);
        return category ? category.color : '#CCCCCC';
    }

    // Atualizar paginação
    function updatePagination() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        const paginationInfo = document.getElementById('pagination-info');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        
        paginationInfo.textContent = `Mostrando ${Math.min(filteredData.length, itemsPerPage)} de ${filteredData.length} registros`;
        
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    // Página anterior
    function prevPage() {
        if (currentPage > 1) {
            currentPage--;
            updateHistoryTable();
            updatePagination();
        }
    }

    // Próxima página
    function nextPage() {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            updateHistoryTable();
            updatePagination();
        }
    }

    // Alternar visualização da timeline
    function toggleTimelineView(view) {
        currentView = view;
        
        // Atualizar botões ativos
        document.querySelectorAll('.view-controls .btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        // Atualizar visualização
        if (view === 'list') {
            updateHistoryTable();
        } else if (view === 'timeline') {
            updateTimelineView();
        } else if (view === 'calendar') {
            showCalendarView();
        }
    }

    // Mostrar visualização de calendário
    function showCalendarView() {
        const timelineContainer = document.getElementById('history-timeline');
        
        timelineContainer.innerHTML = `
            <div class="calendar-view">
                <div class="calendar-header">
                    <h4>Calendário de Atividades</h4>
                    <small>Clique em um dia para ver detalhes</small>
                </div>
                <div id="history-calendar">
                    <!-- Calendário será gerado via JS -->
                </div>
            </div>
        `;
        
        generateHistoryCalendar();
    }

    // Gerar calendário do histórico
    function generateHistoryCalendar() {
        const calendarContainer = document.getElementById('history-calendar');
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // Obter primeiro dia do mês
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        
        // Dias da semana
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        
        let calendarHTML = `
            <div class="calendar-month">
                <div class="calendar-weekdays">
                    ${weekdays.map(day => `<div class="weekday">${day}</div>`).join('')}
                </div>
                <div class="calendar-days">
        `;
        
        // Dias vazios antes do primeiro dia
        for (let i = 0; i < firstDay.getDay(); i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
        }
        
        // Dias do mês
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = filteredData.find(item => item.date === dateStr && item.type === 'day_summary');
            const activityCount = dayData ? dayData.activities_completed : 0;
            
            const isToday = day === today.getDate() && currentMonth === today.getMonth();
            
            calendarHTML += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${activityCount > 0 ? 'has-activities' : ''}" 
                     onclick="showDayDetails('${dateStr}')">
                    <div class="day-number">${day}</div>
                    ${activityCount > 0 ? `
                        <div class="day-activity-indicator" title="${activityCount} atividades">
                            <div class="activity-dot"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        calendarHTML += `
                </div>
            </div>
        `;
        
        calendarContainer.innerHTML = calendarHTML;
    }

    // Mostrar detalhes do dia
    function showDayDetails(dateStr) {
        const dayData = filteredData.filter(item => item.date === dateStr);
        const progressData = dayData.filter(item => item.type === 'progress');
        const summary = dayData.find(item => item.type === 'day_summary');
        
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        let detailHTML = `
            <div class="day-detail">
                <div class="detail-header">
                    <h3>${formattedDate}</h3>
                    ${summary ? `
                        <div class="day-stats-summary">
                            <div class="stat">
                                <i class="fas fa-check-circle"></i>
                                <span>${summary.activities_completed || 0} atividades</span>
                            </div>
                            <div class="stat">
                                <i class="fas fa-star"></i>
                                <span>${summary.points_earned || 0} pontos</span>
                            </div>
                            ${summary.time_spent ? `
                                <div class="stat">
                                    <i class="fas fa-clock"></i>
                                    <span>${Math.round(summary.time_spent / 60)} horas</span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
        `;
        
        if (progressData.length > 0) {
            detailHTML += `
                <div class="progress-list">
                    <h4>Progressos registrados:</h4>
                    <ul>
            `;
            
            progressData.forEach(progress => {
                const time = new Date(progress.date).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                detailHTML += `
                    <li class="progress-item">
                        <div class="progress-time">${time}</div>
                        <div class="progress-content">
                            <strong>${progress.activity_name}</strong>
                            ${progress.value ? `<span>${progress.value} ${progress.unit || ''}</span>` : ''}
                            ${progress.notes ? `<small>${progress.notes}</small>` : ''}
                        </div>
                        ${progress.points_earned ? `
                            <div class="progress-points">
                                <i class="fas fa-star"></i> ${progress.points_earned}
                            </div>
                        ` : ''}
                    </li>
                `;
            });
            
            detailHTML += `
                    </ul>
                </div>
            `;
        } else {
            detailHTML += `
                <div class="empty-progress">
                    <i class="fas fa-calendar-times"></i>
                    <p>Nenhum progresso registrado neste dia</p>
                </div>
            `;
        }
        
        detailHTML += `</div>`;
        
        // Mostrar no modal
        document.getElementById('detail-modal-title').textContent = 'Detalhes do Dia';
        document.getElementById('history-detail-content').innerHTML = detailHTML;
        showModal('history-detail-modal');
    }

    // Mostrar detalhes do progresso
    function showProgressDetail(progressId) {
        const progress = filteredData.find(item => item.id === progressId);
        
        if (!progress) {
            showNotification('Registro não encontrado', 'error');
            return;
        }
        
        const date = new Date(progress.date);
        const formattedDate = date.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const detailHTML = `
            <div class="progress-detail">
                <div class="detail-header">
                    <h3>${progress.activity_name || 'Atividade'}</h3>
                    <span class="record-date">${formattedDate}</span>
                </div>
                
                <div class="detail-content">
                    <div class="detail-section">
                        <h4>Informações do Progresso</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Tipo:</strong>
                                <span>${progress.completed ? 'Conclusão' : 'Progresso parcial'}</span>
                            </div>
                            ${progress.value ? `
                                <div class="info-item">
                                    <strong>Valor:</strong>
                                    <span>${progress.value} ${progress.unit || ''}</span>
                                </div>
                            ` : ''}
                            ${progress.target_value ? `
                                <div class="info-item">
                                    <strong>Meta:</strong>
                                    <span>${progress.target_value} ${progress.unit || ''}</span>
                                </div>
                            ` : ''}
                            ${progress.category ? `
                                <div class="info-item">
                                    <strong>Categoria:</strong>
                                    <span class="category-badge" style="background-color: ${getCategoryColor(progress.category)}">
                                        ${progress.category}
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${progress.notes ? `
                        <div class="detail-section">
                            <h4>Anotações</h4>
                            <p class="notes-content">${progress.notes}</p>
                        </div>
                    ` : ''}
                    
                    ${progress.points_earned ? `
                        <div class="detail-section">
                            <h4>Pontuação</h4>
                            <div class="points-summary">
                                <div class="points-item">
                                    <span>Pontos base:</span>
                                    <strong>${progress.points_earned - (progress.streak_bonus || 0)}</strong>
                                </div>
                                ${progress.streak_bonus ? `
                                    <div class="points-item">
                                        <span>Bônus de sequência:</span>
                                        <strong>+${progress.streak_bonus}</strong>
                                </div>
                                ` : ''}
                                <div class="points-item total">
                                    <span>Total:</span>
                                    <strong>${progress.points_earned}</strong>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Mostrar no modal
        document.getElementById('detail-modal-title').textContent = 'Detalhes do Progresso';
        document.getElementById('history-detail-content').innerHTML = detailHTML;
        showModal('history-detail-modal');
    }

    // Aplicar filtros
    function applyFilters() {
        // Já aplicamos filtros em filterHistory()
        showNotification('Filtros aplicados', 'success');
    }

    // Resetar filtros
    function resetFilters() {
        // Resetar controles
        document.getElementById('date-range').value = '30';
        document.getElementById('category-filter').value = 'all';
        document.getElementById('type-filter').value = 'all';
        document.getElementById('custom-date-range').style.display = 'none';
        
        // Resetar filtros
        historyFilters = {
            dateRange: '30',
            startDate: null,
            endDate: null,
            category: 'all',
            type: 'all'
        };
        
        // Aplicar filtros
        filterHistory();
        
        showNotification('Filtros resetados', 'success');
    }

    // Exportar histórico
    function exportHistory() {
        if (filteredData.length === 0) {
            showNotification('Nenhum dado para exportar', 'warning');
            return;
        }
        
        // Criar CSV
        let csv = 'Data,Atividade,Categoria,Progresso,Pontos,Tempo,Notas\n';
        
        filteredData.forEach(item => {
            if (item.type === 'progress') {
                const date = new Date(item.date).toLocaleDateString('pt-BR');
                csv += `"${date}","${item.activity_name || ''}","${item.category || ''}","${item.value || ''} ${item.unit || ''}","${item.points_earned || ''}","${item.unit === 'minutos' ? item.value + 'min' : ''}","${item.notes || ''}"\n`;
            }
        });
        
        // Criar blob e link de download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `historico-atividades-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Histórico exportado com sucesso', 'success');
    }

    // Atualizar histórico
    function refreshHistory() {
        currentPage = 1;
        loadHistoryData();
        showNotification('Histórico atualizado', 'success');
    }

    // Mostrar estado de carregamento
    function showLoadingState() {
        const timelineContainer = document.getElementById('history-timeline');
        if (timelineContainer) {
            timelineContainer.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Carregando histórico...</p>
                </div>
            `;
        }
        
        const tableBody = document.getElementById('history-table-body');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-cell">
                        <div class="spinner small"></div>
                        Carregando registros...
                    </td>
                </tr>
            `;
        }
    }

    // Mostrar estado de erro
    function showErrorState() {
        const timelineContainer = document.getElementById('history-timeline');
        if (timelineContainer) {
            timelineContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar histórico</h3>
                    <p>Não foi possível carregar os dados do histórico.</p>
                    <button class="btn btn-primary" onclick="loadHistoryData()">
                        Tentar novamente
                    </button>
                </div>
            `;
        }
        
        const tableBody = document.getElementById('history-table-body');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <div class="empty-state small">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Erro ao carregar registros</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    // Funções auxiliares de modal
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

    // Função de notificação (já existente no script.js)
    function showNotification(message, type = 'info') {
        // Reutilizar a função existente do script.js
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // Fallback básico
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    // Inicializar quando a página carregar
    document.addEventListener('DOMContentLoaded', function() {
        // Verificar se estamos na página de histórico
        if (window.location.pathname === '/history' || document.querySelector('.history-container')) {
            console.log('Inicializando página de histórico...');
            initHistoryPage();
        }
    });

    // Exportar funções para uso global
    window.showDayDetails = showDayDetails;
    window.showProgressDetail = showProgressDetail;
    window.closeModal = closeModal;
    window.exportHistory = exportHistory;
    window.refreshHistory = refreshHistory;
    window.resetFilters = resetFilters;
    window.applyCustomDateRange = applyCustomDateRange;
    window.toggleTimelineView = toggleTimelineView;
})();