import os

workers = 1
worker_class = 'sync'
threads = 4
timeout = 120
bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"
accesslog = '-'
errorlog = '-'
loglevel = 'info'