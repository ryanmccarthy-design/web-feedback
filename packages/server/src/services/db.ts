import { sqlite } from '../db/sqlite.js';

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  createdAt: string;
}

export interface EmojiReaction {
  id: string;
  emoji: string;
  userId: string;
  author: string;
  userEmail?: string;
  createdAt: string;
}

export interface CommentReply {
  id: string;
  commentId: string;
  userId: string;
  author: string;
  avatar: string;
  userEmail?: string;
  text: string;
  createdAt: string;
  reactions: EmojiReaction[];
}

export interface PinComment {
  id: string;
  projectId: string;
  url: string;
  userId: string;
  author: string;
  avatar: string;
  userEmail?: string;
  comment: string;
  image?: string;
  coordinates: {
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
    widthPx?: number;
    heightPx?: number;
    widthPercent?: number;
    heightPercent?: number;
  };
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
  replies: CommentReply[];
  reactions: EmojiReaction[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  emailProvider: 'none' | 'mailtrap' | 'smtp';
  emailConfig: Record<string, any>;
  createdAt: string;
}

class DatabaseService {
  // Upsert user
  public upsertUser(user: User): User {
    sqlite.prepare(`
      INSERT INTO users (id, name, email, picture, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, picture=excluded.picture
    `).run(user.id, user.name, user.email, user.picture || '', user.createdAt || new Date().toISOString());
    return user;
  }

  public getUserById(id: string): User | undefined {
    const row = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      picture: row.picture,
      createdAt: row.created_at,
    };
  }

  // Projects
  public getProject(id: string): ProjectConfig {
    const row = sqlite.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) {
      // Auto create project
      sqlite.prepare(`
        INSERT INTO projects (id, name, email_provider, email_config, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, id, 'none', '{}', new Date().toISOString());
      return { id, name: id, emailProvider: 'none', emailConfig: {}, createdAt: new Date().toISOString() };
    }
    return {
      id: row.id,
      name: row.name,
      emailProvider: row.email_provider as any,
      emailConfig: JSON.parse(row.email_config || '{}'),
      createdAt: row.created_at,
    };
  }

  public updateProjectEmailConfig(id: string, emailProvider: 'none' | 'mailtrap' | 'smtp', emailConfig: Record<string, any>): ProjectConfig {
    const jsonConfig = JSON.stringify(emailConfig);
    sqlite.prepare(`
      INSERT INTO projects (id, name, email_provider, email_config, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email_provider=excluded.email_provider, email_config=excluded.email_config
    `).run(id, id, emailProvider, jsonConfig, new Date().toISOString());
    return this.getProject(id);
  }

  // Comments
  public getComments(projectId: string = 'default', url?: string, allPages: boolean = false): PinComment[] {
    let rows: any[];
    if (allPages || !url) {
      rows = sqlite.prepare(`
        SELECT c.*, u.name as user_name, u.email as user_email, u.picture as user_picture
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.project_id = ?
        ORDER BY c.created_at ASC
      `).all(projectId);
    } else {
      const cleanUrl = url.split('#')[0];
      rows = sqlite.prepare(`
        SELECT c.*, u.name as user_name, u.email as user_email, u.picture as user_picture
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.project_id = ? AND c.url LIKE ?
        ORDER BY c.created_at ASC
      `).all(projectId, `${cleanUrl}%`);
    }

    return rows.map((row) => this.hydrateComment(row));
  }

  public getCommentById(id: string): PinComment | undefined {
    const row = sqlite.prepare(`
      SELECT c.*, u.name as user_name, u.email as user_email, u.picture as user_picture
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(id) as any;

    if (!row) return undefined;
    return this.hydrateComment(row);
  }

  private hydrateComment(row: any): PinComment {
    const repliesRows = sqlite.prepare(`
      SELECT r.*, u.name as user_name, u.email as user_email, u.picture as user_picture
      FROM replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.comment_id = ?
      ORDER BY r.created_at ASC
    `).all(row.id) as any[];

    const reactionsRows = sqlite.prepare(`
      SELECT rx.*, u.name as user_name, u.email as user_email
      FROM reactions rx
      LEFT JOIN users u ON rx.user_id = u.id
      WHERE rx.comment_id = ?
    `).all(row.id) as any[];

    const replies: CommentReply[] = repliesRows.map((r) => {
      const replyReactions = reactionsRows
        .filter((rx) => rx.reply_id === r.id)
        .map((rx) => ({
          id: rx.id,
          emoji: rx.emoji,
          userId: rx.user_id,
          author: rx.user_name || 'User',
          userEmail: rx.user_email,
          createdAt: rx.created_at,
        }));

      return {
        id: r.id,
        commentId: r.comment_id,
        userId: r.user_id,
        author: r.user_name || 'User',
        avatar: r.user_picture || (r.user_email || 'U')[0].toUpperCase(),
        userEmail: r.user_email,
        text: r.text,
        createdAt: r.created_at,
        reactions: replyReactions,
      };
    });

    const commentReactions: EmojiReaction[] = reactionsRows
      .filter((rx) => !rx.reply_id)
      .map((rx) => ({
        id: rx.id,
        emoji: rx.emoji,
        userId: rx.user_id,
        author: rx.user_name || 'User',
        userEmail: rx.user_email,
        createdAt: rx.created_at,
      }));

    return {
      id: row.id,
      projectId: row.project_id,
      url: row.url,
      userId: row.user_id,
      author: row.user_name || 'Anonymous',
      avatar: row.user_picture || (row.user_email || 'A')[0].toUpperCase(),
      userEmail: row.user_email,
      comment: row.comment,
      image: row.image,
      coordinates: {
        x: (row.x_percent / 100) * 1200,
        y: (row.y_percent / 100) * 800,
        xPercent: row.x_percent,
        yPercent: row.y_percent,
        widthPercent: row.width_percent,
        heightPercent: row.height_percent,
      },
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      replies,
      reactions: commentReactions,
    };
  }

  public createComment(data: {
    projectId?: string;
    url: string;
    userId: string;
    comment: string;
    image?: string;
    coordinates: {
      xPercent: number;
      yPercent: number;
      widthPercent?: number;
      heightPercent?: number;
    };
  }): PinComment {
    const id = 'pin_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const projectId = data.projectId || 'default';

    sqlite.prepare(`
      INSERT INTO comments (id, project_id, url, user_id, comment, image, x_percent, y_percent, width_percent, height_percent, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      id,
      projectId,
      data.url,
      data.userId,
      data.comment,
      data.image || null,
      data.coordinates.xPercent,
      data.coordinates.yPercent,
      data.coordinates.widthPercent || null,
      data.coordinates.heightPercent || null,
      now,
      now
    );

    return this.getCommentById(id)!;
  }

  public updateComment(id: string, updates: { comment?: string; status?: 'open' | 'resolved'; coordinates?: any }): PinComment | null {
    const comment = this.getCommentById(id);
    if (!comment) return null;

    const now = new Date().toISOString();

    if (updates.coordinates) {
      sqlite.prepare(`
        UPDATE comments
        SET x_percent = ?, y_percent = ?, width_percent = ?, height_percent = ?, updated_at = ?
        WHERE id = ?
      `).run(
        updates.coordinates.xPercent,
        updates.coordinates.yPercent,
        updates.coordinates.widthPercent || null,
        updates.coordinates.heightPercent || null,
        now,
        id
      );
    }

    if (updates.comment !== undefined) {
      sqlite.prepare('UPDATE comments SET comment = ?, updated_at = ? WHERE id = ?').run(updates.comment, now, id);
    }

    if (updates.status !== undefined) {
      sqlite.prepare('UPDATE comments SET status = ?, updated_at = ? WHERE id = ?').run(updates.status, now, id);
    }

    return this.getCommentById(id)!;
  }

  public deleteComment(id: string): boolean {
    const res = sqlite.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public addReply(commentId: string, userId: string, text: string): CommentReply | null {
    const comment = this.getCommentById(commentId);
    if (!comment) return null;

    const id = 'rep_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();

    sqlite.prepare(`
      INSERT INTO replies (id, comment_id, user_id, text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, commentId, userId, text, now);

    sqlite.prepare('UPDATE comments SET updated_at = ? WHERE id = ?').run(now, commentId);

    const user = this.getUserById(userId);
    return {
      id,
      commentId,
      userId,
      author: user?.name || 'User',
      avatar: user?.picture || (user?.email || 'U')[0].toUpperCase(),
      userEmail: user?.email,
      text,
      createdAt: now,
      reactions: [],
    };
  }

  public toggleReaction(commentId: string, userId: string, emoji: string, replyId?: string): boolean {
    const comment = this.getCommentById(commentId);
    if (!comment) return false;

    let existing: any;
    if (replyId) {
      existing = sqlite.prepare('SELECT id FROM reactions WHERE comment_id = ? AND reply_id = ? AND user_id = ? AND emoji = ?').get(commentId, replyId, userId, emoji);
    } else {
      existing = sqlite.prepare('SELECT id FROM reactions WHERE comment_id = ? AND reply_id IS NULL AND user_id = ? AND emoji = ?').get(commentId, userId, emoji);
    }

    if (existing) {
      sqlite.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    } else {
      const id = 'rx_' + Math.random().toString(36).substring(2, 11);
      sqlite.prepare(`
        INSERT INTO reactions (id, comment_id, reply_id, user_id, emoji, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, commentId, replyId || null, userId, emoji, new Date().toISOString());
    }

    return true;
  }
}

export const db = new DatabaseService();
