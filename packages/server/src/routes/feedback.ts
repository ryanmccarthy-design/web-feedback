import { Router, Request, Response } from 'express';
import { db } from '../services/db.js';
import { sendSlackNotification } from '../services/slack.js';
import { sendEmailNotification } from '../services/email.js';

const router = Router();

/**
 * GET /api/feedback
 * Fetches all persistent pins/comments for a given URL.
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const url = req.query.url as string | undefined;
    const comments = db.getComments(url);
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
 * Creates a new pin comment and triggers Slack/Mailtrap notifications.
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

    // Default coordinates if omitted
    const coordinates = payload.coordinates || { x: 100, y: 100, xPercent: 50, yPercent: 50 };

    // Create persistent comment in database
    const newComment = db.createComment({
      url: payload.url,
      author: payload.email || 'Anonymous',
      avatar: (payload.email || 'A')[0].toUpperCase(),
      category: payload.category || 'General',
      comment: payload.comment,
      image: payload.image,
      coordinates,
      resolution: payload.resolution,
    });

    console.log(`[Feedback Controller] Created pin ${newComment.id} for URL: ${payload.url}`);

    // Trigger Slack and Email notifications concurrently in background
    Promise.allSettled([
      sendSlackNotification(payload),
      sendEmailNotification(payload),
    ]).catch((e) => console.error('[Notification Error]:', e));

    return res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      comment: newComment,
    });
  } catch (err: any) {
    console.error('[POST /api/feedback Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/feedback/:id
 * Updates pin position coordinates or comment text.
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comment, coordinates, category, status } = req.body;

    const updated = db.updateComment(id, { comment, coordinates, category, status });
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
    const { author, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const reply = db.addReply(id, {
      author: author || 'Anonymous',
      avatar: (author || 'A')[0].toUpperCase(),
      text,
    });

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
    const { emoji, author, replyId } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const result = db.toggleReaction(id, emoji, author || 'Anonymous', replyId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Pin or reply not found' });
    }

    return res.status(200).json({
      success: true,
      action: result.action,
      reactions: result.reactions,
      comment: db.getCommentById(id),
    });
  } catch (err: any) {
    console.error('[POST /api/feedback/:id/reactions Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
