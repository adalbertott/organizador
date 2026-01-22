from flask import Flask, render_template, request, jsonify, redirect, url_for, session, g
from models import db, User, Category, Activity, Progress, Reward, ScheduledActivity, UserPoints, PointTransaction, WeeklyStreak    
from datetime import datetime, date, timedelta
import json
import os
import random
import logging
from sqlalchemy import func, or_, text, desc, asc, and_, not_, case
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import traceback
import time

# ============ CONFIGURAÇÃO ============
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'gamification_secret_key_prod_2025_v3')

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuração para PostgreSQL
database_url = os.environ.get('DATABASE_URL')
if database_url:
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    # Para desenvolvimento local
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:password@localhost:5432/gamification_db'
    
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)

# Configurações de pool de conexões para PostgreSQL
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_recycle': 300,
    'pool_pre_ping': True,
    'pool_size': 10,
    'max_overflow': 20,
}

db.init_app(app)

# ... (resto do código permanece igual) ...
# ============ DECORATORS E MIDDLEWARE ============
def login_required(f):
    """Decorator para verificar autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Authentication required', 'code': 401}), 401
            return redirect(url_for('dashboard'))
        g.user_id = user_id
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator para verificar se é admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401
        
        user = User.query.get(user_id)
        if not user or getattr(user, 'is_admin', False) is False:
            return jsonify({'error': 'Admin privileges required'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

@app.before_request
def before_request():
    """Executar antes de cada requisição"""
    g.start_time = time.time()
    g.user_id = session.get('user_id')
    
    # Log da requisição
    if request.path not in ['/static/', '/favicon.ico']:
        logger.info(f"{request.method} {request.path} - User: {g.user_id}")

@app.after_request
def after_request(response):
    """Executar após cada requisição"""
    # Calcular tempo de resposta
    if hasattr(g, 'start_time'):
        elapsed = time.time() - g.start_time
        response.headers['X-Response-Time'] = f'{elapsed:.3f}s'
    
    # Adicionar headers de segurança
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # CORS para desenvolvimento
    if app.debug:
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    return response

@app.errorhandler(404)
def not_found_error(error):
    """Handler para erro 404"""
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Resource not found', 'code': 404}), 404
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    """Handler para erro 500"""
    db.session.rollback()
    logger.error(f"Internal Server Error: {error}")
    
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error', 'code': 500}), 500
    return render_template('500.html'), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Handler para exceções gerais"""
    db.session.rollback()
    logger.error(f"Unhandled Exception: {str(e)}")
    logger.error(traceback.format_exc())
    
    if request.path.startswith('/api/'):
        return jsonify({
            'error': 'An unexpected error occurred',
            'message': str(e) if app.debug else 'Internal server error',
            'code': 500
        }), 500
    
    return render_template('error.html', error=str(e) if app.debug else 'An error occurred'), 500

# ============ FUNÇÕES AUXILIARES ============
def get_current_user_id():
    """Obter ID do usuário atual da sessão"""
    return session.get('user_id')

def get_current_user():
    """Obter objeto do usuário atual"""
    user_id = get_current_user_id()
    if user_id:
        return User.query.get(user_id)
    return None

def validate_json_data(required_fields=None):
    """Validar dados JSON da requisição"""
    if not request.is_json:
        return False, jsonify({'error': 'Content-Type must be application/json'}), 400
    
    data = request.get_json(silent=True)
    if data is None:
        return False, jsonify({'error': 'Invalid JSON data'}), 400
    
    if required_fields:
        missing = [field for field in required_fields if field not in data]
        if missing:
            return False, jsonify({'error': f'Missing required fields: {missing}'}), 400
    
    return True, data, None

def generate_api_response(data=None, message="", success=True, code=200):
    """Gerar resposta padrão da API"""
    response = {
        'success': success,
        'message': message,
        'timestamp': datetime.utcnow().isoformat(),
        'code': code
    }
    
    if data is not None:
        response['data'] = data
    
    return jsonify(response), code

def calculate_activity_progress(activity):
    """Calcular progresso percentual de uma atividade"""
    if not activity:
        return 0
    
    try:
        if activity.measurement_type == 'units':
            if activity.target_value and activity.target_value > 0:
                total_progress = db.session.query(func.sum(Progress.value)).filter(
                    Progress.activity_id == activity.id,
                    Progress.completed == True
                ).scalar() or 0
                
                # Incluir progressos parciais
                partial_progress = db.session.query(func.sum(Progress.value)).filter(
                    Progress.activity_id == activity.id,
                    Progress.completed == False
                ).scalar() or 0
                
                total = total_progress + partial_progress
                progress_percentage = min((total / activity.target_value) * 100, 100)
                return round(progress_percentage, 1)
            return 0
        
        elif activity.measurement_type == 'percentage':
            return min(activity.manual_percentage or 0, 100)
        
        else:  # boolean
            return 100 if activity.status == 'completed' else 0
            
    except Exception as e:
        logger.error(f"Error calculating progress for activity {activity.id}: {e}")
        return 0

def get_current_progress_value(activity):
    """Obter valor atual de progresso"""
    if activity.measurement_type == 'units':
        total = db.session.query(func.sum(Progress.value)).filter(
            Progress.activity_id == activity.id
        ).scalar() or 0
        return total
    
    elif activity.measurement_type == 'percentage':
        return activity.manual_percentage or 0
    
    else:  # boolean
        return 1 if activity.status == 'completed' else 0

def calculate_points_for_progress(activity, value, completed=False):
    """Calcular pontos baseado no progresso"""
    base_points = 0
    
    if activity.measurement_type == 'units' and activity.target_value and activity.target_value > 0:
        progress_ratio = (value / activity.target_value) * 100
        base_points = int(progress_ratio / 5)  # 20 pontos por 100%
        
        if completed:
            base_points += 10  # Bônus por completar
    
    elif activity.measurement_type == 'percentage':
        base_points = int(value / 5)  # 20 pontos por 100%
        if completed:
            base_points += 10
    
    elif activity.measurement_type == 'boolean' and completed:
        base_points = 15
    
    # Garantir mínimo e máximo
    base_points = max(1, min(base_points, 50))
    
    return base_points

def update_user_points(user_id, points, description, activity_id=None):
    """Atualizar pontos do usuário e registrar transação"""
    try:
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if not user_points:
            user_points = UserPoints(user_id=user_id, points=0)
            db.session.add(user_points)
        
        user_points.points += points
        user_points.last_updated = datetime.utcnow()
        
        # Registrar transação
        transaction = PointTransaction(
            user_id=user_id,
            points=points,
            description=description,
            activity_id=activity_id
        )
        db.session.add(transaction)
        
        db.session.flush()
        return user_points.points
        
    except Exception as e:
        logger.error(f"Error updating user points: {e}")
        db.session.rollback()
        raise

def calculate_streak_bonus(user_id, activity_date=None):
    """Calcular bônus de sequência"""
    try:
        streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
        if not streak:
            streak = WeeklyStreak(user_id=user_id, streak_count=0)
            db.session.add(streak)
        
        today = activity_date or date.today()
        last_activity = streak.last_activity_date
        
        # Reset streak se passou mais de 7 dias
        if not last_activity or (today - last_activity).days > 7:
            streak.streak_count = 1
        # Incrementar se foi na última semana
        elif 1 <= (today - last_activity).days <= 7:
            streak.streak_count += 1
        # Mesmo dia, manter streak
        else:
            pass  # Mesmo dia, não incrementar
        
        streak.last_activity_date = today
        
        # Calcular bônus baseado no streak
        bonus_multiplier = min(streak.streak_count // 4 + 1, 5)  # Máximo 5x
        bonus_points = bonus_multiplier * 2  # 2 pontos por nível
        
        db.session.flush()
        
        # Mensagem motivacional
        messages = {
            1: "🏁 Primeiro dia! Bom começo!",
            3: "🔥 3 dias seguidos! Continue assim!",
            7: "🌟 1 semana! Excelente consistência!",
            14: "🚀 2 semanas! Você está no foco!",
            21: "💪 3 semanas! Impressioante!",
            30: "🎯 1 mês! Ninguém segura você!"
        }
        
        message = messages.get(streak.streak_count, 
                             f"📈 {streak.streak_count} dias seguidos! Continue!")
        
        return bonus_points, message, streak.streak_count
        
    except Exception as e:
        logger.error(f"Error calculating streak bonus: {e}")
        return 0, "", 0

def create_sample_data_for_user(user_id, force=False):
    """Criar dados de exemplo para um usuário"""
    try:
        # Verificar se já existem categorias para evitar duplicação
        if not force and Category.query.filter_by(user_id=user_id).count() > 0:
            logger.info(f"User {user_id} already has data, skipping sample creation")
            return
        
        # Criar categorias padrão
        categories_data = [
            {'name': '📚 Leitura', 'description': 'Livros, artigos e materiais de leitura', 
             'color': '#3498db', 'icon': '📚'},
            {'name': '💪 Exercício', 'description': 'Atividades físicas e esportes', 
             'color': '#2ecc71', 'icon': '💪'},
            {'name': '🎓 Estudo', 'description': 'Aprendizado e desenvolvimento profissional', 
             'color': '#9b59b6', 'icon': '🎓'},
            {'name': '💼 Trabalho', 'description': 'Tarefas e projetos profissionais', 
             'color': '#e74c3c', 'icon': '💼'},
            {'name': '🎨 Criatividade', 'description': 'Arte, música e projetos criativos', 
             'color': '#f39c12', 'icon': '🎨'},
            {'name': '🏠 Doméstico', 'description': 'Tarefas domésticas e organização', 
             'color': '#1abc9c', 'icon': '🏠'},
            {'name': '🧘 Bem-estar', 'description': 'Meditação, yoga e autocuidado', 
             'color': '#d35400', 'icon': '🧘'},
        ]
        
        categories = []
        for cat_data in categories_data:
            category = Category(
                name=cat_data['name'],
                description=cat_data['description'],
                color=cat_data['color'],
                icon=cat_data['icon'],
                user_id=user_id
            )
            db.session.add(category)
            categories.append(category)
        
        db.session.flush()
        
        # Criar atividades de exemplo
        activities_data = [
            {
                'name': 'Ler "Dom Casmurro"',
                'description': 'Clássico da literatura brasileira de Machado de Assis',
                'category_idx': 0,
                'measurement_type': 'units',
                'target_value': 300,
                'target_unit': 'páginas',
                'status': 'in_progress',
                'deadline': (date.today() + timedelta(days=30)).isoformat()
            },
            {
                'name': 'Corrida matinal',
                'description': '30 minutos de corrida leve',
                'category_idx': 1,
                'measurement_type': 'boolean',
                'status': 'in_progress'
            },
            {
                'name': 'Curso de Python Avançado',
                'description': 'Completar curso online de Python',
                'category_idx': 2,
                'measurement_type': 'percentage',
                'manual_percentage': 45.0,
                'status': 'in_progress'
            },
            {
                'name': 'Organizar arquivos do projeto',
                'description': 'Reorganizar estrutura de pastas e documentos',
                'category_idx': 3,
                'measurement_type': 'boolean',
                'status': 'completed'
            },
            {
                'name': 'Pintar quadro',
                'description': 'Finalizar pintura a óleo iniciada',
                'category_idx': 4,
                'measurement_type': 'percentage',
                'manual_percentage': 75.0,
                'status': 'in_progress'
            },
            {
                'name': 'Limpar quarto',
                'description': 'Organização e limpeza completa',
                'category_idx': 5,
                'measurement_type': 'boolean',
                'status': 'want_to_do'
            },
            {
                'name': 'Sessão de meditação',
                'description': '20 minutos de meditação guiada',
                'category_idx': 6,
                'measurement_type': 'boolean',
                'status': 'in_progress'
            }
        ]
        
        for act_data in activities_data:
            activity = Activity(
                name=act_data['name'],
                description=act_data['description'],
                category_id=categories[act_data['category_idx']].id,
                user_id=user_id,
                measurement_type=act_data['measurement_type'],
                status=act_data['status'],
                created_at=datetime.utcnow() - timedelta(days=random.randint(1, 10))
            )
            
            if 'target_value' in act_data:
                activity.target_value = act_data['target_value']
                activity.target_unit = act_data['target_unit']
            
            if 'manual_percentage' in act_data:
                activity.manual_percentage = act_data['manual_percentage']
            
            if 'deadline' in act_data:
                activity.deadline = datetime.strptime(act_data['deadline'], '%Y-%m-%d').date()
            
            db.session.add(activity)
        
        # Criar recompensas
        rewards_data = [
            {
                'name': '🎖️ Iniciante Produtivo',
                'description': 'Complete sua primeira atividade',
                'points_required': 50,
                'reward_type': 'badge'
            },
            {
                'name': '📚 Leitor Assíduo',
                'description': 'Leia mais de 100 páginas',
                'points_required': 100,
                'reward_type': 'badge'
            },
            {
                'name': '💪 Atleta da Semana',
                'description': 'Exercite-se 5 dias seguidos',
                'points_required': 150,
                'reward_type': 'achievement'
            },
            {
                'name': '🌟 Estrela em Ascensão',
                'description': 'Alcance 500 pontos totais',
                'points_required': 500,
                'reward_type': 'level'
            },
            {
                'name': '🏆 Mestre da Produtividade',
                'description': 'Complete 50 atividades',
                'points_required': 1000,
                'reward_type': 'trophy'
            }
        ]
        
        for reward_data in rewards_data:
            reward = Reward(
                name=reward_data['name'],
                description=reward_data['description'],
                points_required=reward_data['points_required'],
                reward_type=reward_data['reward_type'],
                condition_type='points',
                condition_value=reward_data['points_required'],
                user_id=user_id
            )
            db.session.add(reward)
        
        # Inicializar pontos do usuário
        user_points = UserPoints(
            user_id=user_id,
            points=100,  # Pontos iniciais
            last_updated=datetime.utcnow()
        )
        db.session.add(user_points)
        
        # Inicializar streak
        streak = WeeklyStreak(
            user_id=user_id,
            streak_count=1,
            last_activity_date=date.today() - timedelta(days=1)
        )
        db.session.add(streak)
        
        # Criar alguns agendamentos
        scheduled_data = [
            {
                'activity_name': 'Corrida matinal',
                'scheduled_date': date.today().isoformat(),
                'scheduled_time': '07:00',
                'duration': 30
            },
            {
                'activity_name': 'Sessão de meditação',
                'scheduled_date': (date.today() + timedelta(days=1)).isoformat(),
                'scheduled_time': '20:00',
                'duration': 20
            }
        ]
        
        for sched_data in scheduled_data:
            # Encontrar atividade pelo nome
            activity = Activity.query.filter_by(
                name=sched_data['activity_name'],
                user_id=user_id
            ).first()
            
            if activity:
                schedule = ScheduledActivity(
                    activity_id=activity.id,
                    user_id=user_id,
                    scheduled_date=datetime.strptime(sched_data['scheduled_date'], '%Y-%m-%d').date(),
                    scheduled_time=sched_data['scheduled_time'],
                    duration=sched_data['duration']
                )
                db.session.add(schedule)
        
        db.session.commit()
        logger.info(f"Sample data created for user {user_id}")
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating sample data for user {user_id}: {e}")
        raise

# ============ ROTAS DE PÁGINAS ============
@app.route('/')
def index():
    """Página inicial - redireciona para dashboard"""
    user_id = get_current_user_id()
    if user_id:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Dashboard principal"""
    return render_template('dashboard.html')

@app.route('/calendar')
def calendar_page():
    """Página do calendário"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('calendar.html')

@app.route('/categories')
def categories_page():
    """Página de categorias"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('categories.html')

@app.route('/activities')
def activities_page():
    """Página de atividades"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('activities.html')

@app.route('/rewards')
def rewards_page():
    """Página de recompensas"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('rewards.html')

@app.route('/profile')
def profile_page():
    """Página de perfil"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('profile.html')

@app.route('/analytics')
def analytics_page():
    """Página de análises"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('analytics.html')

@app.route('/settings')
def settings_page():
    """Página de configurações"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('settings.html')

@app.route('/history')
def history_page():
    """Página de histórico"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('history.html')

@app.route('/activity_map')
def activity_map_page():
    """Mapa de atividades"""
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('index'))
    return render_template('activity_map.html')

@app.route('/login')
def login_page():
    """Página de login"""
    if get_current_user_id():
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/register')
def register_page():
    """Página de registro"""
    if get_current_user_id():
        return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/about')
def about_page():
    """Página sobre o sistema"""
    return render_template('about.html')

@app.route('/help')
def help_page():
    """Página de ajuda"""
    return render_template('help.html')

@app.context_processor
def utility_processor():
    """Adicionar funções úteis ao contexto dos templates"""
    return {
        'now': datetime.now,
        'current_year': datetime.now().year,
        'get_current_user': get_current_user,
        'format_date': lambda d: d.strftime('%d/%m/%Y') if d else '',
        'format_datetime': lambda d: d.strftime('%d/%m/%Y %H:%M') if d else '',
    }

# ============ API DE AUTENTICAÇÃO ============
@app.route('/api/auth/register', methods=['POST'])
def api_auth_register():
    """Registrar novo usuário"""
    try:
        valid, data, error_response = validate_json_data(['username', 'email', 'password'])
        if not valid:
            return error_response
        
        # Verificar se usuário já existe
        if User.query.filter_by(username=data['username']).first():
            return generate_api_response(
                message='Username already exists',
                success=False,
                code=400
            )
        
        if User.query.filter_by(email=data['email']).first():
            return generate_api_response(
                message='Email already registered',
                success=False,
                code=400
            )
        
        # Criar novo usuário
        user = User(
            username=data['username'],
            email=data['email'],
            created_at=datetime.utcnow()
        )
        
        # Em produção, usar hash de senha:
        # user.password_hash = generate_password_hash(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        # Criar dados iniciais
        create_sample_data_for_user(user.id)
        
        # Logar automaticamente
        session['user_id'] = user.id
        session['username'] = user.username
        
        return generate_api_response(
            data={
                'id': user.id,
                'username': user.username,
                'email': user.email
            },
            message='Registration successful',
            success=True
        )
        
    except IntegrityError:
        db.session.rollback()
        return generate_api_response(
            message='Registration failed - database error',
            success=False,
            code=500
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {e}")
        return generate_api_response(
            message='Registration failed - server error',
            success=False,
            code=500
        )

@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    """Login de usuário"""
    try:
        valid, data, error_response = validate_json_data(['username', 'password'])
        if not valid:
            return error_response
        
        # Sistema simplificado para demonstração
        # Em produção, verificar hash da senha
        if data['username'] in ['usuario1', 'usuario2'] and data['password'] == '123321':
            user_id = 1 if data['username'] == 'usuario1' else 2
            
            # Verificar/criar usuário
            user = User.query.get(user_id)
            if not user:
                if user_id == 1:
                    user = User(id=user_id, username='usuario1', email='usuario1@exemplo.com')
                else:
                    user = User(id=user_id, username='usuario2', email='usuario2@exemplo.com')
                db.session.add(user)
                db.session.commit()
                
                # Criar dados iniciais
                create_sample_data_for_user(user_id)
            
            # Criar sessão
            session['user_id'] = user_id
            session['username'] = data['username']
            
            # Atualizar último login
            # user.last_login = datetime.utcnow()
            # db.session.commit()
            
            return generate_api_response(
                data={
                    'id': user_id,
                    'username': data['username']
                },
                message='Login successful'
            )
        else:
            return generate_api_response(
                message='Invalid username or password',
                success=False,
                code=401
            )
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        return generate_api_response(
            message='Login failed',
            success=False,
            code=500
        )

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_auth_logout():
    """Logout de usuário"""
    try:
        session.clear()
        return generate_api_response(message='Logout successful')
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return generate_api_response(
            message='Logout failed',
            success=False,
            code=500
        )

@app.route('/api/auth/status', methods=['GET'])
def api_auth_status():
    """Verificar status de autenticação"""
    user_id = get_current_user_id()
    user = get_current_user()
    
    return generate_api_response(data={
        'logged_in': user_id is not None,
        'user_id': user_id,
        'username': session.get('username'),
        'email': user.email if user else None
    })

@app.route('/api/auth/profile', methods=['GET', 'PUT'])
@login_required
def api_auth_profile():
    """Obter ou atualizar perfil do usuário"""
    try:
        user = get_current_user()
        
        if request.method == 'GET':
            return generate_api_response(data={
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'created_at': user.created_at.isoformat() if user.created_at else None,
                'total_points': UserPoints.query.filter_by(user_id=user.id).first().points if UserPoints.query.filter_by(user_id=user.id).first() else 0
            })
        
        elif request.method == 'PUT':
            valid, data, error_response = validate_json_data()
            if not valid:
                return error_response
            
            update_fields = {}
            if 'email' in data and data['email'] != user.email:
                # Verificar se email já existe
                if User.query.filter(User.email == data['email'], User.id != user.id).first():
                    return generate_api_response(
                        message='Email already registered',
                        success=False,
                        code=400
                    )
                update_fields['email'] = data['email']
            
            if 'username' in data and data['username'] != user.username:
                # Verificar se username já existe
                if User.query.filter(User.username == data['username'], User.id != user.id).first():
                    return generate_api_response(
                        message='Username already taken',
                        success=False,
                        code=400
                    )
                update_fields['username'] = data['username']
                session['username'] = data['username']
            
            # Atualizar campos
            for field, value in update_fields.items():
                setattr(user, field, value)
            
            db.session.commit()
            
            return generate_api_response(
                message='Profile updated successfully',
                data={
                    'username': user.username,
                    'email': user.email
                }
            )
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Profile error: {e}")
        return generate_api_response(
            message='Operation failed',
            success=False,
            code=500
        )

# ============ API DE CATEGORIAS ============
@app.route('/api/categories', methods=['GET', 'POST'])
@login_required
def api_categories():
    """Listar ou criar categorias"""
    try:
        user_id = g.user_id
        
        if request.method == 'GET':
            # Parâmetros de filtro
            search = request.args.get('search', '')
            sort_by = request.args.get('sort_by', 'name')
            sort_order = request.args.get('sort_order', 'asc')
            
            query = Category.query.filter_by(user_id=user_id)
            
            # Aplicar filtro de busca
            if search:
                query = query.filter(
                    or_(
                        Category.name.ilike(f'%{search}%'),
                        Category.description.ilike(f'%{search}%')
                    )
                )
            
            # Aplicar ordenação
            if sort_by == 'name':
                query = query.order_by(asc(Category.name) if sort_order == 'asc' else desc(Category.name))
            elif sort_by == 'created_at':
                query = query.order_by(asc(Category.created_at) if sort_order == 'asc' else desc(Category.created_at))
            elif sort_by == 'activity_count':
                # Ordenar por número de atividades (subquery)
                query = query.outerjoin(Activity).group_by(Category.id).order_by(
                    func.count(Activity.id).asc() if sort_order == 'asc' else func.count(Activity.id).desc()
                )
            
            categories = query.all()
            
            result = []
            for cat in categories:
                activity_count = Activity.query.filter_by(category_id=cat.id, user_id=user_id).count()
                active_activities = Activity.query.filter_by(
                    category_id=cat.id, 
                    user_id=user_id,
                    status='in_progress'
                ).count()
                
                # Calcular progresso médio da categoria
                category_activities = Activity.query.filter_by(category_id=cat.id, user_id=user_id).all()
                avg_progress = 0
                if category_activities:
                    total_progress = sum(calculate_activity_progress(act) for act in category_activities)
                    avg_progress = round(total_progress / len(category_activities), 1)
                
                result.append({
                    'id': cat.id,
                    'name': cat.name,
                    'description': cat.description or '',
                    'color': cat.color,
                    'icon': cat.icon,
                    'activity_count': activity_count,
                    'active_activities': active_activities,
                    'avg_progress': avg_progress,
                    'created_at': cat.created_at.isoformat() if cat.created_at else None,
                    'stats': {
                        'completed': Activity.query.filter_by(
                            category_id=cat.id, user_id=user_id, status='completed'
                        ).count(),
                        'in_progress': active_activities,
                        'want_to_do': Activity.query.filter_by(
                            category_id=cat.id, user_id=user_id, status='want_to_do'
                        ).count()
                    }
                })
            
            return generate_api_response(data={'categories': result})
        
        elif request.method == 'POST':
            valid, data, error_response = validate_json_data(['name'])
            if not valid:
                return error_response
            
            # Verificar se categoria com mesmo nome já existe
            existing = Category.query.filter_by(
                user_id=user_id,
                name=data['name']
            ).first()
            
            if existing:
                return generate_api_response(
                    message='Category with this name already exists',
                    success=False,
                    code=400
                )
            
            category = Category(
                name=data['name'],
                description=data.get('description', ''),
                color=data.get('color', '#3498db'),
                icon=data.get('icon', '📁'),
                user_id=user_id,
                created_at=datetime.utcnow()
            )
            
            db.session.add(category)
            db.session.commit()
            
            return generate_api_response(
                data={'id': category.id},
                message='Category created successfully',
                code=201
            )
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Categories API error: {e}")
        return generate_api_response(
            message='Operation failed',
            success=False,
            code=500
        )

@app.route('/api/categories/<int:category_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_category_detail(category_id):
    """Detalhes, atualização ou exclusão de categoria"""
    try:
        user_id = g.user_id
        
        category = Category.query.filter_by(
            id=category_id,
            user_id=user_id
        ).first_or_404()
        
        if request.method == 'GET':
            # Contar estatísticas
            activity_count = Activity.query.filter_by(category_id=category.id, user_id=user_id).count()
            
            # Calcular progresso médio
            activities = Activity.query.filter_by(category_id=category.id, user_id=user_id).all()
            avg_progress = 0
            if activities:
                total_progress = sum(calculate_activity_progress(act) for act in activities)
                avg_progress = round(total_progress / len(activities), 1)
            
            # Calcular tempo total estimado
            total_duration = 0
            for act in activities:
                if act.measurement_type == 'units' and act.target_value:
                    total_duration += act.target_value
            
            return generate_api_response(data={
                'id': category.id,
                'name': category.name,
                'description': category.description or '',
                'color': category.color,
                'icon': category.icon,
                'created_at': category.created_at.isoformat() if category.created_at else None,
                'stats': {
                    'total_activities': activity_count,
                    'completed': Activity.query.filter_by(
                        category_id=category.id, user_id=user_id, status='completed'
                    ).count(),
                    'in_progress': Activity.query.filter_by(
                        category_id=category.id, user_id=user_id, status='in_progress'
                    ).count(),
                    'want_to_do': Activity.query.filter_by(
                        category_id=category.id, user_id=user_id, status='want_to_do'
                    ).count(),
                    'avg_progress': avg_progress,
                    'total_duration': total_duration
                },
                'activities': [{
                    'id': act.id,
                    'name': act.name,
                    'status': act.status,
                    'progress': calculate_activity_progress(act),
                    'deadline': act.deadline.isoformat() if act.deadline else None
                } for act in activities[:10]]  # Limitar a 10 atividades
            })
        
        elif request.method == 'PUT':
            valid, data, error_response = validate_json_data()
            if not valid:
                return error_response
            
            update_fields = {}
            
            if 'name' in data and data['name'] != category.name:
                # Verificar se novo nome já existe
                existing = Category.query.filter_by(
                    user_id=user_id,
                    name=data['name']
                ).first()
                
                if existing and existing.id != category.id:
                    return generate_api_response(
                        message='Category with this name already exists',
                        success=False,
                        code=400
                    )
                update_fields['name'] = data['name']
            
            if 'description' in data:
                update_fields['description'] = data['description']
            
            if 'color' in data:
                update_fields['color'] = data['color']
            
            if 'icon' in data:
                update_fields['icon'] = data['icon']
            
            # Atualizar campos
            for field, value in update_fields.items():
                setattr(category, field, value)
            
            db.session.commit()
            
            return generate_api_response(message='Category updated successfully')
        
        elif request.method == 'DELETE':
            # Verificar se há atividades usando esta categoria
            activity_count = Activity.query.filter_by(
                category_id=category.id,
                user_id=user_id
            ).count()
            
            if activity_count > 0:
                return generate_api_response(
                    message=f'Cannot delete category with {activity_count} activities. Move or delete activities first.',
                    success=False,
                    code=400
                )
            
            db.session.delete(category)
            db.session.commit()
            
            return generate_api_response(message='Category deleted successfully')
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Category detail error: {e}")
        return generate_api_response(
            message='Operation failed',
            success=False,
            code=500
        )

@app.route('/api/categories/<int:category_id>/stats', methods=['GET'])
@login_required
def api_category_stats(category_id):
    """Estatísticas detalhadas de uma categoria"""
    try:
        user_id = g.user_id
        
        category = Category.query.filter_by(
            id=category_id,
            user_id=user_id
        ).first_or_404()
        
        # Estatísticas básicas
        activities = Activity.query.filter_by(category_id=category.id, user_id=user_id).all()
        total_activities = len(activities)
        
        # Distribuição por status
        status_counts = {
            'completed': 0,
            'in_progress': 0,
            'want_to_do': 0,
            'cancelled': 0
        }
        
        # Progresso médio
        total_progress = 0
        progress_counts = {'0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0}
        
        for act in activities:
            status_counts[act.status] = status_counts.get(act.status, 0) + 1
            
            progress = calculate_activity_progress(act)
            total_progress += progress
            
            if progress <= 25:
                progress_counts['0-25'] += 1
            elif progress <= 50:
                progress_counts['26-50'] += 1
            elif progress <= 75:
                progress_counts['51-75'] += 1
            else:
                progress_counts['76-100'] += 1
        
        avg_progress = round(total_progress / total_activities, 1) if total_activities > 0 else 0
        
        # Tempo total e médio
        total_duration = 0
        duration_count = 0
        
        for act in activities:
            if act.measurement_type == 'units' and act.target_value:
                total_duration += act.target_value
                duration_count += 1
        
        avg_duration = round(total_duration / duration_count, 1) if duration_count > 0 else 0
        
        # Tendência de criação
        creation_trend = {}
        for act in activities:
            if act.created_at:
                month_key = act.created_at.strftime('%Y-%m')
                creation_trend[month_key] = creation_trend.get(month_key, 0) + 1
        
        # Últimas atividades
        recent_activities = Activity.query.filter_by(
            category_id=category.id,
            user_id=user_id
        ).order_by(Activity.created_at.desc()).limit(5).all()
        
        recent_data = []
        for act in recent_activities:
            recent_data.append({
                'id': act.id,
                'name': act.name,
                'status': act.status,
                'progress': calculate_activity_progress(act),
                'created_at': act.created_at.isoformat() if act.created_at else None
            })
        
        # Progresso semanal
        week_start = date.today() - timedelta(days=date.today().weekday())
        weekly_progress = []
        
        for i in range(7):
            day = week_start + timedelta(days=i)
            day_progress = Progress.query.join(Activity).filter(
                Progress.user_id == user_id,
                Progress.date == day,
                Activity.category_id == category.id
            ).count()
            
            weekly_progress.append({
                'day': day.isoformat(),
                'day_name': day.strftime('%a'),
                'progress_count': day_progress
            })
        
        return generate_api_response(data={
            'category': {
                'id': category.id,
                'name': category.name,
                'color': category.color,
                'icon': category.icon
            },
            'summary': {
                'total_activities': total_activities,
                'avg_progress': avg_progress,
                'total_duration': total_duration,
                'avg_duration': avg_duration
            },
            'distribution': {
                'by_status': status_counts,
                'by_progress': progress_counts
            },
            'trends': {
                'creation_by_month': creation_trend,
                'weekly_progress': weekly_progress
            },
            'recent_activities': recent_data
        })
    
    except Exception as e:
        logger.error(f"Category stats error: {e}")
        return generate_api_response(
            message='Failed to retrieve category statistics',
            success=False,
            code=500
        )

# ============ API DE ATIVIDADES ============
@app.route('/api/activities', methods=['GET', 'POST'])
@login_required
def api_activities():
    """Listar ou criar atividades"""
    try:
        user_id = g.user_id
        
        if request.method == 'GET':
            # Parâmetros de filtro
            category_id = request.args.get('category_id', type=int)
            status = request.args.get('status')
            search = request.args.get('search', '')
            sort_by = request.args.get('sort_by', 'created_at')
            sort_order = request.args.get('sort_order', 'desc')
            limit = request.args.get('limit', type=int)
            offset = request.args.get('offset', 0, type=int)
            include_progress = request.args.get('include_progress', 'true').lower() == 'true'
            
            query = Activity.query.filter_by(user_id=user_id)
            
            # Aplicar filtros
            if category_id:
                query = query.filter_by(category_id=category_id)
            
            if status:
                query = query.filter_by(status=status)
            
            if search:
                query = query.filter(
                    or_(
                        Activity.name.ilike(f'%{search}%'),
                        Activity.description.ilike(f'%{search}%')
                    )
                )
            
            # Aplicar ordenação
            sort_column = {
                'name': Activity.name,
                'created_at': Activity.created_at,
                'deadline': Activity.deadline,
                'status': Activity.status,
                'progress': None  # Ordenação especial
            }.get(sort_by, Activity.created_at)
            
            if sort_by == 'progress':
                # Ordenar por progresso (requer cálculo)
                activities = query.all()
                activities.sort(
                    key=lambda a: calculate_activity_progress(a),
                    reverse=(sort_order == 'desc')
                )
                
                # Aplicar paginação
                if limit:
                    activities = activities[offset:offset + limit]
            else:
                # Ordenação normal
                if sort_column:
                    if sort_order == 'desc':
                        query = query.order_by(desc(sort_column))
                    else:
                        query = query.order_by(asc(sort_column))
                
                # Aplicar paginação
                if limit:
                    query = query.limit(limit).offset(offset)
                
                activities = query.all()
            
            # Preparar resposta
            result = []
            for act in activities:
                progress_data = {}
                if include_progress:
                    progress = calculate_activity_progress(act)
                    current_value = get_current_progress_value(act)
                    
                    progress_data = {
                        'percentage': progress,
                        'current_value': current_value,
                        'target_value': act.target_value,
                        'target_unit': act.target_unit
                    }
                
                activity_data = {
                    'id': act.id,
                    'name': act.name,
                    'description': act.description or '',
                    'category_id': act.category_id,
                    'category_name': act.category.name if act.category else '',
                    'category_color': act.category.color if act.category else '#cccccc',
                    'status': act.status,
                    'measurement_type': act.measurement_type,
                    'target_value': act.target_value,
                    'target_unit': act.target_unit,
                    'manual_percentage': act.manual_percentage,
                    'start_date': act.start_date.isoformat() if act.start_date else None,
                    'end_date': act.end_date.isoformat() if act.end_date else None,
                    'deadline': act.deadline.isoformat() if act.deadline else None,
                    'created_at': act.created_at.isoformat() if act.created_at else None,
                    'parent_activity_id': act.parent_activity_id,
                    'children_count': act.children.count(),
                    'has_parent': act.parent_activity_id is not None
                }
                
                if progress_data:
                    activity_data['progress'] = progress_data
                
                result.append(activity_data)
            
            # Contar total para paginação
            total_count = Activity.query.filter_by(user_id=user_id).count()
            filtered_count = len(activities) if sort_by == 'progress' else query.count()
            
            return generate_api_response(data={
                'activities': result,
                'pagination': {
                    'total': total_count,
                    'filtered': filtered_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': (offset + len(result)) < filtered_count if limit else False
                }
            })
        
        elif request.method == 'POST':
            valid, data, error_response = validate_json_data(['name', 'category_id'])
            if not valid:
                return error_response
            
            # Validar categoria
            category = Category.query.filter_by(
                id=data['category_id'],
                user_id=user_id
            ).first()
            
            if not category:
                return generate_api_response(
                    message='Invalid category',
                    success=False,
                    code=400
                )
            
            # Validar atividade pai se fornecida
            parent_activity = None
            if 'parent_activity_id' in data:
                parent_activity = Activity.query.filter_by(
                    id=data['parent_activity_id'],
                    user_id=user_id
                ).first()
                
                if not parent_activity:
                    return generate_api_response(
                        message='Invalid parent activity',
                        success=False,
                        code=400
                    )
            
            # Determinar tipo de medição
            measurement_type = 'boolean'
            target_value = None
            target_unit = None
            manual_percentage = None
            
            if 'measurement_type' in data:
                measurement_type = data['measurement_type']
                
                if measurement_type == 'units':
                    if 'target_value' not in data or 'target_unit' not in data:
                        return generate_api_response(
                            message='Units measurement requires target_value and target_unit',
                            success=False,
                            code=400
                        )
                    target_value = float(data['target_value'])
                    target_unit = data['target_unit']
                
                elif measurement_type == 'percentage':
                    manual_percentage = float(data.get('manual_percentage', 0))
            
            # Processar datas
            start_date = None
            end_date = None
            deadline = None
            
            if 'start_date' in data:
                start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
            
            if 'end_date' in data:
                end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
            
            if 'deadline' in data:
                deadline = datetime.strptime(data['deadline'], '%Y-%m-%d').date()
            
            # Criar atividade
            activity = Activity(
                name=data['name'],
                description=data.get('description', ''),
                category_id=category.id,
                user_id=user_id,
                measurement_type=measurement_type,
                status=data.get('status', 'want_to_do'),
                target_value=target_value,
                target_unit=target_unit,
                manual_percentage=manual_percentage,
                start_date=start_date,
                end_date=end_date,
                deadline=deadline,
                parent_activity_id=data.get('parent_activity_id'),
                created_at=datetime.utcnow()
            )
            
            db.session.add(activity)
            db.session.commit()
            
            return generate_api_response(
                data={'id': activity.id},
                message='Activity created successfully',
                code=201
            )
    
    except ValueError as e:
        db.session.rollback()
        return generate_api_response(
            message=f'Invalid data format: {str(e)}',
            success=False,
            code=400
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Activities API error: {e}")
        return generate_api_response(
            message='Failed to process activity',
            success=False,
            code=500
        )

@app.route('/api/activities/<int:activity_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_activity_detail(activity_id):
    """Detalhes, atualização ou exclusão de atividade"""
    try:
        user_id = g.user_id
        
        activity = Activity.query.filter_by(
            id=activity_id,
            user_id=user_id
        ).first_or_404()
        
        if request.method == 'GET':
            # Calcular progresso
            progress = calculate_activity_progress(activity)
            current_value = get_current_progress_value(activity)
            
            # Obter histórico de progresso
            progress_history = Progress.query.filter_by(
                activity_id=activity.id
            ).order_by(Progress.date.desc()).limit(10).all()
            
            # Obter agendamentos futuros
            today = date.today()
            future_schedules = ScheduledActivity.query.filter(
                ScheduledActivity.activity_id == activity.id,
                ScheduledActivity.scheduled_date >= today
            ).order_by(ScheduledActivity.scheduled_date.asc()).limit(5).all()
            
            # Obter atividades filhas
            children = Activity.query.filter_by(
                parent_activity_id=activity.id,
                user_id=user_id
            ).all()
            
            activity_data = {
                'id': activity.id,
                'name': activity.name,
                'description': activity.description or '',
                'category_id': activity.category_id,
                'category_name': activity.category.name if activity.category else '',
                'category_color': activity.category.color if activity.category else '#cccccc',
                'category_icon': activity.category.icon if activity.category else '📁',
                'status': activity.status,
                'measurement_type': activity.measurement_type,
                'target_value': activity.target_value,
                'target_unit': activity.target_unit,
                'manual_percentage': activity.manual_percentage,
                'start_date': activity.start_date.isoformat() if activity.start_date else None,
                'end_date': activity.end_date.isoformat() if activity.end_date else None,
                'deadline': activity.deadline.isoformat() if activity.deadline else None,
                'created_at': activity.created_at.isoformat() if activity.created_at else None,
                'parent_activity_id': activity.parent_activity_id,
                'parent_name': activity.parent.name if activity.parent else None,
                'progress': {
                    'percentage': progress,
                    'current_value': current_value,
                    'target_value': activity.target_value,
                    'target_unit': activity.target_unit,
                    'is_completed': progress >= 100
                },
                'stats': {
                    'total_progress_entries': Progress.query.filter_by(activity_id=activity.id).count(),
                    'completed_progress': Progress.query.filter_by(
                        activity_id=activity.id, completed=True
                    ).count(),
                    'total_points_earned': db.session.query(func.sum(Progress.points_earned)).filter(
                        Progress.activity_id == activity.id
                    ).scalar() or 0,
                    'children_count': len(children)
                },
                'history': [{
                    'id': p.id,
                    'date': p.date.isoformat(),
                    'value': p.value,
                    'unit': p.unit,
                    'completed': p.completed,
                    'points_earned': p.points_earned,
                    'streak_bonus': p.streak_bonus,
                    'notes': p.notes
                } for p in progress_history],
                'schedules': [{
                    'id': s.id,
                    'scheduled_date': s.scheduled_date.isoformat(),
                    'scheduled_time': s.scheduled_time,
                    'duration': s.duration
                } for s in future_schedules],
                'children': [{
                    'id': child.id,
                    'name': child.name,
                    'status': child.status,
                    'progress': calculate_activity_progress(child)
                } for child in children]
            }
            
            return generate_api_response(data=activity_data)
        
        elif request.method == 'PUT':
            valid, data, error_response = validate_json_data()
            if not valid:
                return error_response
            
            update_fields = {}
            
            # Atualizar nome
            if 'name' in data:
                update_fields['name'] = data['name']
            
            # Atualizar descrição
            if 'description' in data:
                update_fields['description'] = data['description']
            
            # Atualizar categoria
            if 'category_id' in data and data['category_id'] != activity.category_id:
                # Verificar se categoria existe e pertence ao usuário
                category = Category.query.filter_by(
                    id=data['category_id'],
                    user_id=user_id
                ).first()
                
                if not category:
                    return generate_api_response(
                        message='Invalid category',
                        success=False,
                        code=400
                    )
                update_fields['category_id'] = data['category_id']
            
            # Atualizar status
            if 'status' in data:
                if data['status'] not in ['want_to_do', 'in_progress', 'completed', 'cancelled']:
                    return generate_api_response(
                        message='Invalid status',
                        success=False,
                        code=400
                    )
                update_fields['status'] = data['status']
                
                # Se marcar como completo, ajustar progresso
                if data['status'] == 'completed':
                    if activity.measurement_type == 'percentage':
                        activity.manual_percentage = 100
                    elif activity.measurement_type == 'boolean':
                        # Registrar progresso completo automaticamente
                        progress = Progress(
                            activity_id=activity.id,
                            user_id=user_id,
                            date=date.today(),
                            value=1,
                            unit='unidades',
                            completed=True,
                            points_earned=15,
                            streak_bonus=0
                        )
                        db.session.add(progress)
            
            # Atualizar tipo de medição e valores relacionados
            if 'measurement_type' in data:
                measurement_type = data['measurement_type']
                
                if measurement_type not in ['boolean', 'units', 'percentage']:
                    return generate_api_response(
                        message='Invalid measurement type',
                        success=False,
                        code=400
                    )
                
                update_fields['measurement_type'] = measurement_type
                
                if measurement_type == 'units':
                    if 'target_value' not in data or 'target_unit' not in data:
                        return generate_api_response(
                            message='Units measurement requires target_value and target_unit',
                            success=False,
                            code=400
                        )
                    update_fields['target_value'] = float(data['target_value'])
                    update_fields['target_unit'] = data['target_unit']
                    update_fields['manual_percentage'] = None
                
                elif measurement_type == 'percentage':
                    update_fields['manual_percentage'] = float(data.get('manual_percentage', 0))
                    update_fields['target_value'] = None
                    update_fields['target_unit'] = None
                
                else:  # boolean
                    update_fields['target_value'] = None
                    update_fields['target_unit'] = None
                    update_fields['manual_percentage'] = None
            
            # Atualizar datas
            date_fields = ['start_date', 'end_date', 'deadline']
            for field in date_fields:
                if field in data:
                    if data[field]:
                        update_fields[field] = datetime.strptime(data[field], '%Y-%m-%d').date()
                    else:
                        update_fields[field] = None
            
            # Atualizar atividade pai
            if 'parent_activity_id' in data:
                parent_id = data['parent_activity_id']
                
                if parent_id:
                    # Verificar se atividade pai existe e pertence ao usuário
                    parent = Activity.query.filter_by(
                        id=parent_id,
                        user_id=user_id
                    ).first()
                    
                    if not parent:
                        return generate_api_response(
                            message='Invalid parent activity',
                            success=False,
                            code=400
                        )
                    
                    # Verificar loops na hierarquia
                    if parent_id == activity.id:
                        return generate_api_response(
                            message='Activity cannot be its own parent',
                            success=False,
                            code=400
                        )
                    
                    # Verificar se esta atividade já é ancestral da suposta pai
                    def is_ancestor(child_id, parent_id):
                        child = Activity.query.get(child_id)
                        while child and child.parent_activity_id:
                            if child.parent_activity_id == parent_id:
                                return True
                            child = Activity.query.get(child.parent_activity_id)
                        return False
                    
                    if is_ancestor(parent_id, activity.id):
                        return generate_api_response(
                            message='Circular reference detected',
                            success=False,
                            code=400
                        )
                
                update_fields['parent_activity_id'] = parent_id
            
            # Aplicar atualizações
            for field, value in update_fields.items():
                setattr(activity, field, value)
            
            db.session.commit()
            
            return generate_api_response(message='Activity updated successfully')
        
        elif request.method == 'DELETE':
            # Verificar se há atividades filhas
            children_count = Activity.query.filter_by(
                parent_activity_id=activity.id,
                user_id=user_id
            ).count()
            
            if children_count > 0:
                return generate_api_response(
                    message=f'Cannot delete activity with {children_count} child activities. Delete children first or reassign them.',
                    success=False,
                    code=400
                )
            
            # Verificar se há progressos registrados
            progress_count = Progress.query.filter_by(activity_id=activity.id).count()
            
            if progress_count > 0:
                # Perguntar se deve deletar progressos ou manter referências
                return generate_api_response(
                    message=f'Activity has {progress_count} progress records. Delete them along with the activity?',
                    success=False,
                    code=400
                )
            
            db.session.delete(activity)
            db.session.commit()
            
            return generate_api_response(message='Activity deleted successfully')
    
    except ValueError as e:
        db.session.rollback()
        return generate_api_response(
            message=f'Invalid data format: {str(e)}',
            success=False,
            code=400
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Activity detail error: {e}")
        return generate_api_response(
            message='Failed to process activity',
            success=False,
            code=500
        )

# ============ API DE PROGRESSO ============
@app.route('/api/progress', methods=['POST'])
@login_required
def api_progress_create():
    """Registrar progresso em uma atividade"""
    try:
        valid, data, error_response = validate_json_data(['activity_id'])
        if not valid:
            return error_response
        
        user_id = g.user_id
        
        # Obter atividade
        activity = Activity.query.filter_by(
            id=data['activity_id'],
            user_id=user_id
        ).first()
        
        if not activity:
            return generate_api_response(
                message='Activity not found',
                success=False,
                code=404
            )
        
        # Obter data do progresso
        progress_date = date.today()
        if 'date' in data and data['date']:
            try:
                progress_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            except ValueError:
                return generate_api_response(
                    message='Invalid date format. Use YYYY-MM-DD',
                    success=False,
                    code=400
                )
        
        # Verificar se já existe progresso para esta data
        existing_progress = Progress.query.filter_by(
            activity_id=activity.id,
            date=progress_date
        ).first()
        
        if existing_progress and not data.get('force', False):
            return generate_api_response(
                message='Progress already recorded for this date. Use force=true to override.',
                success=False,
                code=409
            )
        
        # Calcular valor baseado no tipo de medição
        measurement_type = data.get('measurement_type', activity.measurement_type)
        value = 0
        unit = ''
        completed = data.get('completed', False)
        
        if measurement_type == 'units':
            if 'value' not in data:
                return generate_api_response(
                    message='Value is required for units measurement',
                    success=False,
                    code=400
                )
            
            value = float(data['value'])
            unit = data.get('unit', activity.target_unit or 'unidades')
            
            # Verificar se não excede o alvo
            if activity.target_value and value > activity.target_value:
                value = activity.target_value
                completed = True
            
            # Se marcado como completo, completar o alvo
            if completed and activity.target_value:
                current_total = db.session.query(func.sum(Progress.value)).filter(
                    Progress.activity_id == activity.id,
                    Progress.completed == False
                ).scalar() or 0
                
                value = max(activity.target_value - current_total, 0)
        
        elif measurement_type == 'percentage':
            if 'value' not in data:
                return generate_api_response(
                    message='Value is required for percentage measurement',
                    success=False,
                    code=400
                )
            
            value = float(data['value'])
            if value < 0 or value > 100:
                return generate_api_response(
                    message='Percentage must be between 0 and 100',
                    success=False,
                    code=400
                )
            
            unit = '%'
            if value >= 100:
                completed = True
                value = 100
        
        else:  # boolean
            value = 1
            unit = 'unidades'
            completed = data.get('completed', True)
        
        # Verificar se vem de agendamento
        from_schedule = data.get('from_schedule', False)
        schedule_id = data.get('schedule_id')
        
        # Calcular pontos
        base_points = calculate_points_for_progress(activity, value, completed)
        
        # Calcular bônus de streak
        streak_bonus, streak_message, streak_count = calculate_streak_bonus(user_id, progress_date)
        
        # Calcular pontos totais
        total_points = base_points + streak_bonus
        
        # Criar ou atualizar progresso
        if existing_progress:
            progress = existing_progress
            progress.value = value
            progress.unit = unit
            progress.notes = data.get('notes', progress.notes)
            progress.completed = completed
            progress.points_earned = total_points
            progress.streak_bonus = streak_bonus
        else:
            progress = Progress(
                activity_id=activity.id,
                user_id=user_id,
                date=progress_date,
                value=value,
                unit=unit,
                notes=data.get('notes', ''),
                completed=completed,
                from_schedule=from_schedule,
                points_earned=total_points,
                streak_bonus=streak_bonus,
                created_at=datetime.utcnow()
            )
            db.session.add(progress)
        
        # Atualizar pontos do usuário
        current_points = update_user_points(
            user_id, 
            total_points,
            f'Progresso: {activity.name}',
            activity.id
        )
        
        # Atualizar status da atividade se necessário
        if completed:
            activity.status = 'completed'
            if measurement_type == 'percentage':
                activity.manual_percentage = 100
        elif activity.status == 'want_to_do':
            activity.status = 'in_progress'
        
        # Se veio de agendamento, marcar como concluído
        if schedule_id:
            schedule = ScheduledActivity.query.filter_by(
                id=schedule_id,
                user_id=user_id
            ).first()
            
            if schedule:
                # Poderia marcar como concluído ou remover
                pass
        
        db.session.commit()
        
        # Calcular novo progresso percentual
        new_progress = calculate_activity_progress(activity)
        
        # Verificar e conceder recompensas
        earned_rewards = check_and_award_rewards(user_id, activity, progress)
        
        return generate_api_response(data={
            'id': progress.id,
            'activity_id': activity.id,
            'activity_name': activity.name,
            'date': progress_date.isoformat(),
            'value': value,
            'unit': unit,
            'completed': completed,
            'points_earned': total_points,
            'breakdown': {
                'base_points': base_points,
                'streak_bonus': streak_bonus,
                'streak_count': streak_count,
                'streak_message': streak_message
            },
            'current_points': current_points,
            'activity_progress': new_progress,
            'activity_status': activity.status,
            'earned_rewards': earned_rewards,
            'from_schedule': from_schedule
        }, message='Progress recorded successfully')
    
    except ValueError as e:
        db.session.rollback()
        return generate_api_response(
            message=f'Invalid data format: {str(e)}',
            success=False,
            code=400
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Progress creation error: {e}")
        return generate_api_response(
            message='Failed to record progress',
            success=False,
            code=500
        )

@app.route('/api/progress/<int:progress_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_progress_detail(progress_id):
    """Detalhes, atualização ou exclusão de progresso"""
    try:
        user_id = g.user_id
        
        progress = Progress.query.filter_by(
            id=progress_id,
            user_id=user_id
        ).first_or_404()
        
        if request.method == 'GET':
            activity = progress.activity
            
            return generate_api_response(data={
                'id': progress.id,
                'activity_id': progress.activity_id,
                'activity_name': activity.name,
                'activity_category': activity.category.name if activity.category else '',
                'activity_category_color': activity.category.color if activity.category else '#cccccc',
                'date': progress.date.isoformat(),
                'value': progress.value,
                'unit': progress.unit,
                'notes': progress.notes or '',
                'completed': progress.completed,
                'from_schedule': progress.from_schedule,
                'points_earned': progress.points_earned,
                'streak_bonus': progress.streak_bonus,
                'created_at': progress.created_at.isoformat() if progress.created_at else None,
                'activity_progress': calculate_activity_progress(activity),
                'activity_target': activity.target_value,
                'activity_unit': activity.target_unit
            })
        
        elif request.method == 'PUT':
            valid, data, error_response = validate_json_data()
            if not valid:
                return error_response
            
            activity = progress.activity
            
            # Verificar se pode editar
            days_diff = (date.today() - progress.date).days
            if days_diff > 30 and not data.get('force', False):
                return generate_api_response(
                    message='Cannot edit progress older than 30 days without force=true',
                    success=False,
                    code=400
                )
            
            update_fields = {}
            
            # Atualizar valor
            if 'value' in data:
                new_value = float(data['value'])
                
                # Validar baseado no tipo de medição
                if activity.measurement_type == 'units':
                    if activity.target_value and new_value > activity.target_value:
                        return generate_api_response(
                            message=f'Value cannot exceed target ({activity.target_value})',
                            success=False,
                            code=400
                        )
                
                elif activity.measurement_type == 'percentage':
                    if new_value < 0 or new_value > 100:
                        return generate_api_response(
                            message='Percentage must be between 0 and 100',
                            success=False,
                            code=400
                        )
                
                update_fields['value'] = new_value
            
            # Atualizar unidade
            if 'unit' in data:
                update_fields['unit'] = data['unit']
            
            # Atualizar notas
            if 'notes' in data:
                update_fields['notes'] = data['notes']
            
            # Atualizar status de completado
            if 'completed' in data:
                completed = data['completed']
                update_fields['completed'] = completed
                
                # Se marcando como completo, ajustar valor se necessário
                if completed and activity.measurement_type == 'units' and activity.target_value:
                    current_total = db.session.query(func.sum(Progress.value)).filter(
                        Progress.activity_id == activity.id,
                        Progress.id != progress.id,
                        Progress.completed == False
                    ).scalar() or 0
                    
                    remaining = max(activity.target_value - current_total, 0)
                    update_fields['value'] = remaining
            
            # Atualizar data
            if 'date' in data:
                try:
                    new_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
                    
                    # Verificar se já existe progresso para a nova data
                    existing = Progress.query.filter_by(
                        activity_id=activity.id,
                        date=new_date,
                        user_id=user_id
                    ).first()
                    
                    if existing and existing.id != progress.id:
                        return generate_api_response(
                            message='Progress already exists for this date',
                            success=False,
                            code=409
                        )
                    
                    update_fields['date'] = new_date
                except ValueError:
                    return generate_api_response(
                        message='Invalid date format',
                        success=False,
                        code=400
                    )
            
            # Recalcular pontos se valor ou status mudou
            if 'value' in update_fields or 'completed' in update_fields:
                new_value = update_fields.get('value', progress.value)
                new_completed = update_fields.get('completed', progress.completed)
                
                # Recalcular pontos
                base_points = calculate_points_for_progress(activity, new_value, new_completed)
                
                # Recalcular streak bonus
                streak_bonus, _, _ = calculate_streak_bonus(user_id, update_fields.get('date', progress.date))
                
                total_points = base_points + streak_bonus
                
                # Ajustar pontos do usuário
                point_diff = total_points - progress.points_earned
                
                if point_diff != 0:
                    update_user_points(
                        user_id,
                        point_diff,
                        f'Ajuste de progresso: {activity.name}',
                        activity.id
                    )
                
                update_fields['points_earned'] = total_points
                update_fields['streak_bonus'] = streak_bonus
            
            # Aplicar atualizações
            for field, value in update_fields.items():
                setattr(progress, field, value)
            
            db.session.commit()
            
            return generate_api_response(
                message='Progress updated successfully',
                data={
                    'id': progress.id,
                    'points_earned': progress.points_earned,
                    'streak_bonus': progress.streak_bonus
                }
            )
        
        elif request.method == 'DELETE':
            # Remover pontos associados
            if progress.points_earned > 0:
                update_user_points(
                    user_id,
                    -progress.points_earned,
                    f'Remoção de progresso: {progress.activity.name}',
                    progress.activity_id
                )
            
            db.session.delete(progress)
            db.session.commit()
            
            return generate_api_response(message='Progress deleted successfully')
    
    except ValueError as e:
        db.session.rollback()
        return generate_api_response(
            message=f'Invalid data format: {str(e)}',
            success=False,
            code=400
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Progress detail error: {e}")
        return generate_api_response(
            message='Failed to process progress',
            success=False,
            code=500
        )

@app.route('/api/progress/history', methods=['GET'])
@login_required
def api_progress_history():
    """Histórico de progresso"""
    try:
        user_id = g.user_id
        
        # Parâmetros de filtro
        activity_id = request.args.get('activity_id', type=int)
        category_id = request.args.get('category_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        completed = request.args.get('completed', type=lambda v: v.lower() == 'true')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        query = Progress.query.filter_by(user_id=user_id)
        
        # Aplicar filtros
        if activity_id:
            query = query.filter_by(activity_id=activity_id)
        
        if category_id:
            query = query.join(Activity).filter(Activity.category_id == category_id)
        
        if start_date:
            try:
                start = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(Progress.date >= start)
            except ValueError:
                pass
        
        if end_date:
            try:
                end = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(Progress.date <= end)
            except ValueError:
                pass
        
        if completed is not None:
            query = query.filter_by(completed=completed)
        
        # Ordenar e paginar
        total_count = query.count()
        progress_list = query.order_by(
            desc(Progress.date),
            desc(Progress.created_at)
        ).limit(limit).offset(offset).all()
        
        # Preparar resposta
        result = []
        for progress in progress_list:
            activity = progress.activity
            
            result.append({
                'id': progress.id,
                'activity_id': activity.id,
                'activity_name': activity.name,
                'activity_category': activity.category.name if activity.category else '',
                'activity_category_color': activity.category.color if activity.category else '#cccccc',
                'date': progress.date.isoformat(),
                'value': progress.value,
                'unit': progress.unit,
                'notes': progress.notes or '',
                'completed': progress.completed,
                'points_earned': progress.points_earned,
                'streak_bonus': progress.streak_bonus,
                'created_at': progress.created_at.isoformat() if progress.created_at else None,
                'activity_target': activity.target_value,
                'activity_progress': calculate_activity_progress(activity),
                'from_schedule': progress.from_schedule
            })
        
        return generate_api_response(data={
            'progress': result,
            'pagination': {
                'total': total_count,
                'limit': limit,
                'offset': offset,
                'has_more': (offset + len(result)) < total_count
            }
        })
    
    except Exception as e:
        logger.error(f"Progress history error: {e}")
        return generate_api_response(
            message='Failed to retrieve progress history',
            success=False,
            code=500
        )

@app.route('/api/progress/summary', methods=['GET'])
@login_required
def api_progress_summary():
    """Resumo de progresso"""
    try:
        user_id = g.user_id
        
        # Parâmetros
        period = request.args.get('period', 'week')  # week, month, year, all
        group_by = request.args.get('group_by', 'day')  # day, week, month, category
        
        # Definir período
        today = date.today()
        start_date = today
        
        if period == 'week':
            start_date = today - timedelta(days=today.weekday())
        elif period == 'month':
            start_date = date(today.year, today.month, 1)
        elif period == 'year':
            start_date = date(today.year, 1, 1)
        elif period == 'all':
            start_date = date(2020, 1, 1)  # Data inicial arbitrária
        
        # Consultar progressos
        query = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.date >= start_date
        )
        
        # Agrupar por período
        if group_by == 'day':
            result = query.with_entities(
                Progress.date,
                func.count(Progress.id).label('count'),
                func.sum(Progress.points_earned).label('points')
            ).group_by(Progress.date).order_by(Progress.date).all()
            
            data = [{
                'date': r.date.isoformat(),
                'count': r.count,
                'points': r.points or 0
            } for r in result]
        
        elif group_by == 'week':
            # PostgreSQL: extract week from date
            result = query.with_entities(
                func.date_trunc('week', Progress.date).label('week_start'),
                func.count(Progress.id).label('count'),
                func.sum(Progress.points_earned).label('points')
            ).group_by('week_start').order_by('week_start').all()
            
            data = [{
                'week_start': r.week_start.date().isoformat(),
                'count': r.count,
                'points': r.points or 0
            } for r in result]
        
        elif group_by == 'month':
            result = query.with_entities(
                func.date_trunc('month', Progress.date).label('month_start'),
                func.count(Progress.id).label('count'),
                func.sum(Progress.points_earned).label('points')
            ).group_by('month_start').order_by('month_start').all()
            
            data = [{
                'month_start': r.month_start.date().isoformat(),
                'count': r.count,
                'points': r.points or 0
            } for r in result]
        
        elif group_by == 'category':
            result = query.join(Activity).join(Category).with_entities(
                Category.name,
                Category.color,
                func.count(Progress.id).label('count'),
                func.sum(Progress.points_earned).label('points'),
                func.avg(
                    case([(Progress.completed == True, 100)], else_=Progress.value)
                ).label('avg_progress')
            ).group_by(Category.id, Category.name, Category.color).all()
            
            data = [{
                'category': r.name,
                'color': r.color,
                'count': r.count,
                'points': r.points or 0,
                'avg_progress': round(float(r.avg_progress or 0), 1)
            } for r in result]
        
        else:
            data = []
        
        # Estatísticas gerais
        total_count = query.count()
        total_points = db.session.query(func.sum(Progress.points_earned)).filter(
            Progress.user_id == user_id,
            Progress.date >= start_date
        ).scalar() or 0
        
        avg_points_per_day = 0
        if period == 'week':
            days = 7
        elif period == 'month':
            days = 30
        elif period == 'year':
            days = 365
        else:
            days = max((today - start_date).days, 1)
        
        avg_points_per_day = round(total_points / days, 1) if days > 0 else 0
        
        # Dias consecutivos com atividade
        activity_dates = query.with_entities(Progress.date).distinct().order_by(Progress.date.desc()).all()
        consecutive_days = 0
        current_streak = 0
        
        if activity_dates:
            dates = [r.date for r in activity_dates]
            dates.sort(reverse=True)
            
            for i in range(len(dates) - 1):
                if (dates[i] - dates[i + 1]).days == 1:
                    current_streak += 1
                else:
                    break
            
            consecutive_days = current_streak + 1 if dates else 0
        
        return generate_api_response(data={
            'summary': {
                'period': period,
                'start_date': start_date.isoformat(),
                'end_date': today.isoformat(),
                'total_activities': total_count,
                'total_points': total_points,
                'avg_points_per_day': avg_points_per_day,
                'consecutive_days': consecutive_days,
                'current_streak': current_streak
            },
            'data': data,
            'group_by': group_by
        })
    
    except Exception as e:
        logger.error(f"Progress summary error: {e}")
        return generate_api_response(
            message='Failed to generate progress summary',
            success=False,
            code=500
        )

# ============ API DE AGENDAMENTOS ============
@app.route('/api/schedules', methods=['GET', 'POST'])
@login_required
def api_schedules():
    """Listar ou criar agendamentos"""
    try:
        user_id = g.user_id
        
        if request.method == 'GET':
            # Parâmetros
            start_date = request.args.get('start_date')
            end_date = request.args.get('end_date')
            activity_id = request.args.get('activity_id', type=int)
            limit = request.args.get('limit', 100, type=int)
            
            query = ScheduledActivity.query.filter_by(user_id=user_id)
            
            # Filtrar por data
            if start_date:
                try:
                    start = datetime.strptime(start_date, '%Y-%m-%d').date()
                    query = query.filter(ScheduledActivity.scheduled_date >= start)
                except ValueError:
                    pass
            
            if end_date:
                try:
                    end = datetime.strptime(end_date, '%Y-%m-%d').date()
                    query = query.filter(ScheduledActivity.scheduled_date <= end)
                except ValueError:
                    pass
            
            # Filtrar por atividade
            if activity_id:
                query = query.filter_by(activity_id=activity_id)
            
            # Ordenar
            schedules = query.order_by(
                ScheduledActivity.scheduled_date,
                ScheduledActivity.scheduled_time
            ).limit(limit).all()
            
            # Preparar resposta
            result = []
            for schedule in schedules:
                activity = schedule.activity
                
                # Verificar se há progresso para este agendamento
                has_progress = Progress.query.filter_by(
                    activity_id=activity.id,
                    date=schedule.scheduled_date,
                    from_schedule=True
                ).first() is not None
                
                result.append({
                    'id': schedule.id,
                    'activity_id': activity.id,
                    'activity_name': activity.name,
                    'activity_category': activity.category.name if activity.category else '',
                    'activity_category_color': activity.category.color if activity.category else '#cccccc',
                    'scheduled_date': schedule.scheduled_date.isoformat(),
                    'scheduled_time': schedule.scheduled_time,
                    'duration': schedule.duration,
                    'created_at': schedule.created_at.isoformat() if schedule.created_at else None,
                    'has_progress': has_progress,
                    'activity_status': activity.status,
                    'activity_progress': calculate_activity_progress(activity)
                })
            
            return generate_api_response(data={'schedules': result})
        
        elif request.method == 'POST':
            valid, data, error_response = validate_json_data(['activity_id', 'scheduled_date'])
            if not valid:
                return error_response
            
            # Verificar atividade
            activity = Activity.query.filter_by(
                id=data['activity_id'],
                user_id=user_id
            ).first()
            
            if not activity:
                return generate_api_response(
                    message='Activity not found',
                    success=False,
                    code=404
                )
            
            # Processar data
            try:
                scheduled_date = datetime.strptime(data['scheduled_date'], '%Y-%m-%d').date()
            except ValueError:
                return generate_api_response(
                    message='Invalid date format',
                    success=False,
                    code=400
                )
            
            # Verificar se já existe agendamento para esta data
            existing = ScheduledActivity.query.filter_by(
                activity_id=activity.id,
                scheduled_date=scheduled_date,
                user_id=user_id
            ).first()
            
            if existing:
                return generate_api_response(
                    message='Schedule already exists for this date',
                    success=False,
                    code=409
                )
            
            # Criar agendamento
            schedule = ScheduledActivity(
                activity_id=activity.id,
                user_id=user_id,
                scheduled_date=scheduled_date,
                scheduled_time=data.get('scheduled_time', '09:00'),
                duration=data.get('duration', 60),
                created_at=datetime.utcnow()
            )
            
            db.session.add(schedule)
            db.session.commit()
            
            return generate_api_response(
                data={'id': schedule.id},
                message='Schedule created successfully',
                code=201
            )
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Schedules API error: {e}")
        return generate_api_response(
            message='Failed to process schedule',
            success=False,
            code=500
        )

# ============ API DE RECOMPENSAS ============
@app.route('/api/rewards', methods=['GET', 'POST'])
@login_required
def api_rewards():
    """Listar ou criar recompensas"""
    try:
        user_id = g.user_id
        
        if request.method == 'GET':
            # Parâmetros
            achieved = request.args.get('achieved', type=lambda v: v.lower() == 'true')
            reward_type = request.args.get('type')
            sort_by = request.args.get('sort_by', 'points_required')
            sort_order = request.args.get('sort_order', 'asc')
            
            query = Reward.query.filter_by(user_id=user_id)
            
            # Filtrar por status
            if achieved is not None:
                query = query.filter_by(achieved=achieved)
            
            # Filtrar por tipo
            if reward_type:
                query = query.filter_by(reward_type=reward_type)
            
            # Ordenar
            if sort_by == 'points_required':
                if sort_order == 'desc':
                    query = query.order_by(desc(Reward.points_required))
                else:
                    query = query.order_by(asc(Reward.points_required))
            elif sort_by == 'created_at':
                if sort_order == 'desc':
                    query = query.order_by(desc(Reward.created_at))
                else:
                    query = query.order_by(asc(Reward.created_at))
            elif sort_by == 'name':
                if sort_order == 'desc':
                    query = query.order_by(desc(Reward.name))
                else:
                    query = query.order_by(asc(Reward.name))
            
            rewards = query.all()
            
            # Obter pontos do usuário
            user_points = UserPoints.query.filter_by(user_id=user_id).first()
            current_points = user_points.points if user_points else 0
            
            # Preparar resposta
            result = []
            for reward in rewards:
                result.append({
                    'id': reward.id,
                    'name': reward.name,
                    'description': reward.description or '',
                    'reward_type': reward.reward_type,
                    'points_required': reward.points_required,
                    'condition_type': reward.condition_type,
                    'condition_value': reward.condition_value,
                    'condition_activity_id': reward.condition_activity_id,
                    'achieved': reward.achieved,
                    'achieved_at': reward.achieved_at.isoformat() if reward.achieved_at else None,
                    'created_at': reward.created_at.isoformat() if reward.created_at else None,
                    'can_purchase': current_points >= reward.points_required and not reward.achieved,
                    'progress': min(round((current_points / reward.points_required) * 100, 1), 100) if reward.points_required > 0 else 100
                })
            
            return generate_api_response(data={
                'rewards': result,
                'current_points': current_points
            })
        
        elif request.method == 'POST':
            valid, data, error_response = validate_json_data(['name', 'points_required'])
            if not valid:
                return error_response
            
            # Validar pontos
            try:
                points_required = int(data['points_required'])
                if points_required < 0:
                    return generate_api_response(
                        message='Points required must be positive',
                        success=False,
                        code=400
                    )
            except ValueError:
                return generate_api_response(
                    message='Invalid points value',
                    success=False,
                    code=400
                )
            
            # Criar recompensa
            reward = Reward(
                name=data['name'],
                description=data.get('description', ''),
                reward_type=data.get('reward_type', 'custom'),
                points_required=points_required,
                condition_type='points',
                condition_value=points_required,
                user_id=user_id,
                created_at=datetime.utcnow()
            )
            
            db.session.add(reward)
            db.session.commit()
            
            return generate_api_response(
                data={'id': reward.id},
                message='Reward created successfully',
                code=201
            )
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Rewards API error: {e}")
        return generate_api_response(
            message='Failed to process reward',
            success=False,
            code=500
        )

# ============ API DE PONTOS ============
@app.route('/api/points', methods=['GET'])
@login_required
def api_points():
    """Obter pontos do usuário"""
    try:
        user_id = g.user_id
        
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if not user_points:
            user_points = UserPoints(user_id=user_id, points=0)
            db.session.add(user_points)
            db.session.commit()
        
        # Calcular rank (simplificado)
        total_users = UserPoints.query.count()
        rank = UserPoints.query.filter(
            UserPoints.points > user_points.points
        ).count() + 1
        
        # Pontos por categoria
        category_points = db.session.query(
            Category.name,
            Category.color,
            func.sum(Progress.points_earned).label('total_points')
        ).join(Activity, Category.id == Activity.category_id
        ).join(Progress, Activity.id == Progress.activity_id
        ).filter(Progress.user_id == user_id
        ).group_by(Category.id).all()
        
        return generate_api_response(data={
            'points': user_points.points,
            'last_updated': user_points.last_updated.isoformat() if user_points.last_updated else None,
            'rank': rank,
            'total_users': total_users,
            'percentile': round((1 - (rank / total_users)) * 100, 1) if total_users > 0 else 0,
            'by_category': [{
                'category': cp.name,
                'color': cp.color,
                'points': cp.total_points or 0
            } for cp in category_points]
        })
    
    except Exception as e:
        logger.error(f"Points API error: {e}")
        return generate_api_response(
            message='Failed to retrieve points',
            success=False,
            code=500
        )

# ============ API DE DASHBOARD ============
@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def api_dashboard_stats():
    """Estatísticas para o dashboard"""
    try:
        user_id = g.user_id
        today = date.today()
        
        # Atividades por status
        status_counts = db.session.query(
            Activity.status,
            func.count(Activity.id)
        ).filter(Activity.user_id == user_id).group_by(Activity.status).all()
        
        status_data = {status: count for status, count in status_counts}
        
        # Progresso hoje
        today_progress = Progress.query.filter_by(
            user_id=user_id,
            date=today
        ).count()
        
        # Agendamentos hoje
        today_schedules = ScheduledActivity.query.filter_by(
            user_id=user_id,
            scheduled_date=today
        ).count()
        
        # Pontos hoje
        today_points = db.session.query(func.sum(Progress.points_earned)).filter(
            Progress.user_id == user_id,
            Progress.date == today
        ).scalar() or 0
        
        # Streak atual
        streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
        streak_count = streak.streak_count if streak else 0
        
        # Categorias com mais atividades
        top_categories = db.session.query(
            Category.name,
            Category.color,
            func.count(Activity.id).label('activity_count')
        ).join(Activity, Category.id == Activity.category_id
        ).filter(Activity.user_id == user_id
        ).group_by(Category.id
        ).order_by(desc('activity_count')).limit(5).all()
        
        # Próximas atividades (por deadline)
        upcoming_activities = Activity.query.filter(
            Activity.user_id == user_id,
            Activity.status.in_(['want_to_do', 'in_progress']),
            Activity.deadline >= today
        ).order_by(Activity.deadline).limit(5).all()
        
        # Recompensas próximas
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        current_points = user_points.points if user_points else 0
        
        upcoming_rewards = Reward.query.filter(
            Reward.user_id == user_id,
            Reward.achieved == False,
            Reward.points_required <= current_points + 100  # Próximas 100 pontos
        ).order_by(Reward.points_required).limit(3).all()
        
        # Progresso semanal
        week_start = today - timedelta(days=today.weekday())
        weekly_data = []
        
        for i in range(7):
            day = week_start + timedelta(days=i)
            day_progress = Progress.query.filter_by(
                user_id=user_id,
                date=day
            ).count()
            
            weekly_data.append({
                'day': day.isoformat(),
                'day_name': day.strftime('%a'),
                'progress_count': day_progress
            })
        
        return generate_api_response(data={
            'overview': {
                'total_activities': sum(status_data.values()),
                'completed_activities': status_data.get('completed', 0),
                'in_progress_activities': status_data.get('in_progress', 0),
                'total_categories': Category.query.filter_by(user_id=user_id).count(),
                'total_points': current_points
            },
            'today': {
                'progress_count': today_progress,
                'scheduled_count': today_schedules,
                'points_earned': today_points
            },
            'streak': {
                'count': streak_count,
                'message': get_streak_message(streak_count)
            },
            'top_categories': [{
                'name': cat.name,
                'color': cat.color,
                'count': cat.activity_count
            } for cat in top_categories],
            'upcoming_activities': [{
                'id': act.id,
                'name': act.name,
                'deadline': act.deadline.isoformat() if act.deadline else None,
                'category_color': act.category.color if act.category else '#cccccc',
                'progress': calculate_activity_progress(act)
            } for act in upcoming_activities],
            'upcoming_rewards': [{
                'id': reward.id,
                'name': reward.name,
                'points_required': reward.points_required,
                'current_points': current_points,
                'needed_points': max(0, reward.points_required - current_points)
            } for reward in upcoming_rewards],
            'weekly_progress': weekly_data,
            'status_distribution': status_data
        })
    
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        return generate_api_response(
            message='Failed to retrieve dashboard statistics',
            success=False,
            code=500
        )

def get_streak_message(streak_count):
    """Obter mensagem motivacional baseada no streak"""
    messages = {
        1: "🏁 Primeiro dia! Continue assim!",
        2: "🔥 Dois dias seguidos! Bom trabalho!",
        3: "🚀 Três dias! Você está no ritmo!",
        4: "💪 Quatro dias! Impressionante!",
        5: "🌟 Cinco dias! Metade da semana!",
        6: "🎯 Seis dias! Quase lá!",
        7: "🏆 Uma semana completa! Excelente!",
        14: "✨ Duas semanas! Consistência impressionante!",
        21: "👑 Três semanas! Você é incrível!",
        30: "🎖️ Um mês! Ninguém para você!"
    }
    
    return messages.get(streak_count, f"📈 {streak_count} dias seguidos! Continue!")

def check_and_award_rewards(user_id, activity, progress):
    """Verificar e conceder recompensas automaticamente"""
    try:
        earned_rewards = []
        
        # Obter pontos atuais
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if not user_points:
            return earned_rewards
        
        current_points = user_points.points
        
        # Verificar recompensas por pontos
        point_rewards = Reward.query.filter(
            Reward.user_id == user_id,
            Reward.condition_type == 'points',
            Reward.condition_value <= current_points,
            Reward.achieved == False
        ).all()
        
        for reward in point_rewards:
            reward.achieved = True
            reward.achieved_at = datetime.utcnow()
            earned_rewards.append({
                'id': reward.id,
                'name': reward.name,
                'type': 'points',
                'threshold': reward.condition_value
            })
        
        # Verificar recompensas por atividade específica
        activity_rewards = Reward.query.filter(
            Reward.user_id == user_id,
            Reward.condition_type == 'activity',
            Reward.condition_activity_id == activity.id,
            Reward.achieved == False
        ).all()
        
        for reward in activity_rewards:
            # Verificar se atividade está completa
            if activity.status == 'completed':
                reward.achieved = True
                reward.achieved_at = datetime.utcnow()
                earned_rewards.append({
                    'id': reward.id,
                    'name': reward.name,
                    'type': 'activity',
                    'activity_name': activity.name
                })
        
        # Verificar recompensas por streak
        streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
        if streak:
            streak_rewards = Reward.query.filter(
                Reward.user_id == user_id,
                Reward.condition_type == 'streak',
                Reward.condition_value <= streak.streak_count,
                Reward.achieved == False
            ).all()
            
            for reward in streak_rewards:
                reward.achieved = True
                reward.achieved_at = datetime.utcnow()
                earned_rewards.append({
                    'id': reward.id,
                    'name': reward.name,
                    'type': 'streak',
                    'streak_count': streak.streak_count
                })
        
        if earned_rewards:
            db.session.commit()
        
        return earned_rewards
    
    except Exception as e:
        logger.error(f"Error awarding rewards: {e}")
        return []

# ============ API DE PERFIL E ANALYTICS ============
@app.route('/api/profile/analytics', methods=['GET'])
@login_required
def api_profile_analytics():
    """Análises detalhadas do perfil"""
    try:
        user_id = g.user_id
        today = date.today()
        
        # 1. Estatísticas básicas
        total_activities = Activity.query.filter_by(user_id=user_id).count()
        completed_activities = Activity.query.filter_by(user_id=user_id, status='completed').count()
        completion_rate = round((completed_activities / total_activities * 100), 1) if total_activities > 0 else 0
        
        # 2. Progresso temporal
        thirty_days_ago = today - timedelta(days=30)
        
        daily_progress = []
        for i in range(30):
            day = thirty_days_ago + timedelta(days=i)
            count = Progress.query.filter_by(
                user_id=user_id,
                date=day
            ).count()
            
            daily_progress.append({
                'date': day.isoformat(),
                'count': count
            })
        
        # 3. Distribuição por categoria
        category_distribution = db.session.query(
            Category.name,
            Category.color,
            func.count(Activity.id).label('activity_count'),
            func.sum(
                case([(Activity.status == 'completed', 1)], else_=0)
            ).label('completed_count')
        ).join(Activity, Category.id == Activity.category_id
        ).filter(Activity.user_id == user_id
        ).group_by(Category.id).all()
        
        # 4. Padrões de horário
        time_patterns = db.session.query(
            func.substr(ScheduledActivity.scheduled_time, 1, 2).label('hour'),
            func.count(ScheduledActivity.id).label('count')
        ).filter(ScheduledActivity.user_id == user_id
        ).group_by('hour').order_by('hour').all()
        
        # 5. Dias mais produtivos
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        productive_days = db.session.query(
            func.extract('dow', Progress.date).label('day_of_week'),
            func.count(Progress.id).label('count')
        ).filter(Progress.user_id == user_id
        ).group_by('day_of_week').order_by(desc('count')).all()
        
        # 6. Metas de longo prazo
        upcoming_deadlines = Activity.query.filter(
            Activity.user_id == user_id,
            Activity.deadline >= today,
            Activity.status.in_(['want_to_do', 'in_progress'])
        ).order_by(Activity.deadline).limit(5).all()
        
        # 7. Pontuação de produtividade
        productivity_score = calculate_productivity_score(user_id)
        
        return generate_api_response(data={
            'basic_stats': {
                'total_activities': total_activities,
                'completed_activities': completed_activities,
                'completion_rate': completion_rate,
                'total_categories': len(category_distribution),
                'productivity_score': productivity_score
            },
            'temporal_analysis': {
                'daily_progress': daily_progress,
                'avg_daily_activities': round(sum(p['count'] for p in daily_progress) / 30, 1),
                'most_productive_day': day_names[int(productive_days[0][0])] if productive_days else 'N/A'
            },
            'category_analysis': [{
                'category': cd.name,
                'color': cd.color,
                'total_activities': cd.activity_count,
                'completed': cd.completed_count or 0,
                'completion_rate': round((cd.completed_count or 0) / cd.activity_count * 100, 1) if cd.activity_count > 0 else 0
            } for cd in category_distribution],
            'time_patterns': [{
                'hour': f"{tp.hour}:00",
                'count': tp.count
            } for tp in time_patterns],
            'upcoming_goals': [{
                'id': act.id,
                'name': act.name,
                'deadline': act.deadline.isoformat() if act.deadline else None,
                'days_remaining': (act.deadline - today).days if act.deadline else None,
                'progress': calculate_activity_progress(act)
            } for act in upcoming_deadlines],
            'recommendations': generate_recommendations(user_id)
        })
    
    except Exception as e:
        logger.error(f"Profile analytics error: {e}")
        return generate_api_response(
            message='Failed to generate analytics',
            success=False,
            code=500
        )

def calculate_productivity_score(user_id):
    """Calcular pontuação de produtividade"""
    try:
        score = 50  # Base
        
        # 1. Taxa de conclusão (0-30 pontos)
        total_activities = Activity.query.filter_by(user_id=user_id).count()
        completed_activities = Activity.query.filter_by(user_id=user_id, status='completed').count()
        
        if total_activities > 0:
            completion_rate = completed_activities / total_activities
            score += min(completion_rate * 30, 30)
        
        # 2. Consistência (0-25 pontos)
        thirty_days_ago = date.today() - timedelta(days=30)
        active_days = db.session.query(func.count(func.distinct(Progress.date))).filter(
            Progress.user_id == user_id,
            Progress.date >= thirty_days_ago
        ).scalar() or 0
        
        consistency_rate = active_days / 30
        score += min(consistency_rate * 25, 25)
        
        # 3. Variedade (0-15 pontos)
        category_count = Category.query.filter_by(user_id=user_id).count()
        score += min(category_count * 2, 15)
        
        # 4. Streak (0-10 pontos)
        streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
        streak_count = streak.streak_count if streak else 0
        score += min(streak_count, 10)
        
        # 5. Planejamento (0-10 pontos)
        future_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= date.today()
        ).count()
        
        score += min(future_schedules / 10, 10)
        
        # 6. Progresso recente (0-10 pontos)
        week_start = date.today() - timedelta(days=date.today().weekday())
        weekly_progress = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.date >= week_start
        ).count()
        
        score += min(weekly_progress / 5, 10)
        
        return round(min(score, 100), 1)
    
    except Exception:
        return 50

def generate_recommendations(user_id):
    """Gerar recomendações personalizadas"""
    recommendations = []
    
    try:
        # Verificar atividades próximas do prazo
        today = date.today()
        near_deadline = Activity.query.filter(
            Activity.user_id == user_id,
            Activity.deadline.between(today, today + timedelta(days=3)),
            Activity.status.in_(['want_to_do', 'in_progress'])
        ).all()
        
        if near_deadline:
            recommendations.append({
                'type': 'deadline',
                'message': f'⚠️ {len(near_deadline)} atividade(s) próxima(s) do prazo',
                'priority': 'high'
            })
        
        # Verificar atividades paradas
        stale_activities = Activity.query.filter(
            Activity.user_id == user_id,
            Activity.status == 'in_progress',
            Activity.created_at < datetime.utcnow() - timedelta(days=14),
            ~Activity.id.in_(
                db.session.query(Progress.activity_id).filter(
                    Progress.date >= date.today() - timedelta(days=7)
                )
            )
        ).all()
        
        if stale_activities:
            recommendations.append({
                'type': 'stale',
                'message': f'📅 {len(stale_activities)} atividade(s) sem progresso recente',
                'priority': 'medium'
            })
        
        # Verificar categorias negligenciadas
        categories = Category.query.filter_by(user_id=user_id).all()
        for category in categories:
            recent_progress = Progress.query.join(Activity).filter(
                Progress.user_id == user_id,
                Activity.category_id == category.id,
                Progress.date >= date.today() - timedelta(days=7)
            ).count()
            
            if recent_progress == 0:
                recommendations.append({
                    'type': 'neglected_category',
                    'message': f'🎯 Categoria "{category.name}" sem atividade recente',
                    'priority': 'low',
                    'category_id': category.id
                })
        
        # Verificar recompensas próximas
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if user_points:
            next_reward = Reward.query.filter(
                Reward.user_id == user_id,
                Reward.achieved == False,
                Reward.points_required > user_points.points
            ).order_by(Reward.points_required).first()
            
            if next_reward:
                points_needed = next_reward.points_required - user_points.points
                if points_needed <= 20:
                    recommendations.append({
                        'type': 'reward',
                        'message': f'🏆 Faltam apenas {points_needed} pontos para "{next_reward.name}"',
                        'priority': 'medium'
                    })
        
        # Recomendação geral se poucas recomendações
        if len(recommendations) < 2:
            recommendations.append({
                'type': 'general',
                'message': '🎯 Continue registrando seu progresso diário para manter o ritmo!',
                'priority': 'low'
            })
    
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
    
    return recommendations

# ============ API DE SISTEMA ============
@app.route('/api/system/health', methods=['GET'])
def api_system_health():
    """Verificar saúde do sistema"""
    try:
        # Verificar banco de dados
        db.session.execute(text('SELECT 1'))
        db_healthy = True
        
        # Verificar tabelas principais
        tables = ['users', 'activities', 'categories', 'progress']
        table_status = {}
        
        for table in tables:
            try:
                db.session.execute(text(f'SELECT COUNT(*) FROM {table} LIMIT 1'))
                table_status[table] = 'healthy'
            except Exception:
                table_status[table] = 'unhealthy'
        
        # Verificar conexões ativas
        active_users = User.query.count()
        active_activities = Activity.query.count()
        
        # Informações do sistema
        system_info = {
            'python_version': os.sys.version,
            'flask_version': '2.3.3',
            'database_type': 'PostgreSQL',
            'environment': os.environ.get('FLASK_ENV', 'development'),
            'debug_mode': app.debug
        }
        
        return generate_api_response(data={
            'status': 'healthy' if db_healthy and all(s == 'healthy' for s in table_status.values()) else 'degraded',
            'database': 'connected' if db_healthy else 'disconnected',
            'tables': table_status,
            'metrics': {
                'active_users': active_users,
                'active_activities': active_activities,
                'total_categories': Category.query.count(),
                'total_progress': Progress.query.count()
            },
            'system': system_info,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return generate_api_response(
            data={'status': 'unhealthy', 'error': str(e)},
            message='System health check failed',
            success=False,
            code=500
        )

@app.route('/api/system/reset', methods=['POST'])
@login_required
def api_system_reset():
    """Resetar dados do usuário (apenas desenvolvimento)"""
    try:
        if not app.debug:
            return generate_api_response(
                message='Reset only available in development mode',
                success=False,
                code=403
            )
        
        user_id = g.user_id
        
        # Remover dados do usuário
        Progress.query.filter_by(user_id=user_id).delete()
        ScheduledActivity.query.filter_by(user_id=user_id).delete()
        Activity.query.filter_by(user_id=user_id).delete()
        Category.query.filter_by(user_id=user_id).delete()
        Reward.query.filter_by(user_id=user_id).delete()
        PointTransaction.query.filter_by(user_id=user_id).delete()
        
        # Resetar pontos e streak
        UserPoints.query.filter_by(user_id=user_id).delete()
        WeeklyStreak.query.filter_by(user_id=user_id).delete()
        
        # Recriar dados de exemplo
        create_sample_data_for_user(user_id, force=True)
        
        db.session.commit()
        
        return generate_api_response(
            message='User data reset successfully. Sample data created.',
            data={'user_id': user_id}
        )
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"Reset error: {e}")
        return generate_api_response(
            message='Reset failed',
            success=False,
            code=500
        )

@app.route('/api/system/backup', methods=['GET'])
@login_required
def api_system_backup():
    """Backup dos dados do usuário"""
    try:
        user_id = g.user_id
        
        # Coletar todos os dados do usuário
        backup_data = {
            'user': {
                'id': user_id,
                'username': session.get('username'),
                'backup_date': datetime.utcnow().isoformat()
            },
            'categories': [],
            'activities': [],
            'progress': [],
            'schedules': [],
            'rewards': [],
            'points': None,
            'streak': None
        }
        
        # Categorias
        categories = Category.query.filter_by(user_id=user_id).all()
        for cat in categories:
            backup_data['categories'].append({
                'id': cat.id,
                'name': cat.name,
                'description': cat.description,
                'color': cat.color,
                'icon': cat.icon,
                'created_at': cat.created_at.isoformat() if cat.created_at else None
            })
        
        # Atividades
        activities = Activity.query.filter_by(user_id=user_id).all()
        for act in activities:
            backup_data['activities'].append({
                'id': act.id,
                'name': act.name,
                'description': act.description,
                'category_id': act.category_id,
                'status': act.status,
                'measurement_type': act.measurement_type,
                'target_value': act.target_value,
                'target_unit': act.target_unit,
                'manual_percentage': act.manual_percentage,
                'start_date': act.start_date.isoformat() if act.start_date else None,
                'end_date': act.end_date.isoformat() if act.end_date else None,
                'deadline': act.deadline.isoformat() if act.deadline else None,
                'parent_activity_id': act.parent_activity_id,
                'created_at': act.created_at.isoformat() if act.created_at else None
            })
        
        # Progresso
        progress_list = Progress.query.filter_by(user_id=user_id).all()
        for prog in progress_list:
            backup_data['progress'].append({
                'id': prog.id,
                'activity_id': prog.activity_id,
                'date': prog.date.isoformat(),
                'value': prog.value,
                'unit': prog.unit,
                'notes': prog.notes,
                'completed': prog.completed,
                'points_earned': prog.points_earned,
                'streak_bonus': prog.streak_bonus,
                'created_at': prog.created_at.isoformat() if prog.created_at else None
            })
        
        # Agendamentos
        schedules = ScheduledActivity.query.filter_by(user_id=user_id).all()
        for sched in schedules:
            backup_data['schedules'].append({
                'id': sched.id,
                'activity_id': sched.activity_id,
                'scheduled_date': sched.scheduled_date.isoformat(),
                'scheduled_time': sched.scheduled_time,
                'duration': sched.duration,
                'created_at': sched.created_at.isoformat() if sched.created_at else None
            })
        
        # Recompensas
        rewards = Reward.query.filter_by(user_id=user_id).all()
        for reward in rewards:
            backup_data['rewards'].append({
                'id': reward.id,
                'name': reward.name,
                'description': reward.description,
                'reward_type': reward.reward_type,
                'points_required': reward.points_required,
                'condition_type': reward.condition_type,
                'condition_value': reward.condition_value,
                'condition_activity_id': reward.condition_activity_id,
                'achieved': reward.achieved,
                'achieved_at': reward.achieved_at.isoformat() if reward.achieved_at else None,
                'created_at': reward.created_at.isoformat() if reward.created_at else None
            })
        
        # Pontos
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if user_points:
            backup_data['points'] = {
                'points': user_points.points,
                'last_updated': user_points.last_updated.isoformat() if user_points.last_updated else None
            }
        
        # Streak
        streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
        if streak:
            backup_data['streak'] = {
                'streak_count': streak.streak_count,
                'last_activity_date': streak.last_activity_date.isoformat() if streak.last_activity_date else None,
                'created_at': streak.created_at.isoformat() if streak.created_at else None
            }
        
        return generate_api_response(data=backup_data)
    
    except Exception as e:
        logger.error(f"Backup error: {e}")
        return generate_api_response(
            message='Backup failed',
            success=False,
            code=500
        )

# ============ UTILITÁRIOS ============
@app.route('/api/utils/export/csv', methods=['GET'])
@login_required
def api_export_csv():
    """Exportar dados para CSV"""
    # Implementação simplificada
    return generate_api_response(
        message='CSV export not implemented',
        success=False,
        code=501
    )

@app.route('/api/utils/import/json', methods=['POST'])
@login_required
def api_import_json():
    """Importar dados de JSON"""
    # Implementação simplificada
    return generate_api_response(
        message='JSON import not implemented',
        success=False,
        code=501
    )

@app.route('/api/utils/search', methods=['GET'])
@login_required
def api_global_search():
    """Busca global"""
    try:
        user_id = g.user_id
        query = request.args.get('q', '')
        
        if not query or len(query) < 2:
            return generate_api_response(data={'results': []})
        
        results = {
            'activities': [],
            'categories': [],
            'progress': []
        }
        
        # Buscar atividades
        activities = Activity.query.filter(
            Activity.user_id == user_id,
            or_(
                Activity.name.ilike(f'%{query}%'),
                Activity.description.ilike(f'%{query}%')
            )
        ).limit(10).all()
        
        for act in activities:
            results['activities'].append({
                'id': act.id,
                'name': act.name,
                'description': act.description[:100] + '...' if act.description and len(act.description) > 100 else act.description,
                'category': act.category.name if act.category else '',
                'category_color': act.category.color if act.category else '#cccccc',
                'type': 'activity'
            })
        
        # Buscar categorias
        categories = Category.query.filter(
            Category.user_id == user_id,
            or_(
                Category.name.ilike(f'%{query}%'),
                Category.description.ilike(f'%{query}%')
            )
        ).limit(10).all()
        
        for cat in categories:
            results['categories'].append({
                'id': cat.id,
                'name': cat.name,
                'description': cat.description[:100] + '...' if cat.description and len(cat.description) > 100 else cat.description,
                'color': cat.color,
                'activity_count': Activity.query.filter_by(category_id=cat.id, user_id=user_id).count(),
                'type': 'category'
            })
        
        # Buscar progressos por notas
        progress_list = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.notes.ilike(f'%{query}%')
        ).limit(10).all()
        
        for prog in progress_list:
            results['progress'].append({
                'id': prog.id,
                'date': prog.date.isoformat(),
                'notes': prog.notes[:100] + '...' if prog.notes and len(prog.notes) > 100 else prog.notes,
                'activity_name': prog.activity.name if prog.activity else '',
                'value': prog.value,
                'unit': prog.unit,
                'type': 'progress'
            })
        
        return generate_api_response(data=results)
    
    except Exception as e:
        logger.error(f"Search error: {e}")
        return generate_api_response(
            message='Search failed',
            success=False,
            code=500
        )

# ============ INICIALIZAÇÃO ============
def init_database():
    """Inicializar banco de dados"""
    with app.app_context():
        try:
            # Criar tabelas se não existirem
            db.create_all()
            logger.info("✅ Database tables created/verified")
            
            # Criar usuários de exemplo se não existirem
            sample_users = [
                {'id': 1, 'username': 'usuario1', 'email': 'usuario1@exemplo.com'},
                {'id': 2, 'username': 'usuario2', 'email': 'usuario2@exemplo.com'}
            ]
            
            for user_data in sample_users:
                user = User.query.get(user_data['id'])
                if not user:
                    user = User(
                        id=user_data['id'],
                        username=user_data['username'],
                        email=user_data['email'],
                        created_at=datetime.utcnow()
                    )
                    db.session.add(user)
                    logger.info(f"✅ Created sample user: {user_data['username']}")
            
            db.session.commit()
            
            # Criar dados de exemplo para usuário 1 se não existirem
            if Category.query.filter_by(user_id=1).count() == 0:
                create_sample_data_for_user(1)
                logger.info("✅ Created sample data for user 1")
            
            logger.info("🎉 Database initialization complete!")
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Database initialization failed: {e}")
            raise

# ============ EXECUÇÃO PRINCIPAL ============
if __name__ == '__main__':
    # Inicializar banco de dados
    init_database()
    
    # Configurar porta
    port = int(os.environ.get('PORT', 5000))
    
    # Executar aplicação
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.environ.get('FLASK_ENV') == 'development',
        threaded=True
    )