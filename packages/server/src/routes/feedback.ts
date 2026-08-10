import { Router, Request, Response } from 'express';
import { FeedbackPayload } from '../types.js';
import { sendSlackNotification } from '../services/slack.js';
import { sendEmailNotification } from '../services/email.js';

const router = Router();

/**
 * POST /api/feedback
 * Accepts visual prototype feedback with comment, base64 screenshot, page URL, and coordinates.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload: FeedbackPayload = req.body;

    // Basic Validation
    if (!payload || !payload.comment || !payload.url) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload. "comment" and "url" fields are required.',
      });
    }

    console.log(`[Feedback Controller] Received feedback for URL: ${payload.url}`);

    // Trigger Slack and Email notifications concurrently
    const [slackResult, emailResult] = await Promise.allSettled([
      sendSlackNotification(payload),
      sendEmailNotification(payload),
    ]);

    const slackStatus = slackResult.status === 'fulfilled' ? slackResult.value : { success: false, error: slackResult.reason };
    const emailStatus = emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason };

    return res.status(200).json({
      success: true,
      message: 'Feedback processed successfully',
      notifications: {
        slack: slackStatus,
        email: emailStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Feedback Controller Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected internal server error occurred while processing feedback.',
      error: err.message || String(err),
    });
  }
});

export default router;
