import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Prototype Feedback" <no-reply@prototype-feedback.dev>',
  },
};
