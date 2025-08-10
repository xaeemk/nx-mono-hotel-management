export const environment = {
  production: true,
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  allowedOrigins: process.env.ALLOWED_ORIGINS || 'https://yourapp.com',
};
