from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import CheckConstraint, Index, ForeignKey, case
from sqlalchemy.orm import relationship, backref
from typing import List, Optional

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relações - sem type hints que causam conflito
    categories = relationship('Category', backref='user_', lazy=True, cascade='all, delete-orphan')
    activities = relationship('Activity', backref='user_', lazy=True, cascade='all, delete-orphan')
    progress = relationship('Progress', backref='user_', lazy=True, cascade='all, delete-orphan')
    scheduled_activities = relationship('ScheduledActivity', backref='user_', lazy=True, cascade='all, delete-orphan')
    rewards = relationship('Reward', backref='user_', lazy=True, cascade='all, delete-orphan')
    points = relationship('UserPoints', backref='user_', uselist=False, cascade='all, delete-orphan')
    point_transactions = relationship('PointTransaction', backref='user_', lazy=True, cascade='all, delete-orphan')
    weekly_streaks = relationship('WeeklyStreak', backref='user_', uselist=False, cascade='all, delete-orphan')

class Category(db.Model):
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    color = db.Column(db.String(7), default='#3498db')
    icon = db.Column(db.String(10), default='📁')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relações
    activities = relationship('Activity', backref='category', lazy=True, cascade='all, delete-orphan')
    
    __table_args__ = (
        Index('idx_category_user', 'user_id', 'name'),
        db.UniqueConstraint('user_id', 'name', name='unique_category_per_user'),
    )

class Activity(db.Model):
    __tablename__ = 'activities'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Tipos: 'boolean', 'units', 'percentage'
    measurement_type = db.Column(db.String(20), default='boolean')
    
    # Para unidades
    target_value = db.Column(db.Float, nullable=True)
    target_unit = db.Column(db.String(50), nullable=True)
    
    # Para porcentagem
    manual_percentage = db.Column(db.Float, default=0.0)
    
    # Status: 'want_to_do', 'in_progress', 'completed', 'cancelled'
    status = db.Column(db.String(20), default='want_to_do')
    
    # Datas
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    deadline = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Hierarquia
    parent_activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    
    # Relações
    parent = relationship('Activity', remote_side=[id], backref='children')
    progress = relationship('Progress', backref='activity', lazy=True, cascade='all, delete-orphan')
    scheduled_activities = relationship('ScheduledActivity', backref='activity', lazy=True, cascade='all, delete-orphan')
    point_transactions = relationship('PointTransaction', backref='activity', lazy=True)
    
    __table_args__ = (
        CheckConstraint("measurement_type IN ('boolean', 'units', 'percentage')", name='check_measurement_type'),
        CheckConstraint("status IN ('want_to_do', 'in_progress', 'completed', 'cancelled')", name='check_status'),
        Index('idx_activity_user', 'user_id', 'status'),
        Index('idx_activity_category', 'category_id'),
        Index('idx_activity_parent', 'parent_activity_id'),
    )

class Progress(db.Model):
    __tablename__ = 'progress'
    
    id = db.Column(db.Integer, primary_key=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    value = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(50))
    notes = db.Column(db.Text)
    completed = db.Column(db.Boolean, default=False)
    from_schedule = db.Column(db.Boolean, default=False)
    points_earned = db.Column(db.Integer, default=0)
    streak_bonus = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_progress_activity', 'activity_id', 'date'),
        Index('idx_progress_user_date', 'user_id', 'date'),
        db.UniqueConstraint('activity_id', 'date', name='unique_progress_per_day'),
    )

class ScheduledActivity(db.Model):
    __tablename__ = 'scheduled_activities'
    
    id = db.Column(db.Integer, primary_key=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    scheduled_date = db.Column(db.Date, nullable=False)
    scheduled_time = db.Column(db.String(8))  # HH:MM format
    duration = db.Column(db.Integer)  # em minutos
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_schedule_user_date', 'user_id', 'scheduled_date'),
        Index('idx_schedule_activity', 'activity_id'),
    )

class Reward(db.Model):
    __tablename__ = 'rewards'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    reward_type = db.Column(db.String(50), default='custom')
    points_required = db.Column(db.Integer, default=0)
    condition_type = db.Column(db.String(50), default='points')  # 'points', 'activity', 'streak'
    condition_value = db.Column(db.Integer, nullable=True)
    condition_activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    achieved = db.Column(db.Boolean, default=False)
    achieved_at = db.Column(db.DateTime, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_reward_user', 'user_id', 'achieved'),
    )

class UserPoints(db.Model):
    __tablename__ = 'user_points'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    points = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint('points >= 0', name='check_points_non_negative'),
    )

class PointTransaction(db.Model):
    __tablename__ = 'point_transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255))
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_transaction_user_date', 'user_id', 'created_at'),
    )

class WeeklyStreak(db.Model):
    __tablename__ = 'weekly_streaks'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    streak_count = db.Column(db.Integer, default=0)
    last_activity_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        CheckConstraint('streak_count >= 0', name='check_streak_non_negative'),
    )