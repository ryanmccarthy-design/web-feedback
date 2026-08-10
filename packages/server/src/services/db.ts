import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EmojiReaction {
  id: string;
  emoji: string;
  author: string;
  createdAt: string;
}

export interface CommentReply {
  id: string;
  commentId: string;
  author: string;
  avatar: string;
  text: string;
  createdAt: string;
  reactions: EmojiReaction[];
}

export interface PinComment {
  id: string;
  url: string;
  author: string;
  avatar: string;
  category: string;
  comment: string;
  image?: string; // Base64 screenshot
  coordinates: {
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
  };
  resolution?: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
  replies: CommentReply[];
  reactions: EmojiReaction[];
}

class DatabaseService {
  private dbPath: string;
  private comments: PinComment[] = [];

  constructor() {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'feedback-db.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileData = fs.readFileSync(this.dbPath, 'utf-8');
        this.comments = JSON.parse(fileData);
      } else {
        this.comments = [];
        this.save();
      }
    } catch (err) {
      console.error('[DB Error] Failed to load feedback database:', err);
      this.comments = [];
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.comments, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB Error] Failed to save feedback database:', err);
    }
  }

  public getComments(url?: string): PinComment[] {
    if (!url) return this.comments;
    // Normalize URL query params or match hostname/path
    const cleanUrl = url.split('#')[0];
    return this.comments.filter((c) => c.url.split('#')[0] === cleanUrl);
  }

  public getCommentById(id: string): PinComment | undefined {
    return this.comments.find((c) => c.id === id);
  }

  public createComment(data: Omit<PinComment, 'id' | 'createdAt' | 'updatedAt' | 'replies' | 'reactions' | 'status'>): PinComment {
    const now = new Date().toISOString();
    const newComment: PinComment = {
      ...data,
      id: 'pin_' + Math.random().toString(36).substring(2, 11),
      status: 'open',
      createdAt: now,
      updatedAt: now,
      replies: [],
      reactions: [],
    };
    this.comments.push(newComment);
    this.save();
    return newComment;
  }

  public updateComment(id: string, updates: Partial<Pick<PinComment, 'comment' | 'coordinates' | 'status' | 'category'>>): PinComment | null {
    const comment = this.getCommentById(id);
    if (!comment) return null;

    if (updates.comment !== undefined) comment.comment = updates.comment;
    if (updates.coordinates !== undefined) comment.coordinates = updates.coordinates;
    if (updates.status !== undefined) comment.status = updates.status;
    if (updates.category !== undefined) comment.category = updates.category;

    comment.updatedAt = new Date().toISOString();
    this.save();
    return comment;
  }

  public deleteComment(id: string): boolean {
    const index = this.comments.findIndex((c) => c.id === id);
    if (index === -1) return false;
    this.comments.splice(index, 1);
    this.save();
    return true;
  }

  public addReply(commentId: string, replyData: { author: string; avatar: string; text: string }): CommentReply | null {
    const comment = this.getCommentById(commentId);
    if (!comment) return null;

    const newReply: CommentReply = {
      id: 'rep_' + Math.random().toString(36).substring(2, 11),
      commentId,
      author: replyData.author || 'Anonymous',
      avatar: replyData.avatar || '👤',
      text: replyData.text,
      createdAt: new Date().toISOString(),
      reactions: [],
    };

    comment.replies.push(newReply);
    comment.updatedAt = new Date().toISOString();
    this.save();
    return newReply;
  }

  public toggleReaction(commentId: string, emoji: string, author: string, replyId?: string): { action: 'added' | 'removed'; reactions: EmojiReaction[] } | null {
    const comment = this.getCommentById(commentId);
    if (!comment) return null;

    let targetReactions: EmojiReaction[];
    if (replyId) {
      const reply = comment.replies.find((r) => r.id === replyId);
      if (!reply) return null;
      targetReactions = reply.reactions;
    } else {
      targetReactions = comment.reactions;
    }

    const existingIndex = targetReactions.findIndex((r) => r.emoji === emoji && r.author === author);
    let action: 'added' | 'removed';

    if (existingIndex !== -1) {
      targetReactions.splice(existingIndex, 1);
      action = 'removed';
    } else {
      targetReactions.push({
        id: 'rx_' + Math.random().toString(36).substring(2, 11),
        emoji,
        author,
        createdAt: new Date().toISOString(),
      });
      action = 'added';
    }

    comment.updatedAt = new Date().toISOString();
    this.save();
    return { action, reactions: targetReactions };
  }
}

export const db = new DatabaseService();
