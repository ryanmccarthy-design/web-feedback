import { Router, Request, Response } from 'express';
import { db } from '../services/db.js';

const router = Router();

/**
 * GET /api/projects/:id/email-config
 * Fetch project email configuration settings.
 */
router.get('/:id/email-config', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = db.getProject(id);
    return res.status(200).json({
      success: true,
      project,
    });
  } catch (err: any) {
    console.error('[GET /api/projects/:id/email-config Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/projects/:id/email-config
 * Update project email service settings (provider: 'none' | 'mailtrap' | 'smtp').
 */
router.post('/:id/email-config', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { emailProvider, emailConfig } = req.body;

    if (!emailProvider || !['none', 'mailtrap', 'smtp'].includes(emailProvider)) {
      return res.status(400).json({ success: false, message: 'Invalid emailProvider. Allowed: "none", "mailtrap", "smtp"' });
    }

    const updated = db.updateProjectEmailConfig(id, emailProvider, emailConfig || {});
    return res.status(200).json({
      success: true,
      message: 'Project email settings updated successfully',
      project: updated,
    });
  } catch (err: any) {
    console.error('[POST /api/projects/:id/email-config Error]:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
