process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.SESSION_SECRET = 'test-session-secret-with-enough-length-123456';
process.env.COOKIE_NAME = 'cspc_queue.sid';
process.env.COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_PATH = 'tests/.tmp/env-default.sqlite';
process.env.QUEUE_ENFORCE_HOURS = 'true';
