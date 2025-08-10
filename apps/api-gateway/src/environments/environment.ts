export const environment = {
  production: false,
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
};
