export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'Classroom Management System',

  mongodb: {
    uri: process.env.MONGODB_URI,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3001',
  },

  redis: {
    enabled: process.env.REDIS_ENABLED === 'true' || false,
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    tls: process.env.REDIS_TLS === 'true' || false,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'cms:',
  },

  system: {
    maxOverdueMinutes: parseInt(process.env.MAX_OVERDUE_MINUTES, 10) || 15,
    autoUnlockBeforeClass: parseInt(process.env.AUTO_UNLOCK_BEFORE_CLASS, 10) || 5,
    notificationBeforeClass: parseInt(process.env.NOTIFICATION_BEFORE_CLASS, 10) || 30,
  },

  // Phase-based Development Configuration
  app: {
    // Phase 1: Single Campus (Can Tho) - CURRENT
    defaultCampusId: process.env.DEFAULT_CAMPUS_ID || '693ad44426d23ee0a8bf08f5',
    defaultCampusCode: 'CANTHO',

    // Phase 2+: Multi-Campus Support (Feature Flag)
    multiCampusEnabled: process.env.MULTI_CAMPUS_ENABLED === 'true' || false,

    // Supported campus codes (Phase 3: expand this list)
    supportedCampuses: (process.env.SUPPORTED_CAMPUSES || 'CANTHO').split(','),
  },
});
