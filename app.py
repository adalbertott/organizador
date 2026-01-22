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


# Função para obter o ID do usuário atual
def get_current_user_id():
    return session.get('user_id')

# Verificar se o usuário está autenticado
@app.before_request
def check_authentication():
    public_routes = ['login', 'logout', 'api_auth_login', 'api_auth_logout', 
                     'api_auth_status', 'static', 'dashboard', 'api_health']
    
    if request.endpoint in public_routes:
        return
    
    if not get_current_user_id():
        return redirect(url_for('dashboard'))

# ============ FUNÇÕES DE AUTENTICAÇÃO ============
@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if username in ['usuario1', 'usuario2'] and password == '123321':
            user_id = 1 if username == 'usuario1' else 2
            
            user = User.query.get(user_id)
            if not user:
                if user_id == 1:
                    user = User(id=user_id, username='usuario1', email='usuario1@exemplo.com')
                else:
                    user = User(id=user_id, username='usuario2', email='usuario2@exemplo.com')
                db.session.add(user)
                db.session.commit()
            
            session['user_id'] = user_id
            session['username'] = username
            
            return jsonify({
                'success': True,
                'message': 'Login realizado com sucesso',
                'user_id': user_id,
                'username': username
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Usuário ou senha inválidos'
            }), 401
            
    except Exception as e:
        print(f"Erro no login: {str(e)}")
        return jsonify({'success': False, 'message': 'Erro no servidor'}), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_auth_logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logout realizado com sucesso'})

@app.route('/api/auth/status', methods=['GET'])
def api_auth_status():
    user_id = get_current_user_id()
    return jsonify({
        'logged_in': user_id is not None,
        'user_id': user_id,
        'username': session.get('username')
    })

@app.route('/api/auth/reset_database', methods=['POST'])
def api_auth_reset_database():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'success': False, 'message': 'Usuário não autenticado'}), 401
        
        if user_id == 2:
            Progress.query.filter_by(user_id=2).delete()
            ScheduledActivity.query.filter_by(user_id=2).delete()
            Activity.query.filter_by(user_id=2).delete()
            Category.query.filter_by(user_id=2).delete()
            Reward.query.filter_by(user_id=2).delete()
            UserPoints.query.filter_by(user_id=2).delete()
            PointTransaction.query.filter_by(user_id=2).delete()
            WeeklyStreak.query.filter_by(user_id=2).delete()
            
            db.session.commit()
            
            categories = [
                Category(name='Leitura', color='#3498db', icon='📚', user_id=2),
                Category(name='Exercício', color='#2ecc71', icon='🏃', user_id=2),
                Category(name='Estudo', color='#9b59b6', icon='📖', user_id=2),
            ]
            
            for category in categories:
                db.session.add(category)
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Banco de dados do usuário 2 resetado com sucesso!'
            })
        else:
            Progress.query.filter_by(user_id=1).delete()
            ScheduledActivity.query.filter_by(user_id=1).delete()
            Activity.query.filter_by(user_id=1).delete()
            Category.query.filter_by(user_id=1).delete()
            Reward.query.filter_by(user_id=1).delete()
            UserPoints.query.filter_by(user_id=1).delete()
            PointTransaction.query.filter_by(user_id=1).delete()
            WeeklyStreak.query.filter_by(user_id=1).delete()
            
            db.session.commit()
            
            create_sample_data_for_user(1)
            
            return jsonify({
                'success': True,
                'message': 'Banco de dados do usuário 1 resetado com sucesso! Dados de exemplo recriados.'
            })
            
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao resetar banco: {str(e)}")
        return jsonify({'success': False, 'message': f'Erro ao resetar banco: {str(e)}'}), 500

# ============ FUNÇÕES AUXILIARES ============
def create_sample_data_for_user(user_id):
    categories = [
        Category(name='Leitura', description='Livros e materiais de leitura', color='#3498db', icon='📚', user_id=user_id),
        Category(name='Exercício', description='Atividades físicas', color='#2ecc71', icon='🏃', user_id=user_id),
        Category(name='Estudo', description='Aprendizado e desenvolvimento', color='#9b59b6', icon='📖', user_id=user_id),
    ]
    
    for category in categories:
        db.session.add(category)
    
    db.session.commit()
    
    categoria_leitura = Category.query.filter_by(name='Leitura', user_id=user_id).first()
    categoria_estudo = Category.query.filter_by(name='Estudo', user_id=user_id).first()
    
    if categoria_leitura:
        atividade1 = Activity(
            name='Ler Dom Casmurro',
            description='Ler o clássico da literatura brasileira',
            category_id=categoria_leitura.id,
            user_id=user_id,
            measurement_type='units',
            status='in_progress',
            target_value=300,
            target_unit='páginas'
        )
        db.session.add(atividade1)
    
    if categoria_estudo:
        atividade2 = Activity(
            name='Estudar Flask',
            description='Aprender framework web Flask',
            category_id=categoria_estudo.id,
            user_id=user_id,
            measurement_type='percentage',
            status='in_progress',
            manual_percentage=25.0
        )
        db.session.add(atividade2)
    
    db.session.commit()
    
    reward1 = Reward(
        name='Leitor Ávido',
        description='Complete sua primeira atividade de leitura',
        points_required=50,
        user_id=user_id
    )
    db.session.add(reward1)
    
    db.session.commit()

def calculate_activity_progress(activity):
    if not activity:
        return 0
    
    if activity.measurement_type == 'units':
        if activity.target_value and activity.target_value > 0:
            total_progress = db.session.query(func.sum(Progress.value)).filter(
                Progress.activity_id == activity.id
            ).scalar() or 0
            progress_percentage = min((total_progress / activity.target_value) * 100, 100)
            return round(progress_percentage, 1)
        return 0
    elif activity.measurement_type == 'percentage':
        return min(activity.manual_percentage or 0, 100)
    else:
        return 100 if activity.status == 'completed' else 0

def get_current_progress_value(activity):
    if activity.measurement_type == 'units':
        return db.session.query(func.sum(Progress.value)).filter(
            Progress.activity_id == activity.id
        ).scalar() or 0
    elif activity.measurement_type == 'percentage':
        return activity.manual_percentage or 0
    else:
        return 1 if activity.status == 'completed' else 0

# ============ ROTAS DE PÁGINAS ============
@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/calendar')
def calendar():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('calendar.html')

@app.context_processor
def utility_processor():
    return dict(now=datetime.now)

@app.route('/categories')
def categories():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('categories.html')

@app.route('/rewards')
def rewards():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('rewards.html')

@app.route('/activity_map')
def activity_map():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('activity_map.html')

@app.route('/profile')
def profile():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('profile.html')

@app.route('/history')
def history():
    user_id = get_current_user_id()
    if not user_id:
        return redirect(url_for('dashboard'))
    return render_template('history.html')

# ============ API ROUTES ============
# ============ CATEGORIAS ============
@app.route('/api/categories', methods=['GET', 'POST'])
def api_categories():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    if request.method == 'POST':
        data = request.get_json()
        category = Category(
            name=data['name'],
            description=data.get('description', ''),
            color=data.get('color', '#3498db'),
            icon=data.get('icon', '📁'),
            user_id=user_id
        )
        db.session.add(category)
        db.session.commit()
        return jsonify({'id': category.id, 'message': 'Categoria criada com sucesso'})
    
    categories = Category.query.filter_by(user_id=user_id).all()
    return jsonify([{
        'id': cat.id,
        'name': cat.name,
        'description': cat.description,
        'color': cat.color,
        'icon': cat.icon,
        'activity_count': len(cat.activities)
    } for cat in categories])

@app.route('/api/categories/<int:category_id>', methods=['PUT', 'DELETE'])
def api_category(category_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    category = Category.query.filter_by(id=category_id, user_id=user_id).first_or_404()
    
    if request.method == 'PUT':
        data = request.get_json()
        category.name = data.get('name', category.name)
        category.description = data.get('description', category.description)
        category.color = data.get('color', category.color)
        category.icon = data.get('icon', category.icon)
        db.session.commit()
        return jsonify({'message': 'Categoria atualizada com sucesso'})
    
    elif request.method == 'DELETE':
        db.session.delete(category)
        db.session.commit()
        return jsonify({'message': 'Categoria excluída com sucesso'})

# ============ ATIVIDADES ============
@app.route('/api/activities', methods=['GET', 'POST'])
def api_activities():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    if request.method == 'POST':
        data = request.get_json()
        
        measurement_type = 'boolean'
        target_value = None
        target_unit = None
        manual_percentage = None
        
        if data.get('target_value') and data.get('target_unit'):
            measurement_type = 'units'
            target_value = float(data['target_value'])
            target_unit = data['target_unit']
        elif data.get('manual_percentage') is not None:
            measurement_type = 'percentage'
            manual_percentage = float(data['manual_percentage'])
        
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date() if data.get('start_date') else None
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date() if data.get('end_date') else None
        deadline = datetime.strptime(data['deadline'], '%Y-%m-%d').date() if data.get('deadline') else None
        
        activity = Activity(
            name=data['name'],
            description=data.get('description', ''),
            category_id=data['category_id'],
            user_id=user_id,
            measurement_type=measurement_type,
            status=data.get('status', 'want_to_do'),
            target_value=target_value,
            target_unit=target_unit,
            manual_percentage=manual_percentage,
            start_date=start_date,
            end_date=end_date,
            deadline=deadline,
            parent_activity_id=data.get('parent_activity_id')
        )
        db.session.add(activity)
        db.session.commit()
        return jsonify({'id': activity.id, 'message': 'Atividade criada com sucesso'})
    
    activities = Activity.query.filter_by(user_id=user_id).all()
    result = []
    for act in activities:
        progress = calculate_activity_progress(act)
        current_value = get_current_progress_value(act)
        
        result.append({
            'id': act.id,
            'name': act.name,
            'description': act.description,
            'category_id': act.category_id,
            'category_name': act.category.name if act.category else None,
            'category_color': act.category.color if act.category else '#3498db',
            'status': act.status,
            'measurement_type': act.measurement_type,
            'target_value': act.target_value,
            'target_unit': act.target_unit,
            'manual_percentage': act.manual_percentage,
            'progress': current_value if act.measurement_type == 'units' else progress,
            'progress_percentage': progress,
            'parent_activity_id': act.parent_activity_id,
            'children_count': len(act.children)  # CORREÇÃO: len() em vez de .count()
        })
    
    return jsonify(result)

@app.route('/api/activities/<int:activity_id>', methods=['GET', 'PUT', 'DELETE'])
def api_activity(activity_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    activity = Activity.query.filter_by(id=activity_id, user_id=user_id).first_or_404()
    
    if request.method == 'GET':
        progress = calculate_activity_progress(activity)
        current_value = get_current_progress_value(activity)
        
        children_list = []
        for child in activity.children:
            child_progress = calculate_activity_progress(child)
            children_list.append({
                'id': child.id,
                'name': child.name,
                'status': child.status,
                'progress': child_progress
            })
        
        return jsonify({
            'id': activity.id,
            'name': activity.name,
            'description': activity.description,
            'category_id': activity.category_id,
            'category_name': activity.category.name if activity.category else None,
            'category_color': activity.category.color if activity.category else '#3498db',
            'status': activity.status,
            'measurement_type': activity.measurement_type,
            'target_value': activity.target_value,
            'target_unit': activity.target_unit,
            'manual_percentage': activity.manual_percentage,
            'progress': current_value if activity.measurement_type == 'units' else progress,
            'progress_percentage': progress,
            'parent_activity_id': activity.parent_activity_id,
            'parent_name': activity.parent.name if activity.parent else None,
            'children': children_list,
            'children_count': len(activity.children),  # CORREÇÃO: len() em vez de .count()
            'created_at': activity.created_at.isoformat() if activity.created_at else None
        })
    
    elif request.method == 'PUT':
        data = request.get_json()
        
        activity.name = data.get('name', activity.name)
        activity.description = data.get('description', activity.description)
        activity.status = data.get('status', activity.status)
        
        measurement_type = data.get('measurement_type', activity.measurement_type)
        activity.measurement_type = measurement_type
        
        if measurement_type == 'units':
            activity.target_value = data.get('target_value')
            activity.target_unit = data.get('target_unit')
            activity.manual_percentage = None
        elif measurement_type == 'percentage':
            activity.manual_percentage = data.get('manual_percentage', 0)
            activity.target_value = None
            activity.target_unit = None
        else:
            activity.target_value = None
            activity.target_unit = None
            activity.manual_percentage = None
        
        activity.parent_activity_id = data.get('parent_activity_id', activity.parent_activity_id)
        
        db.session.commit()
        return jsonify({'message': 'Atividade atualizada com sucesso'})
    
    elif request.method == 'DELETE':
        db.session.delete(activity)
        db.session.commit()
        return jsonify({'message': 'Atividade excluída com sucesso'})

@app.route('/api/activities/hierarchy')
def api_activities_hierarchy():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        activities = Activity.query.filter_by(user_id=user_id).all()
        
        def build_hierarchy(activity_id=None):
            children = [a for a in activities if a.parent_activity_id == activity_id]
            result = []
            for child in children:
                progress = calculate_activity_progress(child)
                activity_data = {
                    'id': child.id,
                    'name': child.name,
                    'status': child.status,
                    'category_name': child.category.name if child.category else None,
                    'category_color': child.category.color if child.category else '#3498db',
                    'progress': progress,
                    'children_count': len(child.children),  # CORREÇÃO: len() em vez de .count()
                    'children': build_hierarchy(child.id)
                }
                result.append(activity_data)
            return result
        
        hierarchy = build_hierarchy()
        return jsonify(hierarchy)
    except Exception as e:
        print(f"Erro ao carregar hierarquia: {str(e)}")
        return jsonify([])

# ============ PROGRESSO ============
@app.route('/api/progress', methods=['POST'])
def api_progress():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'message': 'Usuário não autenticado'}), 401
        
        data = request.get_json()
        
        if not data.get('activity_id'):
            return jsonify({'message': 'ID da atividade é obrigatório'}), 400
        
        activity = Activity.query.filter_by(id=data['activity_id'], user_id=user_id).first()
        if not activity:
            return jsonify({'message': 'Atividade não encontrada'}), 404
        
        measurement_type = data.get('measurement_type', activity.measurement_type)
        value = float(data.get('value', 0))
        unit = data.get('unit', '')
        completed = data.get('completed', False)
        from_schedule = data.get('from_schedule', False)
        
        if measurement_type == 'units':
            if not unit:
                unit = activity.target_unit or 'unidades'
            if activity.target_value and value > activity.target_value:
                return jsonify({'message': f'O valor não pode exceder o alvo ({activity.target_value})'}), 400
        elif measurement_type == 'percentage':
            unit = '%'
            if value < 0 or value > 100:
                return jsonify({'message': 'A porcentagem deve estar entre 0 e 100'}), 400
            if value >= 100:
                completed = True
        elif measurement_type == 'boolean':
            unit = 'unidades'
            value = 1
            completed = True
        
        if completed and measurement_type == 'units' and activity.target_value:
            current_total = db.session.query(func.sum(Progress.value)).filter(
                Progress.activity_id == activity.id
            ).scalar() or 0
            value = max(activity.target_value - current_total, 0)
        
        progress_date = datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today()
        
        progress = Progress(
            activity_id=activity.id,
            user_id=user_id,
            date=progress_date,
            value=value,
            unit=unit,
            notes=data.get('notes', ''),
            completed=completed,
            from_schedule=from_schedule
        )
        db.session.add(progress)
        
        points_earned = 0
        streak_bonus = 0
        
        if measurement_type == 'units' and activity.target_value and activity.target_value > 0:
            progress_ratio = (value / activity.target_value) * 100 if activity.target_value > 0 else 0
            points_earned = int(progress_ratio / 10)
            
            if completed:
                points_earned += 5
        elif measurement_type == 'percentage':
            points_earned = int(value / 10)
            if completed:
                points_earned += 5
        elif measurement_type == 'boolean' and completed:
            points_earned = 10
        
        if from_schedule:
            streak_bonus, _ = calculate_streak_bonus(user_id)
            points_earned += streak_bonus
        
        progress.points_earned = points_earned
        progress.streak_bonus = streak_bonus
        
        user_points = UserPoints.query.filter_by(user_id=user_id).first()
        if not user_points:
            user_points = UserPoints(user_id=user_id, points=0)
            db.session.add(user_points)
        
        user_points.points += points_earned
        user_points.last_updated = datetime.utcnow()
        
        if points_earned > 0:
            description = f'Progresso em {activity.name}'
            if streak_bonus > 0:
                description += f' + {streak_bonus} pts (sequência)'
            
            transaction = PointTransaction(
                user_id=user_id,
                points=points_earned,
                description=description,
                activity_id=activity.id
            )
            db.session.add(transaction)
        
        if completed:
            activity.status = 'completed'
            if measurement_type == 'percentage':
                activity.manual_percentage = 100
        
        db.session.commit()
        
        current_progress = calculate_activity_progress(activity)
        
        return jsonify({
            'id': progress.id,
            'message': 'Progresso registrado com sucesso',
            'points_earned': points_earned,
            'streak_bonus': streak_bonus,
            'current_progress': current_progress,
            'activity_status': activity.status
        })
        
    except Exception as e:
        print(f"Erro ao registrar progresso: {str(e)}")
        return jsonify({'message': f'Erro ao registrar progresso: {str(e)}'}), 500

@app.route('/api/progress/recent')
def api_recent_progress():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    since_date = request.args.get('since')
    if since_date:
        since_date = datetime.strptime(since_date, '%Y-%m-%d').date()
    else:
        since_date = date.today() - timedelta(days=7)
    
    progress_entries = Progress.query.filter(
        Progress.user_id == user_id,
        Progress.date >= since_date
    ).order_by(Progress.date.desc()).all()
    
    return jsonify([{
        'id': p.id,
        'activity_id': p.activity_id,
        'activity_name': p.activity.name if p.activity else None,
        'value': p.value,
        'unit': p.unit,
        'notes': p.notes,
        'completed': p.completed,
        'points_earned': p.points_earned,
        'streak_bonus': p.streak_bonus,
        'date': p.date.isoformat(),
        'target_value': p.activity.target_value if p.activity else None
    } for p in progress_entries])

# ============ AGENDAMENTOS ============
@app.route('/api/schedules', methods=['GET', 'POST'])
def api_schedules():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    if request.method == 'POST':
        data = request.get_json()
        
        scheduled_date = datetime.strptime(data['scheduled_date'], '%Y-%m-%d').date()
        
        schedule = ScheduledActivity(
            activity_id=data['activity_id'],
            user_id=user_id,
            scheduled_date=scheduled_date,
            scheduled_time=data['scheduled_time'],
            duration=data['duration']
        )
        db.session.add(schedule)
        db.session.commit()
        return jsonify({'id': schedule.id, 'message': 'Atividade agendada com sucesso'})
    
    week_start = request.args.get('week_start')
    if week_start:
        week_start = datetime.strptime(week_start, '%Y-%m-%d').date()
    else:
        week_start = date.today() - timedelta(days=date.today().weekday())
    
    week_end = week_start + timedelta(days=6)
    
    schedules = ScheduledActivity.query.filter(
        ScheduledActivity.user_id == user_id,
        ScheduledActivity.scheduled_date >= week_start,
        ScheduledActivity.scheduled_date <= week_end
    ).all()
    
    return jsonify([{
        'id': s.id,
        'activity_id': s.activity_id,
        'activity_name': s.activity.name if s.activity else None,
        'category_color': s.activity.category.color if s.activity and s.activity.category else '#3498db',
        'scheduled_date': s.scheduled_date.isoformat(),
        'scheduled_time': s.scheduled_time,
        'duration': s.duration
    } for s in schedules])

@app.route('/api/schedules/<int:schedule_id>', methods=['PUT', 'DELETE'])
def api_schedule(schedule_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    schedule = ScheduledActivity.query.filter_by(id=schedule_id, user_id=user_id).first_or_404()
    
    if request.method == 'PUT':
        data = request.get_json()
        
        if 'scheduled_date' in data:
            schedule.scheduled_date = datetime.strptime(data['scheduled_date'], '%Y-%m-%d').date()
        if 'scheduled_time' in data:
            schedule.scheduled_time = data['scheduled_time']
        if 'duration' in data:
            schedule.duration = data['duration']
        
        db.session.commit()
        return jsonify({'message': 'Agendamento atualizado com sucesso'})
    
    elif request.method == 'DELETE':
        db.session.delete(schedule)
        db.session.commit()
        return jsonify({'message': 'Agendamento excluído com sucesso'})

@app.route('/api/schedules/<int:schedule_id>/replicate', methods=['POST'])
def api_replicate_schedule(schedule_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    original_schedule = ScheduledActivity.query.filter_by(id=schedule_id, user_id=user_id).first_or_404()
    data = request.get_json()
    
    replicate_type = data.get('type', 'weekly')
    until_date = datetime.strptime(data['until_date'], '%Y-%m-%d').date()
    days_of_week = data.get('days_of_week', [])
    
    if days_of_week and isinstance(days_of_week[0], str):
        days_of_week = [int(day) for day in days_of_week]
    
    created_schedules = []
    current_date = original_schedule.scheduled_date
    
    while current_date <= until_date:
        if should_replicate(current_date, original_schedule.scheduled_date, replicate_type, days_of_week):
            new_schedule = ScheduledActivity(
                activity_id=original_schedule.activity_id,
                user_id=user_id,
                scheduled_date=current_date,
                scheduled_time=original_schedule.scheduled_time,
                duration=original_schedule.duration
            )
            db.session.add(new_schedule)
            created_schedules.append(new_schedule)
        
        current_date += timedelta(days=1)
    
    db.session.commit()
    
    return jsonify({
        'message': f'{len(created_schedules)} agendamentos criados com sucesso',
        'created_count': len(created_schedules)
    })

def should_replicate(current_date, original_date, replicate_type, days_of_week):
    if replicate_type == 'daily':
        return True
    elif replicate_type == 'weekly':
        if days_of_week:
            return current_date.weekday() in days_of_week
        else:
            return current_date.weekday() == original_date.weekday()
    elif replicate_type == 'monthly':
        return current_date.day == original_date.day
    return False

# ============ RECOMPENSAS ============
@app.route('/api/rewards', methods=['GET', 'POST'])
def api_rewards():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    if request.method == 'POST':
        data = request.get_json()
        
        points_required = data.get('points_required', 0)
        try:
            points_required = int(points_required)
        except (ValueError, TypeError):
            points_required = 0
        
        reward = Reward(
            name=data['name'],
            description=data.get('description', ''),
            reward_type=data.get('reward_type', 'custom'),
            points_required=points_required,
            condition_type='points',
            condition_value=points_required,
            user_id=user_id
        )
        db.session.add(reward)
        db.session.commit()
        return jsonify({'id': reward.id, 'message': 'Recompensa criada com sucesso'})
    
    rewards = Reward.query.filter_by(user_id=user_id).all()
    return jsonify([{
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
    } for reward in rewards])

@app.route('/api/rewards/<int:reward_id>', methods=['PUT', 'DELETE'])
def api_reward(reward_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    reward = Reward.query.filter_by(id=reward_id, user_id=user_id).first_or_404()
    
    if request.method == 'PUT':
        data = request.get_json()
        
        if 'points_required' in data:
            try:
                reward.points_required = int(data['points_required'])
            except (ValueError, TypeError):
                reward.points_required = 0
        
        if 'name' in data:
            reward.name = data['name']
        if 'description' in data:
            reward.description = data.get('description', '')
        if 'achieved' in data:
            reward.achieved = data['achieved']
            if data['achieved']:
                reward.achieved_at = datetime.utcnow()
            else:
                reward.achieved_at = None
        
        db.session.commit()
        return jsonify({'message': 'Recompensa atualizada com sucesso'})
    
    elif request.method == 'DELETE':
        db.session.delete(reward)
        db.session.commit()
        return jsonify({'message': 'Recompensa excluída com sucesso'})

@app.route('/api/rewards/<int:reward_id>/purchase', methods=['POST'])
def api_purchase_reward(reward_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    reward = Reward.query.filter_by(id=reward_id, user_id=user_id).first_or_404()
    user_points = UserPoints.query.filter_by(user_id=user_id).first()
    
    if not user_points:
        user_points = UserPoints(user_id=user_id, points=0)
        db.session.add(user_points)
    
    if user_points.points < reward.points_required:
        return jsonify({'message': 'Pontos insuficientes para resgatar esta recompensa'}), 400
    
    user_points.points -= reward.points_required
    user_points.last_updated = datetime.utcnow()
    
    reward.achieved = True
    reward.achieved_at = datetime.utcnow()
    
    transaction = PointTransaction(
        user_id=user_id,
        points=-reward.points_required,
        description=f'Resgate: {reward.name}'
    )
    db.session.add(transaction)
    db.session.commit()
    
    return jsonify({
        'message': 'Recompensa resgatada com sucesso!',
        'remaining_points': user_points.points
    })

# ============ PONTOS ============
@app.route('/api/points')
def api_points():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    user_points = UserPoints.query.filter_by(user_id=user_id).first()
    if not user_points:
        user_points = UserPoints(user_id=user_id, points=0)
        db.session.add(user_points)
        db.session.commit()
    
    return jsonify({
        'total_points': user_points.points,
        'last_updated': user_points.last_updated.isoformat() if user_points.last_updated else None
    })

@app.route('/api/points/transactions')
def api_point_transactions():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    transactions = PointTransaction.query.filter_by(
        user_id=user_id
    ).order_by(PointTransaction.created_at.desc()).limit(50).all()
    
    return jsonify([{
        'id': t.id,
        'points': t.points,
        'description': t.description,
        'activity_name': t.activity.name if t.activity else None,
        'created_at': t.created_at.isoformat()
    } for t in transactions])

@app.route('/api/points/add', methods=['POST'])
def api_add_points():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    data = request.get_json()
    points = data.get('points', 0)
    description = data.get('description', 'Pontos adicionados')
    
    user_points = UserPoints.query.filter_by(user_id=user_id).first()
    if not user_points:
        user_points = UserPoints(user_id=user_id, points=0)
        db.session.add(user_points)
    
    user_points.points += points
    user_points.last_updated = datetime.utcnow()
    
    transaction = PointTransaction(
        user_id=user_id,
        points=points,
        description=description
    )
    db.session.add(transaction)
    db.session.commit()
    
    return jsonify({
        'message': f'{points} pontos adicionados com sucesso!',
        'total_points': user_points.points
    })

# ============ STREAK ============
def calculate_streak_bonus(user_id):
    streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
    if not streak:
        streak = WeeklyStreak(user_id=user_id, streak_count=0)
        db.session.add(streak)
    
    today = date.today()
    last_activity = streak.last_activity_date
    
    if not last_activity or (today - last_activity).days > 7:
        streak.streak_count = 1
    elif (today - last_activity).days <= 7 and (today - last_activity).days >= 1:
        streak.streak_count += 1
    
    streak.last_activity_date = today
    db.session.commit()
    
    if streak.streak_count == 1:
        return 1, "É um bom começo!"
    elif streak.streak_count == 2:
        return 2, "Você está indo bem!"
    elif streak.streak_count == 3:
        return 3, "Continue assim!"
    elif streak.streak_count == 4:
        return 4, "1 mês! Crescimento muito consistente!"
    elif streak.streak_count >= 8:
        return 8, "Ninguém para você, sai da frente!"
    elif streak.streak_count >= 5:
        return streak.streak_count, f"{streak.streak_count} semanas! Impressionante!"
    else:
        return streak.streak_count, f"{streak.streak_count} semanas consecutivas!"

@app.route('/api/streak')
def api_streak():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    streak = WeeklyStreak.query.filter_by(user_id=user_id).first()
    if not streak:
        streak = WeeklyStreak(user_id=user_id, streak_count=0)
        db.session.add(streak)
        db.session.commit()
    
    messages = {
        1: "É um bom começo!",
        2: "Você está indo bem!",
        3: "Continue assim!",
        4: "1 mês! Crescimento muito consistente!",
        5: "5 semanas! Impressionante!",
        6: "6 semanas! Não desista!",
        7: "7 semanas! Você é dedicado!",
        8: "2 meses! Ninguém para você!"
    }
    
    streak_message = messages.get(streak.streak_count, f"{streak.streak_count} semanas consecutivas!")
    
    return jsonify({
        'streak_count': streak.streak_count,
        'last_activity_date': streak.last_activity_date.isoformat() if streak.last_activity_date else None,
        'message': streak_message
    })

def get_current_streak(user_id):
    try:
        streak_record = WeeklyStreak.query.filter_by(user_id=user_id).first()
        
        if not streak_record:
            return 0
        
        today = date.today()
        last_activity = streak_record.last_activity_date
        
        if not last_activity:
            return 0
        
        if isinstance(last_activity, datetime):
            last_activity = last_activity.date()
        
        days_since_last = (today - last_activity).days
        
        if days_since_last <= 1:
            return streak_record.streak_count
        else:
            return 0
            
    except Exception as e:
        print(f"Erro em get_current_streak: {str(e)}")
        return 0

# ============ DASHBOARD ============
@app.route('/api/dashboard/stats')
def api_dashboard_stats():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Usuário não autenticado'}), 401
    
    total_activities = Activity.query.filter_by(user_id=user_id).count()
    completed_activities = Activity.query.filter_by(user_id=user_id, status='completed').count()
    total_categories = Category.query.filter_by(user_id=user_id).count()
    
    week_start = date.today() - timedelta(days=date.today().weekday())
    week_progress = Progress.query.filter(
        Progress.user_id == user_id,
        Progress.date >= week_start
    ).count()
    
    return jsonify({
        'total_activities': total_activities,
        'completed_activities': completed_activities,
        'total_categories': total_categories,
        'week_progress': week_progress
    })

# ============ PERFIL ============
@app.route('/api/profile/stats')
def api_profile_stats():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        category_hours = db.session.query(
            Category.name,
            Category.color,
            func.sum(ScheduledActivity.duration).label('total_minutes')
        ).join(Activity, Category.id == Activity.category_id
        ).join(ScheduledActivity, Activity.id == ScheduledActivity.activity_id
        ).filter(ScheduledActivity.user_id == user_id
        ).group_by(Category.id).all()
        
        category_time = [{
            'category': cat.name,
            'color': cat.color,
            'hours': round(cat.total_minutes / 60, 1) if cat.total_minutes else 0
        } for cat in category_hours]
        
        completed_activities = Activity.query.filter_by(
            user_id=user_id, 
            status='completed'
        ).all()
        
        avg_completion_times = []
        for activity in completed_activities:
            progress_entries = Progress.query.filter_by(
                activity_id=activity.id
            ).order_by(Progress.date.asc()).all()
            
            if len(progress_entries) >= 2:
                start_date = progress_entries[0].date
                end_date = progress_entries[-1].date
                days_to_complete = (end_date - start_date).days
                if days_to_complete > 0:
                    avg_completion_times.append(days_to_complete)
        
        avg_days = sum(avg_completion_times) / len(avg_completion_times) if avg_completion_times else 0
        
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        month_start = date(today.year, today.month, 1)
        
        today_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date == today
        ).count()
        
        week_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= week_start,
            ScheduledActivity.scheduled_date <= today
        ).count()
        
        month_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= month_start,
            ScheduledActivity.scheduled_date <= today
        ).count()
        
        status_counts = db.session.query(
            Activity.status,
            func.count(Activity.id)
        ).filter(Activity.user_id == user_id).group_by(Activity.status).all()
        
        status_distribution = {status: count for status, count in status_counts}
        
        return jsonify({
            'category_time': category_time,
            'total_completed': len(completed_activities),
            'avg_completion_days': round(avg_days, 1),
            'priority_metrics': {
                'today': today_schedules,
                'week': week_schedules,
                'month': month_schedules
            },
            'status_distribution': status_distribution,
            'total_activities': sum(status_distribution.values()),
            'productivity_score': calculate_productivity_score(user_id)
        })
        
    except Exception as e:
        print(f"Erro ao carregar estatísticas do perfil: {str(e)}")
        return jsonify({'error': str(e)}), 500

def calculate_productivity_score(user_id):
    try:
        total_activities = Activity.query.filter_by(user_id=user_id).count()
        completed_activities = Activity.query.filter_by(
            user_id=user_id, 
            status='completed'
        ).count()
        
        completion_ratio = (completed_activities / total_activities * 100) if total_activities > 0 else 0
        completion_score = min(completion_ratio, 100) * 0.4
        
        thirty_days_ago = date.today() - timedelta(days=30)
        recent_activities = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.date >= thirty_days_ago
        ).count()
        
        consistency_ratio = min(recent_activities / 20, 1)
        consistency_score = consistency_ratio * 100 * 0.3
        
        category_count = len(Category.query.filter_by(user_id=user_id).all())
        variety_score = min(category_count * 10, 100) * 0.2
        
        streak = get_current_streak(user_id)
        streak_score = min(streak * 10, 100) * 0.1
        
        total_score = completion_score + consistency_score + variety_score + streak_score
        
        return round(total_score, 1)
        
    except Exception as e:
        print(f"Erro em calculate_productivity_score: {str(e)}")
        return 0

def calculate_consistency_score(user_id):
    try:
        thirty_days_ago = date.today() - timedelta(days=30)
        
        active_days = db.session.query(
            func.count(func.distinct(Progress.date))
        ).filter(
            Progress.user_id == user_id,
            Progress.date >= thirty_days_ago
        ).scalar() or 0
        
        total_days = 30
        activity_consistency = (active_days / total_days) * 100 * 0.7
        
        scheduled_days = db.session.query(
            func.count(func.distinct(ScheduledActivity.scheduled_date))
        ).filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= thirty_days_ago
        ).scalar() or 0
        
        schedule_consistency = (scheduled_days / total_days) * 100 * 0.3
        
        total_consistency = activity_consistency + schedule_consistency
        
        return round(min(total_consistency, 100), 1)
        
    except Exception as e:
        print(f"Erro em calculate_consistency_score: {str(e)}")
        return 0

def get_fallback_profile_data(user_id):
    return {
        'category_time': [
            {'category': 'Desenvolvimento', 'color': '#4ECDC4', 'hours': 45},
            {'category': 'Estudos', 'color': '#FF6B6B', 'hours': 30},
            {'category': 'Exercícios', 'color': '#FFD166', 'hours': 20},
            {'category': 'Lazer', 'color': '#06D6A0', 'hours': 15}
        ],
        'total_completed': 42,
        'avg_completion_days': 3,
        'priority_metrics': {'today': 3, 'week': 12, 'month': 45},
        'status_distribution': {'completed': 25, 'in_progress': 10, 'want_to_do': 7},
        'total_activities': 42,
        'productivity_score': 78,
        'consistency_score': 85,
        'current_streak': 7,
        'patterns': {
            'most_productive_day': 'quarta',
            'favorite_category': 'Desenvolvimento',
            'completion_rate': 75,
            'recent_trend': 'up',
            'busiest_time': '10:00',
            'consistency_score': 85
        },
        'weekly_progress': [
            {'day_name': 'Seg', 'score': 70, 'scheduled': 5, 'completed': 4},
            {'day_name': 'Ter', 'score': 85, 'scheduled': 6, 'completed': 5},
            {'day_name': 'Qua', 'score': 90, 'scheduled': 7, 'completed': 6},
            {'day_name': 'Qui', 'score': 65, 'scheduled': 5, 'completed': 3},
            {'day_name': 'Sex', 'score': 75, 'scheduled': 6, 'completed': 5},
            {'day_name': 'Sáb', 'score': 50, 'scheduled': 4, 'completed': 2},
            {'day_name': 'Dom', 'score': 40, 'scheduled': 3, 'completed': 1}
        ],
        'annual_progress': round(((date.today() - date(date.today().year, 1, 1)).days / 365) * 100, 1),
        'user_id': user_id
    }

def get_profile_stats(user_id):
    try:
        category_hours = db.session.query(
            Category.name,
            Category.color,
            func.sum(ScheduledActivity.duration).label('total_minutes')
        ).join(Activity, Category.id == Activity.category_id
        ).join(ScheduledActivity, Activity.id == ScheduledActivity.activity_id
        ).filter(ScheduledActivity.user_id == user_id
        ).group_by(Category.id).all()
        
        category_time = [{
            'category': cat.name,
            'color': cat.color,
            'hours': round(cat.total_minutes / 60, 1) if cat.total_minutes else 0
        } for cat in category_hours]
        
        completed_activities = Activity.query.filter_by(
            user_id=user_id, 
            status='completed'
        ).all()
        
        total_completed = len(completed_activities)
        
        avg_completion_times = []
        for activity in completed_activities:
            progress_entries = Progress.query.filter_by(
                activity_id=activity.id
            ).order_by(Progress.date.asc()).all()
            
            if len(progress_entries) >= 2:
                start_date = progress_entries[0].date
                end_date = progress_entries[-1].date
                days_to_complete = (end_date - start_date).days
                if days_to_complete > 0:
                    avg_completion_times.append(days_to_complete)
        
        avg_completion_days = round(sum(avg_completion_times) / len(avg_completion_times), 1) if avg_completion_times else 0
        
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        month_start = date(today.year, today.month, 1)
        
        today_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date == today
        ).count()
        
        week_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= week_start,
            ScheduledActivity.scheduled_date <= today
        ).count()
        
        month_schedules = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= month_start,
            ScheduledActivity.scheduled_date <= today
        ).count()
        
        status_counts = db.session.query(
            Activity.status,
            func.count(Activity.id)
        ).filter(Activity.user_id == user_id).group_by(Activity.status).all()
        
        status_distribution = {status: count for status, count in status_counts}
        
        total_activities = Activity.query.filter_by(user_id=user_id).count()
        productivity_score = calculate_productivity_score(user_id)
        consistency_score = calculate_consistency_score(user_id)
        current_streak = get_current_streak(user_id)
        
        weekly_progress = []
        for i in range(4):
            week_start_date = today - timedelta(days=today.weekday() + (7 * i))
            week_end_date = week_start_date + timedelta(days=6)
            
            week_activities = Progress.query.filter(
                Progress.user_id == user_id,
                Progress.date >= week_start_date,
                Progress.date <= week_end_date
            ).count()
            
            weekly_progress.append({
                'week_start': week_start_date.isoformat(),
                'day_name': week_start_date.strftime('%A')[:3],
                'score': min(week_activities * 10, 100),
                'scheduled': ScheduledActivity.query.filter(
                    ScheduledActivity.user_id == user_id,
                    ScheduledActivity.scheduled_date >= week_start_date,
                    ScheduledActivity.scheduled_date <= week_end_date
                ).count(),
                'completed': week_activities
            })
        
        weekly_progress.reverse()
        
        patterns = analyze_time_patterns(user_id)
        
        if patterns.get('busiest_days'):
            most_productive_day = max(patterns['busiest_days'].items(), key=lambda x: x[1])[0]
        else:
            most_productive_day = 'quarta'
        
        if category_time:
            favorite_category = max(category_time, key=lambda x: x['hours'])['category']
        else:
            favorite_category = 'Desenvolvimento'
        
        completion_rate = (total_completed / total_activities * 100) if total_activities > 0 else 0
        
        if patterns.get('preferred_times'):
            busiest_time = max(patterns['preferred_times'].items(), key=lambda x: x[1])[0].split('-')[0]
        else:
            busiest_time = '10:00'
        
        if len(weekly_progress) >= 2:
            recent_trend = 'up' if weekly_progress[-1]['completed'] > weekly_progress[-2]['completed'] else 'stable'
        else:
            recent_trend = 'stable'
        
        total_days = 365
        days_passed = (today - date(today.year, 1, 1)).days
        annual_progress = min((days_passed / total_days) * 100, 100)
        
        return {
            'category_time': category_time,
            'total_completed': total_completed,
            'avg_completion_days': avg_completion_days,
            'priority_metrics': {
                'today': today_schedules,
                'week': week_schedules,
                'month': month_schedules
            },
            'status_distribution': status_distribution,
            'total_activities': total_activities,
            'productivity_score': productivity_score,
            'consistency_score': consistency_score,
            'current_streak': current_streak,
            'patterns': {
                'most_productive_day': most_productive_day,
                'favorite_category': favorite_category,
                'completion_rate': round(completion_rate, 1),
                'recent_trend': recent_trend,
                'busiest_time': busiest_time,
                'consistency_score': consistency_score
            },
            'weekly_progress': weekly_progress,
            'annual_progress': round(annual_progress, 1),
            'user_id': user_id
        }
        
    except Exception as e:
        print(f"Erro crítico em get_profile_stats: {str(e)}")
        return get_fallback_profile_data(user_id)

def analyze_time_patterns(user_id):
    try:
        schedules = ScheduledActivity.query.filter_by(user_id=user_id).all()
        
        if not schedules:
            return {'busiest_days': {}, 'preferred_times': {}}
        
        patterns = {
            'busiest_days': {},
            'preferred_times': {},
            'average_session_length': 0,
            'consistency_score': 0
        }
        
        days_map = {
            0: 'segunda',
            1: 'terça', 
            2: 'quarta',
            3: 'quinta',
            4: 'sexta',
            5: 'sábado',
            6: 'domingo'
        }
        
        for schedule in schedules:
            weekday = schedule.scheduled_date.weekday()
            day_name = days_map.get(weekday, str(weekday))
            patterns['busiest_days'][day_name] = patterns['busiest_days'].get(day_name, 0) + 1
        
        for schedule in schedules:
            try:
                if schedule.scheduled_time:
                    hour = int(schedule.scheduled_time.split(':')[0])
                    time_slot = f"{hour:02d}:00"
                    patterns['preferred_times'][time_slot] = patterns['preferred_times'].get(time_slot, 0) + 1
            except:
                continue
        
        total_duration = sum(s.duration for s in schedules if s.duration)
        patterns['average_session_length'] = round(total_duration / len(schedules), 1) if schedules else 0
        
        if len(schedules) > 1:
            dates = sorted([s.scheduled_date for s in schedules])
            intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
            
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                patterns['consistency_score'] = min(100, max(0, 100 - (avg_interval * 10)))
        
        return patterns
        
    except Exception as e:
        print(f"Erro em analyze_time_patterns: {str(e)}")
        return {'busiest_days': {}, 'preferred_times': {}}

def get_recent_activities(user_id, limit=50):
    try:
        since_date = date.today() - timedelta(days=7)
        
        progress_entries = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.date >= since_date
        ).order_by(Progress.date.desc()).limit(limit).all()
        
        return [{
            'id': p.id,
            'activity_id': p.activity_id,
            'activity_name': p.activity.name if p.activity else 'Atividade não encontrada',
            'category': p.activity.category.name if p.activity and p.activity.category else 'Sem categoria',
            'timestamp': p.date.isoformat() if p.date else None,
            'value': p.value,
            'unit': p.unit,
            'notes': p.notes,
            'completed': p.completed,
            'points_earned': p.points_earned,
            'streak_bonus': p.streak_bonus,
            'date': p.date.isoformat() if p.date else None,
            'target_value': p.activity.target_value if p.activity else None,
            'duration': p.activity.target_value if p.activity else 30,
            'estimated_duration': p.activity.target_value if p.activity else 30,
            'actual_duration': p.value if p.unit == 'minutos' else None,
            'efficiency': min(p.value / p.activity.target_value, 1) if p.activity and p.activity.target_value and p.activity.target_value > 0 else 0.5,
            'complexity': 'medium',
            'status': 'completed' if p.completed else 'in_progress'
        } for p in progress_entries]
        
    except Exception as e:
        print(f"Erro em get_recent_activities: {str(e)}")
        return []

def get_time_patterns(user_id):
    try:
        thirty_days_ago = date.today() - timedelta(days=30)
        
        hourly_patterns = db.session.query(
            ScheduledActivity.scheduled_time,
            func.count(ScheduledActivity.id).label('count')
        ).filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= thirty_days_ago,
            ScheduledActivity.scheduled_time.isnot(None)
        ).group_by(ScheduledActivity.scheduled_time).order_by(ScheduledActivity.scheduled_time).all()
        
        daily_patterns = db.session.query(
            func.extract('dow', ScheduledActivity.scheduled_date).label('day_of_week'),
            func.count(ScheduledActivity.id).label('count')
        ).filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= thirty_days_ago
        ).group_by('day_of_week').order_by('day_of_week').all()
        
        weekly_data = []
        for i in range(4):
            week_start = date.today() - timedelta(days=(7 * (i + 1)))
            week_end = week_start + timedelta(days=6)
            
            week_progress = Progress.query.filter(
                Progress.user_id == user_id,
                Progress.date >= week_start,
                Progress.date <= week_end
            ).count()
            
            weekly_data.append({
                'week_start': week_start.isoformat(),
                'activities_completed': week_progress,
                'total_hours': week_progress * 0.5,
                'productivity': week_progress / 10
            })
        
        return {
            'hourly_patterns': {str(h.scheduled_time): h.count for h in hourly_patterns if h.scheduled_time},
            'daily_patterns': {str(int(d.day_of_week)): d.count for d in daily_patterns},
            'weekly_progress': weekly_data,
            'recent_trends': {
                'productivity_trend': 'up' if len(weekly_data) >= 2 and weekly_data[0]['activities_completed'] > weekly_data[1]['activities_completed'] else 'stable',
                'consistency_score': calculate_consistency_score(user_id)
            }
        }
        
    except Exception as e:
        print(f"Erro em get_time_patterns: {str(e)}")
        return {}

def get_recent_activities_for_ai(user_id, limit=50):
    try:
        activities = Activity.query.filter_by(
            user_id=user_id
        ).order_by(Activity.created_at.desc()).limit(limit).all()
        
        result = []
        for act in activities:
            progress_percentage = calculate_activity_progress(act)
            current_value = get_current_progress_value(act)
            
            if act.measurement_type == 'units' and act.target_value:
                duration = act.target_value
            else:
                duration = 30
            
            result.append({
                'id': act.id,
                'name': act.name,
                'category_name': act.category.name if act.category else 'Geral',
                'created_at': act.created_at.isoformat() if act.created_at else datetime.utcnow().isoformat(),
                'duration': duration,
                'estimated_duration': duration,
                'actual_duration': current_value if act.measurement_type == 'units' else None,
                'value': current_value,
                'unit': act.target_unit if act.measurement_type == 'units' else '%',
                'completed': act.status == 'completed',
                'status': act.status,
                'target_value': act.target_value,
                'efficiency': progress_percentage / 100 if progress_percentage > 0 else 0.5,
                'complexity': 'medium'
            })
        
        return result
        
    except Exception as e:
        print(f"Erro em get_recent_activities_for_ai: {str(e)}")
        return []

@app.route('/api/profile/complete')
def api_profile_complete():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        basic_stats = get_profile_stats(user_id)
        activities = get_recent_activities_for_ai(user_id, limit=50)
        time_patterns = get_time_patterns(user_id)
        
        enhanced_stats = {}
        try:
            enhanced_stats = {
                'weekly': get_time_period_analysis(user_id, 'week'),
                'monthly': get_time_period_analysis(user_id, 'month'),
                'characterization': get_activity_profile(user_id),
                'focus_areas': identify_focus_areas(user_id),
                'growth_trend': analyze_growth_trend(user_id),
                'current_streak': get_current_streak(user_id),
                'consistency_score': calculate_consistency_score(user_id)
            }
        except Exception as enhanced_error:
            print(f"Aviso em enhanced_stats: {enhanced_error}")
            enhanced_stats = {
                'weekly': {},
                'monthly': {},
                'characterization': {'type': 'standard', 'description': 'Perfil padrão'},
                'focus_areas': [],
                'growth_trend': 'stable',
                'current_streak': 0,
                'consistency_score': 0
            }
        
        total_days = 365
        days_passed = (date.today() - date(date.today().year, 1, 1)).days
        annual_progress = min((days_passed / total_days) * 100, 100)
        
        return jsonify({
            'basic': {
                'category_time': basic_stats.get('category_time', []),
                'total_completed': basic_stats.get('total_completed', 0),
                'avg_completion_days': basic_stats.get('avg_completion_days', 0),
                'priority_metrics': basic_stats.get('priority_metrics', {'today': 0, 'week': 0, 'month': 0}),
                'status_distribution': basic_stats.get('status_distribution', {}),
                'total_activities': basic_stats.get('total_activities', 0),
                'productivity_score': basic_stats.get('productivity_score', 0),
                'consistency_score': basic_stats.get('consistency_score', 0),
                'current_streak': basic_stats.get('current_streak', 0),
                'patterns': {
                    'most_productive_day': 'quarta',
                    'favorite_category': 'Desenvolvimento',
                    'completion_rate': 75,
                    'recent_trend': 'up',
                    'busiest_time': '10:00',
                    'consistency_score': basic_stats.get('consistency_score', 0)
                },
                'weekly_progress': basic_stats.get('weekly_progress', []),
                'annual_progress': annual_progress,
                'user_id': user_id
            },
            'activities': activities,
            'time_patterns': time_patterns,
            'enhanced': enhanced_stats,
            'timestamp': datetime.utcnow().isoformat(),
            'ai_ready': len(activities) > 10
        })
        
    except Exception as e:
        print(f"Erro em api_profile_complete: {str(e)}")
        return jsonify({
            'basic': {
                'category_time': [],
                'total_completed': 0,
                'avg_completion_days': 0,
                'priority_metrics': {'today': 0, 'week': 0, 'month': 0},
                'status_distribution': {},
                'total_activities': 0,
                'productivity_score': 0,
                'consistency_score': 0,
                'current_streak': 0,
                'patterns': {},
                'weekly_progress': [],
                'annual_progress': 0,
                'user_id': user_id
            },
            'activities': [],
            'time_patterns': {},
            'enhanced': {},
            'timestamp': datetime.utcnow().isoformat(),
            'ai_ready': False,
            'error': str(e)
        }), 200

def get_time_period_analysis(user_id, period='week'):
    today = date.today()
    
    if period == 'week':
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=6)
    elif period == 'month':
        start_date = date(today.year, today.month, 1)
        end_date = date(today.year, today.month + 1, 1) - timedelta(days=1) if today.month < 12 else date(today.year + 1, 1, 1) - timedelta(days=1)
    elif period == 'year':
        start_date = date(today.year, 1, 1)
        end_date = date(today.year, 12, 31)
    else:
        start_date = today - timedelta(days=7)
        end_date = today
    
    schedules = ScheduledActivity.query.filter(
        ScheduledActivity.user_id == user_id,
        ScheduledActivity.scheduled_date >= start_date,
        ScheduledActivity.scheduled_date <= end_date
    ).all()
    
    category_hours = {}
    for schedule in schedules:
        activity = Activity.query.get(schedule.activity_id)
        if activity:
            category = Category.query.get(activity.category_id)
            if category:
                hours = schedule.duration / 60 if schedule.duration else 0
                category_hours[category.name] = category_hours.get(category.name, 0) + hours
    
    analysis = {
        'period': period,
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'total_hours': sum(category_hours.values()),
        'by_category': [
            {
                'category': cat,
                'hours': round(hours, 1),
                'percentage': round((hours / sum(category_hours.values())) * 100, 1) if sum(category_hours.values()) > 0 else 0
            }
            for cat, hours in category_hours.items()
        ]
    }
    
    return analysis

def get_activity_profile(user_id):
    activities = Activity.query.filter_by(user_id=user_id).all()
    
    if not activities:
        return {'type': 'beginner', 'description': 'Iniciando a jornada de produtividade'}
    
    status_counts = {}
    for activity in activities:
        status_counts[activity.status] = status_counts.get(activity.status, 0) + 1
    
    completed_percentage = (status_counts.get('completed', 0) / len(activities)) * 100
    
    if completed_percentage > 80:
        return {
            'type': 'achiever',
            'description': 'Perfil de alta realização com forte capacidade de finalização',
            'strengths': ['Conclusão', 'Foco', 'Persistência']
        }
    elif completed_percentage > 50:
        return {
            'type': 'balanced',
            'description': 'Equilíbrio entre planejamento e execução',
            'strengths': ['Versatilidade', 'Adaptabilidade']
        }
    else:
        return {
            'type': 'explorer',
            'description': 'Perfil exploratório com múltiplos interesses em desenvolvimento',
            'strengths': ['Curiosidade', 'Aprendizado contínuo']
        }

def identify_focus_areas(user_id):
    activities = Activity.query.filter_by(user_id=user_id).all()
    
    if not activities:
        return []
    
    category_activities = {}
    for activity in activities:
        category = Category.query.get(activity.category_id)
        if category:
            category_activities[category.name] = category_activities.get(category.name, 0) + 1
    
    total_activities = len(activities)
    focus_areas = []
    
    for category, count in category_activities.items():
        percentage = (count / total_activities) * 100
        if percentage >= 30:
            focus_areas.append({
                'category': category,
                'percentage': round(percentage, 1),
                'level': 'primary_focus'
            })
        elif percentage >= 15:
            focus_areas.append({
                'category': category,
                'percentage': round(percentage, 1),
                'level': 'secondary_focus'
            })
    
    return focus_areas

def analyze_growth_trend(user_id):
    thirty_days_ago = date.today() - timedelta(days=30)
    
    recent_progress = Progress.query.filter(
        Progress.user_id == user_id,
        Progress.date >= thirty_days_ago
    ).count()
    
    previous_period_start = thirty_days_ago - timedelta(days=30)
    previous_progress = Progress.query.filter(
        Progress.user_id == user_id,
        Progress.date >= previous_period_start,
        Progress.date < thirty_days_ago
    ).count()
    
    if previous_progress == 0:
        return 'stable'
    
    growth_percentage = ((recent_progress - previous_progress) / previous_progress) * 100
    
    if growth_percentage > 20:
        return 'up'
    elif growth_percentage < -20:
        return 'down'
    else:
        return 'stable'

# ============ ROTAS DE ANÁLISE DE IA ============
@app.route('/api/ai/profile_analysis')
def api_ai_profile_analysis():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        ai_data = {
            'user_profile': get_profile_stats(user_id),
            'activities_data': get_recent_activities(user_id, limit=100),
            'patterns_data': get_time_patterns(user_id),
            'enhanced_stats': {
                'weekly_analysis': get_time_period_analysis(user_id, 'week'),
                'user_profile_type': get_activity_profile(user_id),
                'focus_areas': identify_focus_areas(user_id)
            }
        }
        
        return jsonify(ai_data)
        
    except Exception as e:
        print(f"Erro em api_ai_profile_analysis: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile/enhanced_stats')
def api_profile_enhanced_stats():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        today = date.today()
        
        basic_stats = get_profile_stats(user_id)
        
        time_analysis = {
            'weekly': get_time_period_analysis(user_id, 'week'),
            'monthly': get_time_period_analysis(user_id, 'month'),
            'yearly': get_time_period_analysis(user_id, 'year'),
            'patterns': analyze_time_patterns(user_id)
        }
        
        characterization = {
            'activity_profile': get_activity_profile(user_id),
            'consistency_score': calculate_consistency_score(user_id),
            'focus_areas': identify_focus_areas(user_id),
            'growth_trend': analyze_growth_trend(user_id)
        }
        
        return jsonify({
            'basic_stats': basic_stats,
            'time_analysis': time_analysis,
            'characterization': characterization,
            'last_updated': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"Erro em enhanced_stats: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile/time_analysis')
def api_time_analysis():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        patterns = get_time_patterns(user_id)
        return jsonify(patterns)
    except Exception as e:
        print(f"Erro em api_time_analysis: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile/historical')
def api_profile_historical():
    try:
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Usuário não autenticado'}), 401
        
        days = request.args.get('days', 90, type=int)
        start_date = date.today() - timedelta(days=days)
        
        progress_entries = Progress.query.filter(
            Progress.user_id == user_id,
            Progress.date >= start_date
        ).order_by(Progress.date.asc()).all()
        
        scheduled_entries = ScheduledActivity.query.filter(
            ScheduledActivity.user_id == user_id,
            ScheduledActivity.scheduled_date >= start_date
        ).order_by(ScheduledActivity.scheduled_date.asc()).all()
        
        daily_data = {}
        
        for progress in progress_entries:
            date_key = progress.date.isoformat()
            if date_key not in daily_data:
                daily_data[date_key] = {
                    'date': date_key,
                    'activities_completed': 0,
                    'points_earned': 0,
                    'scheduled_activities': 0,
                    'time_spent': 0,
                    'categories': {}
                }
            
            daily_data[date_key]['activities_completed'] += 1
            daily_data[date_key]['points_earned'] += progress.points_earned
        
        for schedule in scheduled_entries:
            date_key = schedule.scheduled_date.isoformat()
            if date_key not in daily_data:
                daily_data[date_key] = {
                    'date': date_key,
                    'activities_completed': 0,
                    'points_earned': 0,
                    'scheduled_activities': 0,
                    'time_spent': 0,
                    'categories': {}
                }
            
            daily_data[date_key]['scheduled_activities'] += 1
            daily_data[date_key]['time_spent'] += schedule.duration if schedule.duration else 0
            
            activity = Activity.query.get(schedule.activity_id)
            if activity:
                category = Category.query.get(activity.category_id)
                if category:
                    cat_name = category.name
                    daily_data[date_key]['categories'][cat_name] = daily_data[date_key]['categories'].get(cat_name, 0) + (schedule.duration if schedule.duration else 0)
        
        historical_data = sorted(daily_data.values(), key=lambda x: x['date'])
        
        total_completed = sum(day['activities_completed'] for day in historical_data)
        total_points = sum(day['points_earned'] for day in historical_data)
        total_scheduled = sum(day['scheduled_activities'] for day in historical_data)
        
        return jsonify({
            'historical_data': historical_data,
            'summary': {
                'total_completed': total_completed,
                'total_points': total_points,
                'total_scheduled': total_scheduled,
                'days_analyzed': days,
                'period_start': start_date.isoformat(),
                'period_end': date.today().isoformat()
            },
            'timeline': [{
                'date': day['date'],
                'completed': day['activities_completed'],
                'scheduled': day['scheduled_activities'],
                'points': day['points_earned']
            } for day in historical_data],
            'patterns': analyze_historical_patterns(historical_data)
        })
        
    except Exception as e:
        print(f"Erro em api_profile_historical: {str(e)}")
        return jsonify(get_simulated_historical_data(days))

def get_simulated_historical_data(days=90):
    data = []
    base_date = date.today() - timedelta(days=days)
    
    for i in range(days):
        current_date = base_date + timedelta(days=i)
        weekday = current_date.weekday()
        
        if weekday < 5:
            completed = random.randint(2, 5)
            scheduled = random.randint(3, 6)
            points = random.randint(10, 30)
        else:
            completed = random.randint(0, 2)
            scheduled = random.randint(1, 3)
            points = random.randint(0, 15)
        
        data.append({
            'date': current_date.isoformat(),
            'activities_completed': completed,
            'scheduled_activities': scheduled,
            'points_earned': points,
            'time_spent': random.randint(30, 180)
        })
    
    return {
        'historical_data': data,
        'summary': {
            'total_completed': sum(d['activities_completed'] for d in data),
            'total_points': sum(d['points_earned'] for d in data),
            'total_scheduled': sum(d['scheduled_activities'] for d in data),
            'days_analyzed': days,
            'period_start': base_date.isoformat(),
            'period_end': date.today().isoformat()
        },
        'timeline': data,
        'patterns': {
            'average_daily_activities': round(sum(d['activities_completed'] for d in data) / days, 1),
            'best_day': max(data, key=lambda x: x['activities_completed'])['date'],
            'consistency_score': random.randint(60, 90),
            'trend': 'up' if days > 30 and data[-1]['activities_completed'] > data[0]['activities_completed'] else 'stable'
        },
        'simulated': True
    }

def analyze_historical_patterns(historical_data):
    if not historical_data:
        return {}
    
    avg_daily = sum(day['activities_completed'] for day in historical_data) / len(historical_data)
    best_day = max(historical_data, key=lambda x: x['activities_completed'])
    
    values = [day['activities_completed'] for day in historical_data]
    if values:
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = variance ** 0.5
        consistency = max(0, 100 - (std_dev / mean * 100)) if mean > 0 else 0
    else:
        consistency = 0
    
    if len(historical_data) >= 14:
        first_week = historical_data[:7]
        last_week = historical_data[-7:]
        avg_first = sum(day['activities_completed'] for day in first_week) / 7
        avg_last = sum(day['activities_completed'] for day in last_week) / 7
        
        if avg_last > avg_first * 1.2:
            trend = 'up'
        elif avg_last < avg_first * 0.8:
            trend = 'down'
        else:
            trend = 'stable'
    else:
        trend = 'stable'
    
    return {
        'average_daily_activities': round(avg_daily, 1),
        'best_day': best_day['date'],
        'best_day_count': best_day['activities_completed'],
        'consistency_score': round(consistency, 1),
        'trend': trend
    }

# ============ ROTAS DE SAÚDE ============
@app.route('/api/health')
def api_health():
    try:
        user_count = User.query.count()
        activity_count = Activity.query.filter_by(user_id=get_current_user_id() or 1).count()
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'user_data': {
                'user_exists': user_count > 0,
                'activity_count': activity_count
            },
            'endpoints': {
                'profile': True,
                'activities': True,
                'progress': True,
                'ai': True
            },
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

@app.route('/api/health/check')
def api_health_check():
    endpoints = [
        ('/api/profile/complete', 'complete_profile'),
        ('/api/profile/stats', 'basic_stats'),
        ('/api/progress/recent', 'recent_progress'),
        ('/api/categories', 'categories'),
        ('/api/activities', 'activities')
    ]
    
    results = {}
    
    for endpoint, name in endpoints:
        try:
            with app.test_client() as client:
                response = client.get(endpoint)
                results[name] = {
                    'status': response.status_code,
                    'ok': response.status_code == 200,
                    'endpoint': endpoint
                }
        except Exception as e:
            results[name] = {
                'status': 500,
                'ok': False,
                'error': str(e),
                'endpoint': endpoint
            }
    
    return jsonify({
        'status': 'online' if all(r['ok'] for r in results.values()) else 'partial',
        'results': results,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/database/info')
def api_database_info():
    is_production = bool(os.environ.get('DATABASE_URL'))
    database_type = 'PostgreSQL (Produção)' if is_production else 'SQLite (Desenvolvimento)'
    
    try:
        user_count = User.query.count()
        activity_count = Activity.query.count()
        
        return jsonify({
            'database_type': database_type,
            'user_count': user_count,
            'activity_count': activity_count,
            'production': is_production,
            'persistence': 'PERMANENTE' if is_production else 'TEMPORÁRIA'
        })
    except Exception as e:
        return jsonify({
            'database_type': database_type,
            'error': str(e),
            'production': is_production
        })

# ============ INICIALIZAÇÃO DO BANCO ============
def init_database():
    with app.app_context():
        try:
            is_production = bool(os.environ.get('DATABASE_URL'))
            
            if is_production:
                db.create_all()
                print("✅ Produção: Tabelas verificadas/criadas no PostgreSQL")
                
                user1 = User.query.get(1)
                if not user1:
                    user1 = User(
                        id=1, 
                        username='usuario1', 
                        email='usuario1@exemplo.com'
                    )
                    db.session.add(user1)
                    print("✅ Usuário 1 criado (produção)")
                
                user2 = User.query.get(2)
                if not user2:
                    user2 = User(
                        id=2, 
                        username='usuario2', 
                        email='usuario2@exemplo.com'
                    )
                    db.session.add(user2)
                    print("✅ Usuário 2 criado (produção)")
                    
            else:
                db.drop_all()
                db.create_all()
                print("✅ Desenvolvimento: Tabelas recriadas no SQLite")
                
                user1 = User(id=1, username='usuario1', email='usuario1@exemplo.com')
                user2 = User(id=2, username='usuario2', email='usuario2@exemplo.com')
                db.session.add(user1)
                db.session.add(user2)
                
                create_sample_data_for_user(1)
                print("✅ Dados de exemplo criados para desenvolvimento")
            
            db.session.commit()
                
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro ao inicializar banco: {str(e)}")

# ============ EXECUÇÃO ============
init_database()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)