import nodemailer from 'nodemailer';
import { FeedbackPayload, ServiceResult } from '../types.js';
import { config } from '../config.js';

/**
 * Sends an email notification with embedded inline screenshot attachment using Nodemailer.
 */
export async function sendEmailNotification(payload: FeedbackPayload): Promise<ServiceResult> {
  if (!config.adminEmail) {
    console.log('[Email Service] ADMIN_EMAIL is not configured. Skipping email notification.');
    return {
      success: false,
      message: 'Admin email not configured',
    };
  }

  if (!config.smtp.host || !config.smtp.user) {
    console.log('[Email Service] SMTP configuration is missing. Skipping email dispatch.');
    return {
      success: false,
      message: 'SMTP settings missing',
    };
  }

  try {
    // 1. Create Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // true for 465, false for other ports
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });

    // 2. Parse base64 image data URL into Buffer for inline CID attachment
    let attachments: nodemailer.SendMailOptions['attachments'] = [];
    let imageHtml = '<p><em>No screenshot captured.</em></p>';

    if (payload.image && payload.image.startsWith('data:image/')) {
      const matches = payload.image.match(/^data:image\/([a-zA-Z]*);base64,(.*)$/);
      if (matches && matches.length === 3) {
        const imageType = matches[1];
        const base64Data = matches[2];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        attachments.push({
          filename: `screenshot.${imageType}`,
          content: imageBuffer,
          cid: 'screenshot', // Content-ID for inline referencing
        });

        imageHtml = `
          <div style="margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <div style="background: #f8fafc; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #64748b;">
              📸 CAPTURED ANNOTATED SCREENSHOT
            </div>
            <div style="padding: 12px; background: #0f172a; text-align: center;">
              <img src="cid:screenshot" alt="Annotated Prototype Screenshot" style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" />
            </div>
          </div>
        `;
      }
    }

    const pinText = payload.coordinates
      ? `X: ${payload.coordinates.xPercent}% | Y: ${payload.coordinates.yPercent}% (${payload.coordinates.x}px, ${payload.coordinates.y}px)`
      : 'No pin placed';

    // 3. Compose HTML body
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; padding: 20px; }
          .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 20px; font-weight: 700; color: #4338ca; margin: 0; }
          .badge { display: inline-block; padding: 4px 12px; background: #e0e7ff; color: #3730a3; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
          .comment-box { background: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; font-size: 15px; color: #0f172a; white-space: pre-wrap; }
          .meta-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          .meta-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
          .meta-label { font-weight: 600; color: #64748b; width: 30%; }
          .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">${payload.category || 'General'}</span>
            <h1 class="title" style="margin-top: 8px;">New Feedback Received</h1>
          </div>

          <p style="font-size: 14px; color: #475569;">A user left new visual feedback on your prototype:</p>

          <div class="comment-box">${payload.comment}</div>

          <table class="meta-table">
            <tr>
              <td class="meta-label">Prototype URL</td>
              <td><a href="${payload.url}" target="_blank" style="color: #4f46e5; text-decoration: none;">${payload.url}</a></td>
            </tr>
            <tr>
              <td class="meta-label">User Email</td>
              <td>${payload.email || 'Anonymous'}</td>
            </tr>
            <tr>
              <td class="meta-label">Pin Coordinates</td>
              <td>${pinText}</td>
            </tr>
            <tr>
              <td class="meta-label">Screen Resolution</td>
              <td>${payload.resolution.width} x ${payload.resolution.height} (dpr: ${payload.resolution.devicePixelRatio})</td>
            </tr>
            <tr>
              <td class="meta-label">Submitted At</td>
              <td>${payload.timestamp || new Date().toISOString()}</td>
            </tr>
          </table>

          ${imageHtml}

          <div class="footer">
            Sent automatically by Prototype Feedback Web Component Server.
          </div>
        </div>
      </body>
      </html>
    `;

    // 4. Send email
    const mailOptions: nodemailer.SendMailOptions = {
      from: config.smtp.from,
      to: config.adminEmail,
      subject: `[Prototype Feedback] ${payload.category || 'New Comment'}: ${payload.comment.substring(0, 40)}...`,
      html: htmlBody,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Email Service] Message sent successfully: %s', info.messageId);

    return {
      success: true,
      message: `Email sent successfully (Message ID: ${info.messageId})`,
    };
  } catch (error: any) {
    console.error('[Email Service Error]:', error);
    return {
      success: false,
      message: 'Failed to send email notification',
      error: error.message || String(error),
    };
  }
}
