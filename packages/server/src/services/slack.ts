import { FeedbackPayload, ServiceResult } from '../types.js';
import { config } from '../config.js';

/**
 * Sends a formatted Slack notification block when new feedback is received.
 */
export async function sendSlackNotification(payload: FeedbackPayload): Promise<ServiceResult> {
  if (!config.slackWebhookUrl) {
    console.log('[Slack Service] SLACK_WEBHOOK_URL is not configured. Skipping Slack notification.');
    return {
      success: false,
      message: 'Slack webhook URL not configured',
    };
  }

  try {
    const category = payload.category || 'General';
    const pinText = payload.coordinates
      ? `📍 X: ${payload.coordinates.xPercent}% | Y: ${payload.coordinates.yPercent}% (Pixel: ${payload.coordinates.x}px, ${payload.coordinates.y}px)`
      : 'None placed';

    const resolutionText = `${payload.resolution.width}x${payload.resolution.height} (dpr: ${payload.resolution.devicePixelRatio})`;

    // Slack Block Kit Payload
    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📢 New Prototype Feedback [${category}]`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Feedback Comment:*\n>${payload.comment.replace(/\n/g, '\n>')}`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Prototype URL:*\n<${payload.url}|${payload.url}>`,
            },
            {
              type: 'mrkdwn',
              text: `*User Email:*\n${payload.email || 'Anonymous'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Pin Location:*\n${pinText}`,
            },
            {
              type: 'mrkdwn',
              text: `*Resolution:*\n${resolutionText}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📅 *Submitted at:* ${payload.timestamp || new Date().toISOString()} | 📸 *Screenshot attached to email notification.*`,
            },
          ],
        },
      ],
    };

    const response = await fetch(config.slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Slack API error (${response.status}): ${responseText}`);
    }

    console.log('[Slack Service] Notification sent successfully.');
    return {
      success: true,
      message: 'Slack notification sent successfully',
    };
  } catch (error: any) {
    console.error('[Slack Service Error]:', error);
    return {
      success: false,
      message: 'Failed to send Slack notification',
      error: error.message || String(error),
    };
  }
}
