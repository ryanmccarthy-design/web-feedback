import { Router, Request, Response } from 'express';
import { db } from '../services/db.js';
import { sendSlackNotification } from '../services/slack.js';
import { sendEmailNotification } from '../services/email.js';

const router = Router();

/**
 * GET /api/feedback
 * Fetches all persistent pins/comments for a given project & URL.
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const url = req.query.url as string | undefined;
    const projectId = (req.query.projectId as string) || 'default';
    const allPages = req.query.allPages === 'true';

    const comments = db.getComments(projectId, url, allPages);
    return res.status(200).json({
      success: true,
      comments,
    });
  } catch (err: any) {
    console.error('[GET /api/feedback Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/feedback
 * Creates a new pin/box comment in SQLite and triggers notifications if configured.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (!payload || !payload.comment || !payload.url) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload. "comment" and "url" fields are required.',
      });
    }

    const projectId = payload.projectId || 'default';
    const userId = payload.userId || payload.email || 'usr_anonymous';

    // Ensure user exists in DB
    db.upsertUser({
      id: userId,
      name: payload.userName || payload.email || 'Anonymous',
      email: payload.email || 'anonymous@feedback.dev',
      picture: payload.userPicture || '',
      createdAt: new Date().toISOString(),
    });

    const coordinates = payload.coordinates || { x: 100, y: 100, xPercent: 50, yPercent: 50 };

    // Create persistent comment in SQLite database
    const newComment = db.createComment({
      projectId,
      url: payload.url,
      userId,
      comment: payload.comment,
      image: payload.image,
      coordinates,
    });

    console.log(`[Feedback Controller] Created pin ${newComment.id} in SQLite for project "${projectId}" URL: ${payload.url}`);

    // Check project settings for email notifications
    const project = db.getProject(projectId);
    if (project.emailProvider !== 'none') {
      Promise.allSettled([
        sendSlackNotification(payload),
        sendEmailNotification(payload),
      ]).catch((e) => console.error('[Notification Error]:', e));
    }

    return res.status(201).json({
      success: true,
      message: 'Comment created successfully in SQLite',
      comment: newComment,
    });
  } catch (err: any) {
    console.error('[POST /api/feedback Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/feedback/:id
 * Updates pin position coordinates, status, or comment text.
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comment, coordinates, status } = req.body;

    const updated = db.updateComment(id, { comment, coordinates, status });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Pin not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Pin updated successfully',
      comment: updated,
    });
  } catch (err: any) {
    console.error('[PUT /api/feedback/:id Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/feedback/:id
 * Deletes or resolves a pin comment.
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = db.deleteComment(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Pin not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Pin deleted successfully',
    });
  } catch (err: any) {
    console.error('[DELETE /api/feedback/:id Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/feedback/:id/replies
 * Adds a reply to a pin thread.
 */
router.post('/:id/replies', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, author, userEmail, userPicture, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const effectiveUserId = userId || userEmail || 'usr_anonymous';
    db.upsertUser({
      id: effectiveUserId,
      name: author || userEmail || 'User',
      email: userEmail || 'user@feedback.dev',
      picture: userPicture || '',
      createdAt: new Date().toISOString(),
    });

    const reply = db.addReply(id, effectiveUserId, text);
    if (!reply) {
      return res.status(404).json({ success: false, message: 'Pin not found' });
    }

    return res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      reply,
      comment: db.getCommentById(id),
    });
  } catch (err: any) {
    console.error('[POST /api/feedback/:id/replies Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/feedback/:id/reactions
 * Toggles an emoji reaction on a comment or reply.
 */
router.post('/:id/reactions', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { emoji, userId, author, userEmail, replyId } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const effectiveUserId = userId || userEmail || 'usr_anonymous';
    db.upsertUser({
      id: effectiveUserId,
      name: author || userEmail || 'User',
      email: userEmail || 'user@feedback.dev',
      picture: '',
      createdAt: new Date().toISOString(),
    });

    const success = db.toggleReaction(id, effectiveUserId, emoji, replyId);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Pin or reply not found' });
    }

    return res.status(200).json({
      success: true,
      comment: db.getCommentById(id),
    });
  } catch (err: any) {
    console.error('[POST /api/feedback/:id/reactions Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
