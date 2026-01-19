from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date
from sqlalchemy.sql import func

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    categories = db.relationship('Category', backref='user', lazy=True, cascade="all, delete-orphan")
    activities = db.relationship('Activity', backref='user', lazy=True, cascade="all, delete-orphan")
    progress = db.relationship('Progress', backref='user', lazy=True, cascade="all, delete-orphan")
    rewards = db.relationship('Reward', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('ScheduledActivity', backref='user', lazy=True, cascade="all, delete-orphan")

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    color = db.Column(db.String(7), default='#3498db')
    icon = db.Column(db.String(50), default='📁')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    activities = db.relationship('Activity', backref='category', lazy=True, cascade="all, delete-orphan")

class Activity(db.Model):
    __tablename__ = 'activities'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    parent_activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    
    # Tipo de medição (units, percentage, boolean)
    measurement_type = db.Column(db.String(20), default='boolean')
    
    # Para tipo 'units'
    target_value = db.Column(db.Float)
    target_unit = db.Column(db.String(50))
    
    # Para tipo 'percentage'
    manual_percentage = db.Column(db.Float, default=0.0)
    
    # Status geral
    status = db.Column(db.String(20), default='want_to_do')
    
    # Datas
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    deadline = db.Column(db.Date)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    children = db.relationship('Activity', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')
    progress_entries = db.relationship('Progress', backref='activity', lazy=True, cascade="all, delete-orphan")
    # ERRO: backref='scheduled_activity' está causando conflito de nomes
    schedules = db.relationship('ScheduledActivity', backref='activity', lazy=True, cascade="all, delete-orphan")

class Progress(db.Model):
    __tablename__ = 'progress'
    id = db.Column(db.Integer, primary_key=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    date = db.Column(db.Date, nullable=False, default=date.today)
    value = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(50))
    
    notes = db.Column(db.Text)
    completed = db.Column(db.Boolean, default=False)
    
    # Campos para cálculo de pontos
    points_earned = db.Column(db.Integer, default=0)
    streak_bonus = db.Column(db.Integer, default=0)
    from_schedule = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Reward(db.Model):
    __tablename__ = 'rewards'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    reward_type = db.Column(db.String(50), default='custom')
    
    points_required = db.Column(db.Integer, default=0, nullable=False)
    
    condition_type = db.Column(db.String(50))
    condition_value = db.Column(db.Float)
    condition_activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    
    achieved = db.Column(db.Boolean, default=False)
    achieved_at = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ScheduledActivity(db.Model):
    __tablename__ = 'scheduled_activities'
    id = db.Column(db.Integer, primary_key=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    scheduled_date = db.Column(db.Date, nullable=False)
    scheduled_time = db.Column(db.String(5), nullable=False)
    duration = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class UserPoints(db.Model):
    __tablename__ = 'user_points'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    points = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PointTransaction(db.Model):
    __tablename__ = 'point_transactions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(200), nullable=False)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class WeeklyStreak(db.Model):
    __tablename__ = 'weekly_streaks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    streak_count = db.Column(db.Integer, default=0)
    last_activity_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)