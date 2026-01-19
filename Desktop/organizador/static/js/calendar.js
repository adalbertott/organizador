// Variáveis do calendário
let currentWeek = new Date();
let scheduledActivities = [];
let draggedElement = null;
let dragStartSlot = null;

// Configurar drag and drop
function setupDragAndDrop() {
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
}

// Configurar event listeners do calendário - VERSÃO COMPLETA
function setupCalendarEventListeners() {
    // Navegação do calendário
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const todayBtn = document.getElementById('today-btn');
    const scheduleForm = document.getElementById('schedule-form');
    const replicateForm = document.getElementById('replicate-form');
    const cancelScheduleBtn = document.getElementById('cancel-schedule');

    console.log('Elementos encontrados:', {
        prevWeekBtn: !!prevWeekBtn,
        nextWeekBtn: !!nextWeekBtn,
        todayBtn: !!todayBtn,
        scheduleForm: !!scheduleForm,
        replicateForm: !!replicateForm,
        cancelScheduleBtn: !!cancelScheduleBtn
    });

    // CORREÇÃO: Navegação correta da semana
    if (prevWeekBtn) {
        prevWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() - 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (nextWeekBtn) {
        nextWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() + 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', function() {
            currentWeek = new Date(); // Data atual
            updateCalendarView();
        });
    }

    // CORREÇÃO: Event listener para botão cancelar
    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('schedule-modal');
            // Resetar formulário
            const scheduleForm = document.getElementById('schedule-form');
            if (scheduleForm) {
                scheduleForm.reset();
                // Resetar modo de edição se estiver ativo
                const submitButton = scheduleForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.textContent = 'Agendar';
                    delete submitButton.dataset.editMode;
                }
            }
        });
    }

    if (scheduleForm) {
        console.log('Adicionando event listener ao formulário de agendamento');
        scheduleForm.addEventListener('submit', handleScheduleSubmit);
    } else {
        console.error('Formulário de agendamento não encontrado!');
    }

    if (replicateForm) {
        replicateForm.addEventListener('submit', handleReplicateSubmit);
    }

    // Fechar modal ao clicar no X
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Fechar modal ao clicar fora
    window.addEventListener('click', function(event) {
        const modals = document.getElementsByClassName('modal');
        for (let modal of modals) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        }
    });
}

// FUNÇÃO ATUALIZADA: Atualizar toda a visualização do calendário
function updateCalendarView() {
    console.log('Atualizando visualização do calendário para:', currentWeek.toISOString().split('T')[0]);
    
    // DEBUG: Verificar navegação
    debugWeekNavigation();
    
    updateWeekDisplay();
    generateTimeSlots();
    loadScheduledActivities();
    
    // Atualizar também a data no modal de agendamento se estiver aberto
    updateScheduleModalDate();
}

// FUNÇÃO NOVA: Atualiza a data no modal de agendamento
function updateScheduleModalDate() {
    const scheduledDayInput = document.getElementById('scheduled-day');
    if (scheduledDayInput && !scheduledDayInput.value) {
        // Se não há data selecionada, usar a data atual
        const today = new Date().toISOString().split('T')[0];
        scheduledDayInput.value = today;
    }
}

// Atualizar display da semana
function updateWeekDisplay() {
    const weekStart = getWeekStart(currentWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const options = { day: 'numeric', month: 'long' };
    const weekDisplay = `${weekStart.toLocaleDateString('pt-BR', options)} - ${weekEnd.toLocaleDateString('pt-BR', options)}`;
    
    const currentWeekElement = document.getElementById('current-week');
    if (currentWeekElement) {
        currentWeekElement.textContent = weekDisplay;
    }
}

// Gerar slots de tempo - VERSÃO MELHORADA
function generateTimeSlots() {
    console.log('Gerando slots de tempo para a semana...');
    const timeSlotsContainer = document.querySelector('.calendar-time-slots');
    
    if (!timeSlotsContainer) {
        console.error('Container de time slots não encontrado!');
        return;
    }
    
    // Limpar completamente
    timeSlotsContainer.innerHTML = '';
    
    const weekStart = getWeekStart(currentWeek);
    const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    
    console.log('Início da semana:', weekStart.toISOString().split('T')[0]);
    
    // Atualizar cabeçalho com datas
    for (let day = 0; day < 7; day++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(currentDate.getDate() + day);
        
        const dayHeader = document.querySelector(`.day-column[data-day="${day}"]`);
        if (dayHeader) {
            const dateStr = currentDate.getDate().toString().padStart(2, '0');
            const monthStr = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            dayHeader.innerHTML = `
                <div style="font-weight: bold;">${dayNames[day]}</div>
                <div style="font-size: 0.9rem; color: #666;">${dateStr}/${monthStr}</div>
            `;
        }
    }
    
    // Gerar slots de hora (6h às 22h)
    for (let hour = 6; hour <= 22; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        
        // Label da hora
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label day-column';
        timeLabel.textContent = `${hour.toString().padStart(2, '0')}:00`;
        timeSlot.appendChild(timeLabel);
        
        // Slots para cada dia
        for (let day = 0; day < 7; day++) {
            const daySlot = createDaySlot(day, hour, weekStart);
            timeSlot.appendChild(daySlot);
        }
        
        timeSlotsContainer.appendChild(timeSlot);
    }
    
    console.log('Slots regenerados com sucesso');
}

// NA FUNÇÃO createDaySlot, GARANTIR que a data está correta:
function createDaySlot(day, hour, weekStart) {
    const daySlot = document.createElement('div');
    daySlot.className = 'day-slot day-column';
    daySlot.dataset.day = day;
    daySlot.dataset.hour = hour;
    
    // Calcular a data real deste slot CORRETAMENTE
    const slotDate = new Date(weekStart);
    slotDate.setDate(slotDate.getDate() + day);
    
    // Usar a função auxiliar para formatar
    daySlot.dataset.date = formatDateForAPI(slotDate);
        
    // Indicador de horário
    const timeIndicator = document.createElement('div');
    timeIndicator.className = 'time-indicator';
    timeIndicator.textContent = `${hour}h`;
    daySlot.appendChild(timeIndicator);
    
    // Event listeners
    daySlot.addEventListener('click', function(e) {
        if (!e.target.closest('.scheduled-activity')) {
            openScheduleModal(day, hour);
        }
    });
    
    // Efeitos visuais
    daySlot.addEventListener('mouseenter', function() {
        if (!this.querySelector('.scheduled-activity')) {
            this.style.backgroundColor = '#f0f8ff';
            this.style.boxShadow = 'inset 0 0 0 2px #3498db';
        }
    });
    
    daySlot.addEventListener('mouseleave', function() {
        if (!this.querySelector('.scheduled-activity')) {
            this.style.backgroundColor = 'white';
            this.style.boxShadow = 'none';
        }
    });
    
    return daySlot;
}

// Verificar se há atividade para agendar vinda do mapa - VERSÃO CORRIGIDA
function checkForScheduledActivity() {
    const activityToSchedule = localStorage.getItem('activityToSchedule');
    
    if (activityToSchedule) {
        try {
            const activity = JSON.parse(activityToSchedule);
            console.log('Atividade para agendar encontrada:', activity);
            
            // Aguardar um pouco para garantir que o DOM esteja pronto
            setTimeout(() => {
                const activitySelect = document.getElementById('schedule-activity');
                
                if (activitySelect) {
                    // Primeiro, carregar todas as atividades disponíveis
                    loadActivitiesForScheduling().then(() => {
                        // Depois de carregar, tentar selecionar a atividade
                        let found = false;
                        
                        for (let option of activitySelect.options) {
                            if (option.value == activity.id) {
                                activitySelect.value = activity.id;
                                found = true;
                                console.log('Atividade encontrada no select, selecionando...');
                                break;
                            }
                        }
                        
                        // Se não encontrou, adicionar a opção
                        if (!found) {
                            console.log('Atividade não encontrada no select, adicionando...');
                            const option = document.createElement('option');
                            option.value = activity.id;
                            option.textContent = `${activity.category_name} - ${activity.name}`;
                            option.dataset.color = activity.category_color;
                            activitySelect.appendChild(option);
                            activitySelect.value = activity.id;
                        }
                        
                        // Abrir o modal de agendamento
                        console.log('Abrindo modal de agendamento...');
                        showModal('schedule-modal');
                        
                        // Mostrar notificação
                        showNotification(`Atividade "${activity.name}" pronta para agendar!`, 'success');
                        
                    }).catch(error => {
                        console.error('Erro ao carregar atividades:', error);
                    });
                } else {
                    console.error('Elemento schedule-activity não encontrado');
                }
            }, 500); // Pequeno delay para garantir que o DOM esteja pronto
        } catch (error) {
            console.error('Erro ao processar atividade do localStorage:', error);
        }
    }
}

// HANDLE DRAG AND DROP FUNCTIONS
function handleDragStart(e) {
    if (e.target.classList.contains('scheduled-activity')) {
        draggedElement = e.target;
        dragStartSlot = e.target.closest('.day-slot');
        
        e.dataTransfer.setData('text/plain', e.target.dataset.scheduleId);
        e.target.style.opacity = '0.4';
        
        // Adicionar classe de arrasto
        setTimeout(() => {
            e.target.classList.add('dragging');
        }, 0);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    if (e.target.classList.contains('day-slot')) {
        e.target.style.backgroundColor = '#e3f2fd';
    }
}

function handleDrop(e) {
    e.preventDefault();
    
    if (e.target.classList.contains('day-slot') && draggedElement) {
        const scheduleId = parseInt(e.dataTransfer.getData('text/plain'));
        const targetDay = parseInt(e.target.dataset.day);
        const targetHour = parseInt(e.target.dataset.hour);
        
        // Remover highlight
        e.target.style.backgroundColor = 'white';
        
        // Atualizar agendamento
        updateScheduleTime(scheduleId, targetDay, targetHour);
    }
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.style.opacity = '1';
        draggedElement.classList.remove('dragging');
        
        // Remover highlight de todos os slots
        document.querySelectorAll('.day-slot').forEach(slot => {
            slot.style.backgroundColor = 'white';
        });
        
        draggedElement = null;
        dragStartSlot = null;
    }
}

// Atualizar horário do agendamento - VERSÃO MELHORADA
async function updateScheduleTime(scheduleId, newDay, newHour) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    const weekStart = getWeekStart(currentWeek);
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + newDay);
    
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(newDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dayOfMonth}`;
    const timeString = `${newHour.toString().padStart(2, '0')}:00`;

    try {
        const response = await fetch(`/api/schedules/${scheduleId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scheduled_date: dateString,
                scheduled_time: timeString,
                duration: schedule.duration
            })
        });

        if (response.ok) {
            showNotification('Agendamento movido com sucesso!', 'success');
            loadScheduledActivities();
        } else {
            showNotification('Erro ao mover agendamento', 'error');
        }
    } catch (error) {
        console.error('Erro ao mover agendamento:', error);
        showNotification('Erro ao mover agendamento', 'error');
    }
}

// Abrir modal de agendamento - VERSÃO MELHORADA
function openScheduleModal(day, hour) {
    const weekStart = getWeekStart(currentWeek);
    const scheduledDate = new Date(weekStart);
    
    // CORREÇÃO: Adicionar o dia corretamente
    if (typeof day !== 'undefined') {
        scheduledDate.setDate(scheduledDate.getDate() + day);
    }
    
    console.log('Agendando para:', {
        dayIndex: day,
        dayName: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][day],
        scheduledDate: scheduledDate.toISOString().split('T')[0],
        hour: hour
    });
    
    const scheduledDayInput = document.getElementById('scheduled-day');
    const scheduledTimeInput = document.getElementById('scheduled-time');
    
    if (scheduledDayInput && scheduledTimeInput) {
        // CORREÇÃO: Usar formato de data local para evitar problemas de fuso horário
        const year = scheduledDate.getFullYear();
        const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(scheduledDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${dayOfMonth}`;
        
        scheduledDayInput.value = dateString;
        
        // Se hour foi fornecido, usar; caso contrário, usar hora atual
        if (typeof hour !== 'undefined') {
            scheduledTimeInput.value = `${hour.toString().padStart(2, '0')}:00`;
        } else {
            // Usar hora atual como padrão
            const now = new Date();
            scheduledTimeInput.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
    }
    
    // Carregar atividades no select
    loadActivitiesForScheduling();
    
    showModal('schedule-modal');
}

// Abrir modal de replicação
function openReplicateModal(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    document.getElementById('replicate-schedule-id').value = scheduleId;
    document.getElementById('replicate-activity-name').textContent = schedule.activity_name;
    
    // Preencher data inicial com a data do agendamento
    const scheduleDate = new Date(schedule.scheduled_date);
    document.getElementById('replicate-start-date').value = schedule.scheduled_date;
    
    showModal('replicate-modal');
}

// Manipular envio do formulário de replicação
async function handleReplicateSubmit(e) {
    e.preventDefault();
    
    const scheduleId = document.getElementById('replicate-schedule-id').value;
    const replicateType = document.getElementById('replicate-type').value;
    const replicateUntil = document.getElementById('replicate-until-date').value;
    const replicateDays = Array.from(document.getElementById('replicate-days').selectedOptions)
        .map(option => option.value);
    
    try {
        const response = await fetch(`/api/schedules/${scheduleId}/replicate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: replicateType,
                until_date: replicateUntil,
                days_of_week: replicateDays
            })
        });
        
        if (response.ok) {
            showNotification('Agendamento replicado com sucesso!', 'success');
            closeModal('replicate-modal');
            loadScheduledActivities();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Erro ao replicar agendamento', 'error');
        }
    } catch (error) {
        console.error('Erro ao replicar agendamento:', error);
        showNotification('Erro ao replicar agendamento', 'error');
    }
}

// Carregar atividades para agendamento - VERSÃO MELHORADA
async function loadActivitiesForScheduling() {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await fetch('/api/activities');
            const activities = await response.json();
            const select = document.getElementById('schedule-activity');
            
            if (!select) {
                reject('Elemento schedule-activity não encontrado');
                return;
            }
            
            // Limpar apenas se não estiver vindo do mapa
            const activityToSchedule = localStorage.getItem('activityToSchedule');
            if (!activityToSchedule) {
                select.innerHTML = '<option value="">Selecione uma atividade</option>';
            }
            
            activities.forEach(activity => {
                // Verificar se a opção já existe
                let exists = false;
                for (let option of select.options) {
                    if (option.value == activity.id) {
                        exists = true;
                        break;
                    }
                }
                
                if (!exists) {
                    const option = document.createElement('option');
                    option.value = activity.id;
                    option.textContent = `${activity.category_name} - ${activity.name}`;
                    option.dataset.color = activity.category_color;
                    select.appendChild(option);
                }
            });

            resolve();
        } catch (error) {
            console.error('Erro ao carregar atividades:', error);
            reject(error);
        }
    });
}

// Manipular envio do formulário de agendamento - VERSÃO FINAL CORRIGIDA
async function handleScheduleSubmit(e) {
    e.preventDefault();
    
    const activityId = document.getElementById('schedule-activity').value;
    const duration = document.getElementById('schedule-duration').value;
    const scheduledDate = document.getElementById('scheduled-day').value;
    const scheduledTime = document.getElementById('scheduled-time').value;
    const submitButton = document.querySelector('#schedule-form button[type="submit"]');
    
    console.log('Dados do agendamento:', {
        activityId: activityId,
        scheduledDate: scheduledDate,
        scheduledTime: scheduledTime,
        duration: duration
    });
    
    if (!activityId) {
        showNotification('Selecione uma atividade', 'error');
        return;
    }
    
    const isEditMode = submitButton && submitButton.dataset.editMode === 'true';
    const scheduleId = isEditMode ? document.getElementById('schedule-duration').dataset.editScheduleId : null;
    
    try {
        const url = isEditMode ? `/api/schedules/${scheduleId}` : '/api/schedules';
        const method = isEditMode ? 'PUT' : 'POST';
        
        console.log('Enviando para API:', { url, method, activityId, scheduledDate, scheduledTime, duration });
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: parseInt(activityId),
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                duration: parseInt(duration)
            })
        });
        
        console.log('Resposta da API:', response.status, response.statusText);
        
        if (response.ok) {
            // LIMPAR O LOCALSTORAGE APÓS AGENDAMENTO BEM-SUCEDIDO
            localStorage.removeItem('activityToSchedule');
            
            showNotification(
                isEditMode ? 'Agendamento atualizado com sucesso!' : 'Atividade agendada com sucesso!', 
                'success'
            );
            closeModal('schedule-modal');
            loadScheduledActivities(); // Recarregar agendamentos
            
            // Resetar o modo de edição
            if (submitButton) {
                submitButton.textContent = 'Agendar';
                delete submitButton.dataset.editMode;
                if (document.getElementById('schedule-duration').dataset.editScheduleId) {
                    delete document.getElementById('schedule-duration').dataset.editScheduleId;
                }
            }
            
            // Resetar o formulário
            document.getElementById('schedule-form').reset();
        } else {
            const error = await response.json();
            console.error('Erro da API:', error);
            showNotification(error.message || 'Erro ao agendar atividade', 'error');
        }
    } catch (error) {
        console.error('Erro ao agendar atividade:', error);
        showNotification('Erro ao agendar atividade', 'error');
    }
}

// Função para confirmar atividade realizada
async function confirmActivity(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    if (!confirm(`Confirmar que você realizou "${schedule.activity_name}"?`)) {
        return;
    }

    try {
        // Buscar detalhes da atividade
        const activityResponse = await fetch(`/api/activities/${schedule.activity_id}`);
        const activity = await activityResponse.json();

        // Preparar dados para registrar progresso
        const progressData = {
            activity_id: schedule.activity_id,
            date: schedule.scheduled_date,
            value: activity.target_value || 1, // Usar target_value ou marcar como 1 unidade
            unit: activity.target_unit || 'unidades',
            completed: true,
            notes: `Realizada conforme agendamento (${schedule.scheduled_time})`,
            from_schedule: true // Flag para cálculo de sequência
        };

        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(progressData)
        });

        if (response.ok) {
            const result = await response.json();
            
            // Mostrar pontos ganhos
            let message = `Atividade confirmada! +${result.points_earned} pontos`;
            if (result.streak_bonus > 0) {
                message += ` (+${result.streak_bonus} bônus de sequência)`;
            }
            
            showNotification(message, 'success');
            
            // Remover o agendamento ou marcá-lo como realizado
            closeActivityOptions();
            loadScheduledActivities(); // Recarregar calendário
            
        } else {
            showNotification('Erro ao confirmar atividade', 'error');
        }
    } catch (error) {
        console.error('Erro ao confirmar atividade:', error);
        showNotification('Erro ao confirmar atividade', 'error');
    }
}

// Função para mostrar modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        
        // Focar no primeiro campo input se existir
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => {
                firstInput.focus();
            }, 100);
        }
    } else {
        console.error('Modal não encontrado:', modalId);
    }
}

async function logPartialProgress(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    // Abrir modal de progresso com a atividade pré-selecionada
    const progressModal = document.getElementById('progress-modal');
    if (progressModal) {
        // Configurar o modal de progresso com esta atividade
        await loadActivitiesForProgress();
        const activitySelect = document.getElementById('progress-activity');
        if (activitySelect) {
            activitySelect.value = schedule.activity_id;
            // Trigger change para atualizar a unidade
            activitySelect.dispatchEvent(new Event('change'));
        }
        
        // Preencher a data do agendamento
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('progress-date').value = schedule.scheduled_date || today;
        
        // Preencher valor sugerido (25% do target ou 1)
        const selectedOption = activitySelect.options[activitySelect.selectedIndex];
        if (selectedOption && selectedOption.dataset.target) {
            const target = parseFloat(selectedOption.dataset.target);
            const suggestedValue = target ? Math.max(1, Math.round(target * 0.25)) : 1;
            document.getElementById('progress-value').value = suggestedValue;
        } else {
            document.getElementById('progress-value').value = 1;
        }
        
        showModal('progress-modal');
        closeActivityOptions();
    } else {
        showNotification('Modal de progresso não disponível', 'info');
    }
}
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

// FUNÇÃO PARA EDITAR AGENDAMENTO
function editSchedule(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    // Preencher o modal de agendamento com os dados existentes
    const activitySelect = document.getElementById('schedule-activity');
    const scheduledDayInput = document.getElementById('scheduled-day');
    const scheduledTimeInput = document.getElementById('scheduled-time');
    const durationInput = document.getElementById('schedule-duration');
    
    if (activitySelect && scheduledDayInput && scheduledTimeInput && durationInput) {
        // Buscar a opção correta no select
        for (let option of activitySelect.options) {
            if (option.value == schedule.activity_id) {
                activitySelect.value = schedule.activity_id;
                break;
            }
        }
        
        scheduledDayInput.value = schedule.scheduled_date;
        scheduledTimeInput.value = schedule.scheduled_time;
        durationInput.value = schedule.duration;
        
        // Armazenar o ID do agendamento para edição
        durationInput.dataset.editScheduleId = scheduleId;
        
        // Mudar o texto do botão para "Atualizar"
        const submitButton = document.querySelector('#schedule-form button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Atualizar Agendamento';
            submitButton.dataset.editMode = 'true';
        }
    }
    
    closeActivityOptions();
    showModal('schedule-modal');
}

// FUNÇÃO PARA MUDAR DURAÇÃO DO AGENDAMENTO
function changeScheduleDuration(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    const newDuration = prompt(`Alterar duração para (minutos):`, schedule.duration);
    
    if (newDuration && !isNaN(newDuration) && newDuration > 0) {
        updateScheduleDuration(scheduleId, parseInt(newDuration));
    }
    
    closeActivityOptions();
}

// ATUALIZAR DURAÇÃO DO AGENDAMENTO
async function updateScheduleDuration(scheduleId, newDuration) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    try {
        const response = await fetch(`/api/schedules/${scheduleId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scheduled_date: schedule.scheduled_date,
                scheduled_time: schedule.scheduled_time,
                duration: newDuration
            })
        });

        if (response.ok) {
            showNotification('Duração do agendamento atualizada!', 'success');
            loadScheduledActivities();
        } else {
            showNotification('Erro ao atualizar duração', 'error');
        }
    } catch (error) {
        console.error('Erro ao atualizar duração:', error);
        showNotification('Erro ao atualizar duração', 'error');
    }
}

// FUNÇÃO PARA MOVER AGENDAMENTO PARA OUTRO DIA
function moveScheduleToDay(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    const newDate = prompt(`Mover para nova data (YYYY-MM-DD):`, schedule.scheduled_date);
    
    if (newDate) {
        // Validar formato da data
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(newDate)) {
            updateScheduleDate(scheduleId, newDate);
        } else {
            showNotification('Formato de data inválido. Use YYYY-MM-DD', 'error');
        }
    }
    
    closeActivityOptions();
}

// ATUALIZAR DATA DO AGENDAMENTO
async function updateScheduleDate(scheduleId, newDate) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    try {
        const response = await fetch(`/api/schedules/${scheduleId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scheduled_date: newDate,
                scheduled_time: schedule.scheduled_time,
                duration: schedule.duration
            })
        });

        if (response.ok) {
            showNotification('Agendamento movido para nova data!', 'success');
            loadScheduledActivities();
        } else {
            showNotification('Erro ao mover agendamento', 'error');
        }
    } catch (error) {
        console.error('Erro ao mover agendamento:', error);
        showNotification('Erro ao mover agendamento', 'error');
    }
}

// ADICIONE ESTA FUNÇÃO AUXILIAR PARA FORMATAR DATAS
function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ATUALIZE a função loadScheduledActivities:
async function loadScheduledActivities() {
    const weekStart = getWeekStart(currentWeek);
    const weekStartStr = formatDateForAPI(weekStart);
    
    console.log('Carregando agendamentos para semana começando em:', weekStartStr);
    
    try {
        const response = await fetch(`/api/schedules?week_start=${weekStartStr}`);
        if (response.ok) {
            scheduledActivities = await response.json();
            console.log('Agendamentos recebidos:', scheduledActivities);
            renderScheduledActivities();
        } else {
            console.error('Erro na resposta da API:', response.status);
        }
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        showNotification('Erro ao carregar agendamentos', 'error');
    }
}
// ADICIONE ESTAS FUNÇÕES NO calendar.js (após a função loadActivitiesForScheduling)

// Carregar atividades para o modal de progresso
async function loadActivitiesForProgress() {
    try {
        const response = await fetch('/api/activities');
        const activities = await response.json();
        const select = document.getElementById('progress-activity');
        
        if (!select) {
            console.error('Elemento progress-activity não encontrado');
            return;
        }
        
        // Limpar select
        select.innerHTML = '<option value="">Selecione uma atividade</option>';
        
        activities.forEach(activity => {
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = `${activity.category_name} - ${activity.name}`;
            option.dataset.unit = activity.target_unit || 'unidades';
            option.dataset.target = activity.target_value || 1;
            select.appendChild(option);
        });

        // Quando a atividade for alterada, atualizar a unidade
        select.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const unitInput = document.getElementById('progress-unit');
            if (selectedOption && selectedOption.dataset.unit && unitInput) {
                unitInput.value = selectedOption.dataset.unit;
            }
        });
    } catch (error) {
        console.error('Erro ao carregar atividades para progresso:', error);
    }
}

// Manipular envio do formulário de progresso
async function handleProgressSubmit(e) {
    e.preventDefault();
    
    const activityId = document.getElementById('progress-activity').value;
    const date = document.getElementById('progress-date').value;
    const value = document.getElementById('progress-value').value;
    const unit = document.getElementById('progress-unit').value;
    const notes = document.getElementById('progress-notes').value;
    const completed = document.getElementById('progress-completed').checked;
    
    if (!activityId || !value) {
        showNotification('Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_id: parseInt(activityId),
                date: date,
                value: parseFloat(value),
                unit: unit,
                notes: notes,
                completed: completed
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification('Progresso registrado com sucesso! +' + result.points_earned + ' pontos', 'success');
            closeModal('progress-modal');
            // Resetar formulário
            document.getElementById('progress-form').reset();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Erro ao registrar progresso', 'error');
        }
    } catch (error) {
        console.error('Erro ao registrar progresso:', error);
        showNotification('Erro ao registrar progresso', 'error');
    }
}

// ATUALIZE a função setupCalendarEventListeners para incluir o formulário de progresso:
// Configurar event listeners do calendário - VERSÃO COMPLETA CORRIGIDA
function setupCalendarEventListeners() {
    // Navegação do calendário
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const todayBtn = document.getElementById('today-btn');
    const scheduleForm = document.getElementById('schedule-form');
    const replicateForm = document.getElementById('replicate-form');
    const cancelScheduleBtn = document.getElementById('cancel-schedule');
    const progressForm = document.getElementById('progress-form');
    const cancelProgressBtn = document.getElementById('cancel-progress');
    const cancelReplicateBtn = document.querySelector('[onclick*="replicate-modal"]');

    console.log('Elementos encontrados:', {
        prevWeekBtn: !!prevWeekBtn,
        nextWeekBtn: !!nextWeekBtn,
        todayBtn: !!todayBtn,
        scheduleForm: !!scheduleForm,
        replicateForm: !!replicateForm,
        cancelScheduleBtn: !!cancelScheduleBtn,
        progressForm: !!progressForm,
        cancelProgressBtn: !!cancelProgressBtn,
        cancelReplicateBtn: !!cancelReplicateBtn
    });

    // CORREÇÃO: Navegação correta da semana
    if (prevWeekBtn) {
        prevWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() - 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (nextWeekBtn) {
        nextWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() + 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', function() {
            currentWeek = new Date(); // Data atual
            updateCalendarView();
        });
    }

    // CORREÇÃO: Event listener para botão cancelar do agendamento
    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('schedule-modal');
            // Resetar formulário
            const scheduleForm = document.getElementById('schedule-form');
            if (scheduleForm) {
                scheduleForm.reset();
                // Resetar modo de edição se estiver ativo
                const submitButton = scheduleForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.textContent = 'Agendar';
                    delete submitButton.dataset.editMode;
                    if (document.getElementById('schedule-duration').dataset.editScheduleId) {
                        delete document.getElementById('schedule-duration').dataset.editScheduleId;
                    }
                }
            }
        });
    }

    // CORREÇÃO: Event listener para botão cancelar do progresso
    if (cancelProgressBtn) {
        cancelProgressBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('progress-modal');
            // Resetar formulário
            const progressForm = document.getElementById('progress-form');
            if (progressForm) {
                progressForm.reset();
            }
        });
    }

    // CORREÇÃO: Event listener para botão cancelar da replicação (se existir)
    if (cancelReplicateBtn) {
        cancelReplicateBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('replicate-modal');
        });
    }

    if (scheduleForm) {
        console.log('Adicionando event listener ao formulário de agendamento');
        scheduleForm.addEventListener('submit', handleScheduleSubmit);
    } else {
        console.error('Formulário de agendamento não encontrado!');
    }

    if (replicateForm) {
        replicateForm.addEventListener('submit', handleReplicateSubmit);
    }

    if (progressForm) {
        console.log('Adicionando event listener ao formulário de progresso');
        progressForm.addEventListener('submit', handleProgressSubmit);
        
        // Configurar evento de change para atividade no progresso
        const progressActivitySelect = document.getElementById('progress-activity');
        if (progressActivitySelect) {
            progressActivitySelect.addEventListener('change', function() {
                const selectedOption = this.options[this.selectedIndex];
                const unitInput = document.getElementById('progress-unit');
                const valueInput = document.getElementById('progress-value');
                
                if (selectedOption && selectedOption.dataset.unit && unitInput) {
                    unitInput.value = selectedOption.dataset.unit;
                }
                
                // Sugerir valor baseado no target
                if (selectedOption && selectedOption.dataset.target && valueInput) {
                    const target = parseFloat(selectedOption.dataset.target);
                    if (target && target > 0) {
                        const suggestedValue = Math.max(1, Math.round(target * 0.25));
                        valueInput.value = suggestedValue;
                        valueInput.min = 1;
                        valueInput.max = target;
                    }
                }
            });
        }
    }

    // Configurar evento para tipo de replicação
    const replicateTypeSelect = document.getElementById('replicate-type');
    if (replicateTypeSelect) {
        replicateTypeSelect.addEventListener('change', function() {
            const daysContainer = document.getElementById('replicate-days-container');
            if (this.value === 'weekly') {
                daysContainer.style.display = 'block';
            } else {
                daysContainer.style.display = 'none';
            }
        });
        
        // Chamar uma vez para configurar estado inicial
        const event = new Event('change');
        replicateTypeSelect.dispatchEvent(event);
    }

    // Configurar data mínima para replicação
    const replicateUntilInput = document.getElementById('replicate-until-date');
    if (replicateUntilInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        replicateUntilInput.min = tomorrow.toISOString().split('T')[0];
        
        // Definir data padrão (1 semana a frente)
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        replicateUntilInput.value = nextWeek.toISOString().split('T')[0];
    }

    // Configurar data padrão para progresso (hoje)
    const progressDateInput = document.getElementById('progress-date');
    if (progressDateInput && !progressDateInput.value) {
        progressDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Configurar data mínima para agendamento (hoje)
    const scheduleDateInput = document.getElementById('scheduled-day');
    if (scheduleDateInput) {
        scheduleDateInput.min = new Date().toISOString().split('T')[0];
    }

    // Fechar modal ao clicar no X
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Fechar modal ao clicar fora
    window.addEventListener('click', function(event) {
        const modals = document.getElementsByClassName('modal');
        for (let modal of modals) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        }
    });

    // Fechar menu de opções ao pressionar ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeActivityOptions();
            const modals = document.querySelectorAll('.modal[style*="display: block"]');
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });
}
// Carregar atividades para o modal de progresso (VERSÃO ATUALIZADA)
async function loadActivitiesForProgress() {
    try {
        const response = await fetch('/api/activities');
        const activities = await response.json();
        const select = document.getElementById('progress-activity');
        
        if (!select) {
            console.error('Elemento progress-activity não encontrado');
            return;
        }
        
        // Limpar select
        select.innerHTML = '<option value="">Selecione uma atividade</option>';
        
        activities.forEach(activity => {
            // Mostrar apenas atividades não completas
            const progress = calculateProgress(activity);
            if (progress < 100) {
                const option = document.createElement('option');
                option.value = activity.id;
                option.textContent = `${activity.category_name} - ${activity.name}`;
                
                // Armazenar dados para validação
                option.dataset.measurementType = getMeasurementType(activity);
                option.dataset.targetValue = activity.target_value || 0;
                option.dataset.targetUnit = activity.target_unit || 'unidades';
                option.dataset.currentProgress = activity.progress || 0;
                option.dataset.manualPercentage = activity.manual_percentage || 0;
                
                select.appendChild(option);
            }
        });

        // Quando a atividade for alterada, atualizar a interface
        select.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const unitInput = document.getElementById('progress-unit');
            const valueInput = document.getElementById('progress-value');
            
            if (selectedOption && selectedOption.value) {
                const measurementType = selectedOption.dataset.measurementtype;
                const targetValue = parseFloat(selectedOption.dataset.targetvalue);
                const currentProgress = parseFloat(selectedOption.dataset.currentprogress);
                const manualPercentage = parseFloat(selectedOption.dataset.manualpercentage);
                
                switch (measurementType) {
                    case 'units':
                        if (unitInput) unitInput.value = selectedOption.dataset.targetunit || 'unidades';
                        if (valueInput) {
                            valueInput.min = 0;
                            valueInput.max = targetValue;
                            valueInput.step = 1;
                            valueInput.placeholder = `Ex: 10 (atual: ${currentProgress})`;
                        }
                        break;
                    case 'percentage':
                        if (unitInput) unitInput.value = '%';
                        if (valueInput) {
                            valueInput.min = 0;
                            valueInput.max = 100;
                            valueInput.step = 1;
                            valueInput.placeholder = `Ex: 25 (atual: ${manualPercentage}%)`;
                        }
                        break;
                    case 'boolean':
                        if (unitInput) unitInput.value = 'unidades';
                        if (valueInput) {
                            valueInput.min = 1;
                            valueInput.max = 1;
                            valueInput.value = 1;
                            valueInput.readOnly = true;
                        }
                        break;
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar atividades para progresso:', error);
    }
}

// Função auxiliar para calcular progresso (mesma do script.js)
function calculateProgress(activity) {
    if (!activity) return 0;
    
    if (activity.target_value && activity.target_unit) {
        // Tipo units
        if (activity.progress !== undefined) {
            const progress = Math.min((activity.progress / activity.target_value) * 100, 100);
            return Math.round(progress);
        }
        return 0;
    } else if (activity.manual_percentage !== undefined && activity.manual_percentage !== null) {
        // Tipo percentage
        return Math.min(parseFloat(activity.manual_percentage) || 0, 100);
    } else {
        // Tipo boolean
        return activity.status === 'completed' ? 100 : 0;
    }
}

// Função auxiliar para determinar tipo de medição
function getMeasurementType(activity) {
    if (!activity) return 'boolean';
    
    if (activity.target_value && activity.target_unit) {
        return 'units';
    } else if (activity.manual_percentage !== undefined && activity.manual_percentage !== null) {
        return 'percentage';
    } else {
        return 'boolean';
    }
}

// ==============================================
// ATUALIZAR: Carregar atividades para progresso no calendário
// ==============================================

async function loadActivitiesForProgress() {
    try {
        const response = await fetch('/api/activities');
        const activities = await response.json();
        const select = document.getElementById('progress-activity');
        
        if (!select) {
            console.error('Elemento progress-activity não encontrado');
            return;
        }
        
        // Limpar select
        select.innerHTML = '<option value="">Selecione uma atividade</option>';
        
        // REMOVIDO FILTRO: Mostrar todas as atividades
        activities.forEach(activity => {
            const option = document.createElement('option');
            option.value = activity.id;
            option.textContent = `${activity.category_name} - ${activity.name}`;
            
            // Armazenar dados para validação
            option.dataset.measurementType = getMeasurementType(activity);
            option.dataset.targetValue = activity.target_value || 0;
            option.dataset.targetUnit = activity.target_unit || 'unidades';
            option.dataset.currentProgress = activity.progress || 0;
            option.dataset.manualPercentage = activity.manual_percentage || 0;
            
            select.appendChild(option);
        });

        // Quando a atividade for alterada, atualizar a interface
        select.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const unitInput = document.getElementById('progress-unit');
            const valueInput = document.getElementById('progress-value');
            const percentageGroup = document.getElementById('percentage-group-calendar');
            const unitsGroup = document.getElementById('units-group-calendar');
            
            if (selectedOption && selectedOption.value) {
                const measurementType = selectedOption.dataset.measurementtype;
                const targetValue = parseFloat(selectedOption.dataset.targetvalue);
                const currentProgress = parseFloat(selectedOption.dataset.currentprogress);
                const manualPercentage = parseFloat(selectedOption.dataset.manualpercentage);
                
                // Esconder todos os grupos
                if (percentageGroup) percentageGroup.style.display = 'none';
                if (unitsGroup) unitsGroup.style.display = 'none';
                
                switch (measurementType) {
                    case 'units':
                        if (unitsGroup) unitsGroup.style.display = 'block';
                        if (unitInput) unitInput.value = selectedOption.dataset.targetunit || 'unidades';
                        if (valueInput) {
                            valueInput.min = 0;
                            valueInput.max = targetValue;
                            valueInput.step = 1;
                            valueInput.placeholder = `Ex: 10 (atual: ${currentProgress})`;
                        }
                        break;
                    case 'percentage':
                        if (percentageGroup) percentageGroup.style.display = 'block';
                        const percentageSlider = document.getElementById('progress-percentage-calendar');
                        const percentageValue = document.getElementById('percentage-value-calendar');
                        if (percentageSlider && percentageValue) {
                            percentageSlider.value = manualPercentage || 0;
                            percentageValue.textContent = (manualPercentage || 0) + '%';
                        }
                        break;
                    case 'boolean':
                        // Para boolean, usar o grupo de unidades com valor fixo
                        if (unitsGroup) unitsGroup.style.display = 'block';
                        if (unitInput) unitInput.value = 'unidades';
                        if (valueInput) {
                            valueInput.min = 1;
                            valueInput.max = 1;
                            valueInput.value = 1;
                            valueInput.readOnly = true;
                        }
                        break;
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar atividades para progresso:', error);
    }
}

// ==============================================
// ADICIONAR: Configurar slider de porcentagem no calendário
// ==============================================

function setupPercentageSliderCalendar() {
    const percentageSlider = document.getElementById('progress-percentage-calendar');
    const percentageValue = document.getElementById('percentage-value-calendar');
    
    if (percentageSlider && percentageValue) {
        percentageSlider.addEventListener('input', function() {
            percentageValue.textContent = this.value + '%';
        });
    }
}

// ==============================================
// ATUALIZAR: Manipular envio do formulário de progresso no calendário
// ==============================================

async function handleProgressSubmit(e) {
    e.preventDefault();
    
    const activitySelect = document.getElementById('progress-activity');
    const date = document.getElementById('progress-date').value;
    const notes = document.getElementById('progress-notes').value;
    
    if (!activitySelect || !activitySelect.value) {
        showNotification('Selecione uma atividade', 'error');
        return;
    }
    
    const selectedOption = activitySelect.options[activitySelect.selectedIndex];
    const measurementType = selectedOption.dataset.measurementtype;
    const targetValue = parseFloat(selectedOption.dataset.targetvalue);
    
    let formData = {
        activity_id: parseInt(activitySelect.value),
        date: date,
        notes: notes,
        measurement_type: measurementType
    };
    
    // Validações baseadas no tipo de medição
    switch (measurementType) {
        case 'units':
            const progressValue = parseFloat(document.getElementById('progress-value').value);
            if (!progressValue || isNaN(progressValue) || progressValue <= 0) {
                showNotification('Insira um valor válido para o progresso', 'error');
                return;
            }
            if (targetValue && progressValue > targetValue) {
                showNotification(`O valor não pode exceder o alvo (${targetValue})`, 'error');
                return;
            }
            formData.value = progressValue;
            formData.unit = document.getElementById('progress-unit').value || 'unidades';
            formData.completed = targetValue ? progressValue >= targetValue : false;
            break;
            
        case 'percentage':
            const percentageSlider = document.getElementById('progress-percentage-calendar');
            const percentageValue = percentageSlider ? parseFloat(percentageSlider.value) : 0;
            if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
                showNotification('A porcentagem deve estar entre 0 e 100', 'error');
                return;
            }
            formData.value = percentageValue;
            formData.unit = '%';
            formData.completed = percentageValue >= 100;
            break;
            
        case 'boolean':
            formData.value = 1;
            formData.unit = 'unidades';
            formData.completed = true;
            break;
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
            showNotification(
                formData.completed 
                    ? 'Atividade marcada como completa!' 
                    : `Progresso registrado! +${result.points_earned || 0} pontos`,
                'success'
            );
            closeModal('progress-modal');
            
            // Resetar formulário
            document.getElementById('progress-form').reset();
            
            // Atualizar calendário se necessário
            if (window.loadScheduledActivities) {
                loadScheduledActivities();
            }
        } else {
            const error = await response.json();
            showNotification(error.message || 'Erro ao registrar progresso', 'error');
        }
    } catch (error) {
        console.error('Erro ao registrar progresso:', error);
        showNotification('Erro ao registrar progresso', 'error');
    }
}
// Configurar event listeners do calendário - VERSÃO COMPLETA
function setupCalendarEventListeners() {
    console.log('Configurando event listeners do calendário...');
    
    // Navegação do calendário
    const prevWeekBtn = document.getElementById('prev-week');
    const nextWeekBtn = document.getElementById('next-week');
    const todayBtn = document.getElementById('today-btn');
    const scheduleForm = document.getElementById('schedule-form');
    const replicateForm = document.getElementById('replicate-form');
    const progressForm = document.getElementById('progress-form');
    const cancelScheduleBtn = document.getElementById('cancel-schedule');
    const cancelProgressBtn = document.getElementById('cancel-progress') || document.querySelector('[onclick*="progress-modal"]');
    
    console.log('Elementos encontrados:', {
        prevWeekBtn: !!prevWeekBtn,
        nextWeekBtn: !!nextWeekBtn,
        todayBtn: !!todayBtn,
        scheduleForm: !!scheduleForm,
        replicateForm: !!replicateForm,
        progressForm: !!progressForm,
        cancelScheduleBtn: !!cancelScheduleBtn,
        cancelProgressBtn: !!cancelProgressBtn
    });

    // Navegação da semana
    if (prevWeekBtn) {
        prevWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() - 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (nextWeekBtn) {
        nextWeekBtn.addEventListener('click', function() {
            const newDate = new Date(currentWeek);
            newDate.setDate(newDate.getDate() + 7);
            currentWeek = newDate;
            updateCalendarView();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', function() {
            currentWeek = new Date();
            updateCalendarView();
        });
    }

    // Botão cancelar agendamento
    if (cancelScheduleBtn) {
        cancelScheduleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('schedule-modal');
            
            // Resetar formulário
            const scheduleForm = document.getElementById('schedule-form');
            if (scheduleForm) {
                scheduleForm.reset();
                
                // Resetar modo de edição
                const submitButton = scheduleForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.textContent = 'Agendar';
                    delete submitButton.dataset.editMode;
                    if (document.getElementById('schedule-duration').dataset.editScheduleId) {
                        delete document.getElementById('schedule-duration').dataset.editScheduleId;
                    }
                }
            }
        });
    }

    // Botão cancelar progresso
    if (cancelProgressBtn) {
        cancelProgressBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal('progress-modal');
            
            // Resetar formulário
            const progressForm = document.getElementById('progress-form');
            if (progressForm) {
                progressForm.reset();
                
                // Resetar radio buttons
                const partialRadio = document.querySelector('input[name="progress-type"][value="partial"]');
                if (partialRadio) partialRadio.checked = true;
                toggleProgressType();
            }
        });
    }

    // Formulário de agendamento
    if (scheduleForm) {
        console.log('Adicionando listener ao formulário de agendamento');
        scheduleForm.addEventListener('submit', handleScheduleSubmit);
    }

    // Formulário de replicação
    if (replicateForm) {
        replicateForm.addEventListener('submit', handleReplicateSubmit);
    }

    // Formulário de progresso
    if (progressForm) {
        console.log('Adicionando listener ao formulário de progresso');
        progressForm.addEventListener('submit', handleProgressSubmit);
        
        // Configurar evento de change para atividade no progresso
        const progressActivitySelect = document.getElementById('progress-activity');
        if (progressActivitySelect) {
            progressActivitySelect.addEventListener('change', function() {
                const selectedOption = this.options[this.selectedIndex];
                const unitInput = document.getElementById('progress-unit');
                const valueInput = document.getElementById('progress-value');
                
                if (selectedOption && selectedOption.value) {
                    const measurementType = selectedOption.dataset.measurementtype;
                    const targetValue = parseFloat(selectedOption.dataset.targetvalue);
                    const currentProgress = parseFloat(selectedOption.dataset.currentprogress);
                    const manualPercentage = parseFloat(selectedOption.dataset.manualpercentage);
                    
                    switch (measurementType) {
                        case 'units':
                            if (unitInput) unitInput.value = selectedOption.dataset.targetunit || 'unidades';
                            if (valueInput) {
                                valueInput.min = 0;
                                valueInput.max = targetValue || 1000;
                                valueInput.step = 1;
                                valueInput.placeholder = `Ex: 10 (atual: ${currentProgress || 0})`;
                                valueInput.value = '';
                            }
                            break;
                            
                        case 'percentage':
                            if (unitInput) unitInput.value = '%';
                            if (valueInput) {
                                valueInput.min = 0;
                                valueInput.max = 100;
                                valueInput.step = 1;
                                valueInput.placeholder = `Ex: 25 (atual: ${manualPercentage || 0}%)`;
                                valueInput.value = '';
                            }
                            break;
                            
                        case 'boolean':
                            if (unitInput) unitInput.value = 'unidades';
                            if (valueInput) {
                                valueInput.min = 1;
                                valueInput.max = 1;
                                valueInput.value = 1;
                                valueInput.readOnly = true;
                            }
                            break;
                    }
                }
            });
        }
        
        // Configurar tipo de progresso (parcial/completo)
        const progressTypeRadios = document.querySelectorAll('input[name="progress-type"]');
        progressTypeRadios.forEach(radio => {
            radio.addEventListener('change', toggleProgressType);
        });
    }

    // Configurar evento para tipo de replicação
    const replicateTypeSelect = document.getElementById('replicate-type');
    if (replicateTypeSelect) {
        replicateTypeSelect.addEventListener('change', function() {
            const daysContainer = document.getElementById('replicate-days-container');
            if (this.value === 'weekly') {
                daysContainer.style.display = 'block';
            } else {
                daysContainer.style.display = 'none';
            }
        });
        
        // Chamar uma vez para configurar estado inicial
        const event = new Event('change');
        replicateTypeSelect.dispatchEvent(event);
    }

    // Configurar datas mínimas
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Data mínima para agendamento (hoje)
    const scheduleDateInput = document.getElementById('scheduled-day');
    if (scheduleDateInput) {
        scheduleDateInput.min = todayStr;
        if (!scheduleDateInput.value) {
            scheduleDateInput.value = todayStr;
        }
    }
    
    // Data mínima para progresso (pode ser passado)
    const progressDateInput = document.getElementById('progress-date');
    if (progressDateInput && !progressDateInput.value) {
        progressDateInput.value = todayStr;
    }
    
    // Data mínima para replicação (amanhã)
    const replicateUntilInput = document.getElementById('replicate-until-date');
    if (replicateUntilInput) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        replicateUntilInput.min = tomorrow.toISOString().split('T')[0];
        
        // Definir data padrão (1 semana a frente)
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        replicateUntilInput.value = nextWeek.toISOString().split('T')[0];
    }
    
    // Configurar hora atual no agendamento
    const scheduleTimeInput = document.getElementById('scheduled-time');
    if (scheduleTimeInput && !scheduleTimeInput.value) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = Math.floor(now.getMinutes() / 15) * 15; // Arredondar para múltiplos de 15
        scheduleTimeInput.value = `${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    // Fechar modais ao clicar no X
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Fechar modal ao clicar fora
    window.addEventListener('click', function(event) {
        const modals = document.getElementsByClassName('modal');
        for (let modal of modals) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        }
    });

    // Fechar menu de opções de atividade
    window.addEventListener('click', function(e) {
        const optionsMenu = document.getElementById('activity-options-menu');
        if (optionsMenu && !e.target.closest('.scheduled-activity') && 
            !e.target.closest('#activity-options-menu')) {
            closeActivityOptions();
        }
    });

    // Fechar com tecla ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Fechar menu de opções
            closeActivityOptions();
            
            // Fechar modais abertos
            const openModals = document.querySelectorAll('.modal[style*="display: block"]');
            openModals.forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });

    // Configurar drag and drop
    setupDragAndDrop();

    console.log('Event listeners configurados com sucesso');
}
// Renderizar agendamentos no calendário - VERSÃO CORRIGIDA
function renderScheduledActivities() {
    // Limpar agendamentos anteriores
    document.querySelectorAll('.scheduled-activity').forEach(el => el.remove());
    
    console.log('Renderizando', scheduledActivities.length, 'agendamentos');
    
    scheduledActivities.forEach(schedule => {
        // Parse da data manualmente para evitar problemas de fuso horário
        const [year, month, day] = schedule.scheduled_date.split('-').map(Number);
        const scheduledDate = new Date(year, month - 1, day);
        
        const weekStart = getWeekStart(currentWeek);
        
        // CORREÇÃO: Cálculo correto da diferença de dias
        const dayDiff = Math.floor((scheduledDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
        console.log('Processando agendamento:', {
            activity: schedule.activity_name,
            scheduledDate: schedule.scheduled_date,
            dayDiff: dayDiff,
            weekStart: weekStart.toISOString().split('T')[0]
        });
        
        if (dayDiff >= 0 && dayDiff < 7) {
            const [hours, minutes] = schedule.scheduled_time.split(':');
            const startHour = parseInt(hours);
            const duration = schedule.duration;
            
            // Calcular horas de término (considerando que cada slot é 1 hora)
            const totalSlots = Math.ceil(duration / 60); // Arredonda para cima para slots completos
            const endHour = startHour + totalSlots;
            
            console.log(`Atividade: ${schedule.activity_name}, Início: ${startHour}h, Duração: ${duration}min, Slots: ${totalSlots}`);
            
            // Encontrar todos os slots que esta atividade deve ocupar
            for (let slotHour = startHour; slotHour < endHour && slotHour <= 22; slotHour++) {
                const daySlot = document.querySelector(`.day-slot[data-day="${dayDiff}"][data-hour="${slotHour}"]`);
                if (daySlot) {
                    const activityElement = document.createElement('div');
                    activityElement.className = 'scheduled-activity';
                    activityElement.dataset.scheduleId = schedule.id;
                    activityElement.draggable = true;
                    activityElement.style.backgroundColor = schedule.category_color || '#3498db';
                    activityElement.style.color = 'white';
                    activityElement.style.padding = '4px 6px';
                    activityElement.style.borderRadius = '4px';
                    activityElement.style.fontSize = '0.7rem';
                    activityElement.style.margin = '2px';
                    activityElement.style.cursor = 'move';
                    activityElement.style.borderLeft = '3px solid rgba(0,0,0,0.2)';
                    activityElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
                    
                    // Determinar se é o primeiro, último ou slot do meio
                    const isFirstSlot = slotHour === startHour;
                    const isLastSlot = slotHour === (endHour - 1) || slotHour === 22;
                    
                    if (isFirstSlot) {
                        // Primeiro slot - mostrar informações completas
                        activityElement.style.height = '100%';
                        activityElement.style.display = 'flex';
                        activityElement.style.flexDirection = 'column';
                        activityElement.style.justifyContent = 'space-between';
                        
                        activityElement.innerHTML = `
                            <div style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${schedule.activity_name}
                            </div>
                            <div style="font-size: 0.6rem; opacity: 0.9;">
                                ${schedule.scheduled_time} - ${duration}min
                            </div>
                        `;
                        
                        activityElement.title = `${schedule.activity_name} (${schedule.scheduled_time} - ${duration}min)\nClique para opções | Arraste para mover`;
                    } else {
                        // Slots subsequentes - mostrar como continuação
                        activityElement.style.height = '100%';
                        activityElement.style.backgroundColor = lightenColor(schedule.category_color || '#3498db', 20);
                        activityElement.style.borderLeft = '3px solid ' + (schedule.category_color || '#3498db');
                        
                        if (isLastSlot) {
                            activityElement.innerHTML = `
                                <div style="font-size: 0.6rem; opacity: 0.7; text-align: center; margin-top: 5px;">
                                    ↳ continua
                                </div>
                            `;
                        } else {
                            activityElement.innerHTML = `
                                <div style="font-size: 0.6rem; opacity: 0.5; text-align: center;">
                                    │
                                </div>
                            `;
                        }
                        
                        activityElement.title = `Continuação: ${schedule.activity_name}`;
                    }
                    
                    // Adicionar tooltip com mais informações
                    activityElement.addEventListener('mouseenter', function() {
                        this.style.opacity = '0.9';
                        this.style.transform = 'scale(1.02)';
                        this.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
                    });
                    
                    activityElement.addEventListener('mouseleave', function() {
                        this.style.opacity = '1';
                        this.style.transform = 'scale(1)';
                        this.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
                    });
                    
                    // Clique para abrir menu de opções (apenas no primeiro slot)
                    if (isFirstSlot) {
                        activityElement.addEventListener('click', function(e) {
                            e.stopPropagation();
                            openActivityOptions(schedule.id);
                        });
                    } else {
                        activityElement.style.cursor = 'default';
                        activityElement.draggable = false;
                    }
                    
                    daySlot.appendChild(activityElement);
                    
                    console.log('Agendamento renderizado no dia:', dayDiff, 'hora:', slotHour);
                } else {
                    console.warn('Slot não encontrado para dia:', dayDiff, 'hora:', slotHour);
                }
            }
        } else {
            console.warn('Agendamento fora da semana atual - dayDiff:', dayDiff);
        }
    });
}

// ATUALIZAR A FUNÇÃO openActivityOptions PARA INCLUIR TODAS AS OPÇÕES
function openActivityOptions(scheduleId) {
    const schedule = scheduledActivities.find(s => s.id === scheduleId);
    if (!schedule) return;

    // Criar ou atualizar menu de opções
    let optionsMenu = document.getElementById('activity-options-menu');
    if (!optionsMenu) {
        optionsMenu = document.createElement('div');
        optionsMenu.id = 'activity-options-menu';
        optionsMenu.className = 'activity-options-menu';
        document.body.appendChild(optionsMenu);
    }

    optionsMenu.innerHTML = `
        <div class="options-content">
            <h4>${schedule.activity_name}</h4>
            <p>${schedule.scheduled_date} às ${schedule.scheduled_time}</p>
            <p><strong>Duração:</strong> ${schedule.duration} minutos</p>
            
            <div class="options-section">
                <h5>Gerenciar Agendamento</h5>
                <div class="options-buttons">
                    <button class="btn btn-outline btn-sm" onclick="editSchedule(${scheduleId})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="changeScheduleDuration(${scheduleId})">
                        <i class="fas fa-clock"></i> Alterar Duração
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="moveScheduleToDay(${scheduleId})">
                        <i class="fas fa-calendar-day"></i> Mudar Data
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="openReplicateModal(${scheduleId})">
                        <i class="fas fa-copy"></i> Replicar
                    </button>
                </div>
            </div>
            
            <div class="options-section">
                <h5>Registrar Progresso</h5>
                <div class="options-buttons">
                    <button class="btn btn-success btn-sm" onclick="confirmActivity(${scheduleId})">
                        <i class="fas fa-check-circle"></i> Confirmar Realização
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="logPartialProgress(${scheduleId})">
                        <i class="fas fa-tasks"></i> Registrar Progresso
                    </button>
                </div>
            </div>
            
            <div class="options-section">
                <h5>Ações</h5>
                <div class="options-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deleteSchedule(${scheduleId})">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="closeActivityOptions()">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            </div>
        </div>
    `;

    // Posicionar menu próximo ao elemento clicado
    const activityElement = document.querySelector(`[data-schedule-id="${scheduleId}"]`);
    if (activityElement) {
        const rect = activityElement.getBoundingClientRect();
        optionsMenu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        optionsMenu.style.left = `${rect.left + window.scrollX}px`;
        
        // Ajustar se o menu sair da tela
        const menuRect = optionsMenu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            optionsMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        }
    }

    optionsMenu.style.display = 'block';
}

// Inicializar calendário - VERSÃO MELHORADA
function initCalendar() {
    console.log('Inicializando calendário...');
    
    // Remover atividades estáticas do HTML
    removeStaticActivities();
    
    updateCalendarView();
    loadCategoryLegend();
    setupCalendarEventListeners();
    setupDragAndDrop();
    
    // Verificar imediatamente e configurar verificação contínua
    checkForScheduledActivity();
    setupLocalStorageCheck();
    
    console.log('Calendário inicializado com sucesso');
}

// NOVA função para remover atividades estáticas
function removeStaticActivities() {
    // Remover todas as atividades agendadas estáticas
    document.querySelectorAll('.scheduled-activity').forEach(el => {
        if (!el.dataset.scheduleId) { // Remover apenas as que não têm ID (estáticas)
            el.remove();
        }
    });
}

// Fechar menu de opções
function closeActivityOptions() {
    const optionsMenu = document.getElementById('activity-options-menu');
    if (optionsMenu) {
        optionsMenu.style.display = 'none';
    }
}

// Deletar agendamento
async function deleteSchedule(scheduleId) {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) {
        closeActivityOptions();
        return;
    }

    try {
        const response = await fetch(`/api/schedules/${scheduleId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Agendamento removido com sucesso!', 'success');
            closeActivityOptions();
            loadScheduledActivities();
        } else {
            showNotification('Erro ao remover agendamento', 'error');
        }
    } catch (error) {
        console.error('Erro ao deletar agendamento:', error);
        showNotification('Erro ao remover agendamento', 'error');
    }
}

// Carregar legenda de categorias
async function loadCategoryLegend() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        const legendContainer = document.getElementById('category-legend');
        
        if (!legendContainer) return;
        
        legendContainer.innerHTML = '';
        categories.forEach(category => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-color" style="background-color: ${category.color}"></div>
                <span class="legend-text">${category.name}</span>
            `;
            legendContainer.appendChild(legendItem);
        });
    } catch (error) {
        console.error('Erro ao carregar legenda:', error);
    }
}

// CORREÇÃO: Função para obter início da semana (segunda-feira)
function getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // Obter o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const day = d.getDay();
    
    // Calcular a diferença para a segunda-feira
    // Se for domingo (day = 0), voltar 6 dias, caso contrário voltar (day - 1) dias
    const diff = day === 0 ? -6 : 1 - day;
    
    d.setDate(d.getDate() + diff);
    return d;
}

// Função para debug - verificar se as semanas estão corretas
function debugWeekNavigation() {
    const weekStart = getWeekStart(currentWeek);
    console.log('=== DEBUG NAVEGAÇÃO SEMANAL ===');
    console.log('Data de referência:', currentWeek.toISOString().split('T')[0]);
    console.log('Início da semana (segunda):', weekStart.toISOString().split('T')[0]);
    
    // Mostrar todos os 7 dias da semana
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        console.log(`Dia ${i}: ${day.toISOString().split('T')[0]} - ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day.getDay()]}`);
    }
    console.log('================================');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Forçar verificação do localStorage periodicamente
function setupLocalStorageCheck() {
    // Verificar a cada segundo por 10 segundos se há atividade para agendar
    let checks = 0;
    const maxChecks = 10;
    
    const checkInterval = setInterval(() => {
        const activityToSchedule = localStorage.getItem('activityToSchedule');
        if (activityToSchedule) {
            console.log('Atividade encontrada no localStorage, iniciando agendamento...');
            checkForScheduledActivity();
            clearInterval(checkInterval);
        }
        
        checks++;
        if (checks >= maxChecks) {
            clearInterval(checkInterval);
        }
    }, 1000);
}

// Sistema de notificações
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

// Verificar se estamos na página do calendário antes de inicializar
function isCalendarPage() {
    return window.location.pathname === '/calendar' || 
           document.querySelector('.calendar-container') !== null;
}

// Inicializar calendário quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Carregado - Verificando se é página do calendário...');
    
    if (isCalendarPage()) {
        console.log('Inicializando calendário...');
        initCalendar();
    } else {
        console.log('Não é página do calendário, ignorando inicialização.');
    }
});

// Fechar menu de opções ao clicar fora
document.addEventListener('click', function(e) {
    if (!e.target.closest('.scheduled-activity') && !e.target.closest('.activity-options-menu')) {
        closeActivityOptions();
    }
});

// Exportar funções para uso global
window.initCalendar = initCalendar;
window.openScheduleModal = openScheduleModal;
window.openReplicateModal = openReplicateModal;
window.closeActivityOptions = closeActivityOptions;
window.deleteSchedule = deleteSchedule;
window.showModal = showModal;
window.closeModal = closeModal;
window.showNotification = showNotification;
window.getWeekStart = getWeekStart;