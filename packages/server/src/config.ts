import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  adminEmail: process.env.ADMIN_EMAIL || 'ryan.mccarthy@rockbot.com',
  mailtrap: {
    token: process.env.MAILTRAP_TOKEN || '',
    senderEmail: process.env.SENDER_EMAIL || 'hello@productdesign.rockbot.com',
    senderName: process.env.SENDER_NAME || 'Prototype Feedback',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Prototype Feedback" <no-reply@prototype-feedback.dev>',
  },
};
