import html2canvas from 'html2canvas';

export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface EmojiReaction {
  id: string;
  emoji: string;
  author: string;
  userEmail?: string;
  createdAt: string;
}

export interface CommentReply {
  id: string;
  commentId: string;
  author: string;
  avatar: string;
  userEmail?: string;
  text: string;
  createdAt: string;
  reactions: EmojiReaction[];
}

export interface PinComment {
  id: string;
  url: string;
  author: string;
  avatar: string;
  userEmail?: string;
  category: string;
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

export class PrototypeFeedback extends HTMLElement {
  private shadow: ShadowRoot;
  private isCommentMode: boolean = false;
  private isSidebarOpen: boolean = false;
  private currentUser: GoogleUser | null = null;
  private comments: PinComment[] = [];
  private overlayBackdrop: HTMLElement | null = null;
  private selectionBoxEl: HTMLElement | null = null;
  private pinElementsMap: Map<string, HTMLElement> = new Map();
  private sidebarFilter: 'open' | 'resolved' | 'all' = 'open';
  private sidebarPageFilter: 'current' | 'all' = 'current';

  static get observedAttributes() {
    return ['api-url', 'button-text', 'position', 'google-client-id'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.setAttribute('data-html2canvas-ignore', 'true');
    this.loadUserSession();
    this.render();
    this.setupEventListeners();
    this.fetchComments();

    // Keydown shortcut 'C' for comment mode, 'V' for sidebar
    window.addEventListener('keydown', this.handleGlobalKeyDown);

    // Initialize Google Identity Services Script if Google Client ID is configured
    this.loadGoogleScript();
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.removeOverlay();
    this.removeAllPagePins();
    this.closeSidebar();
  }

  private get apiUrl(): string {
    return this.getAttribute('api-url') || '/api/feedback';
  }

  private get buttonText(): string {
    return this.getAttribute('button-text') || 'Add Comment';
  }

  private get position(): string {
    return this.getAttribute('position') || 'bottom-right';
  }

  private get googleClientId(): string {
    return this.getAttribute('google-client-id') || '';
  }

  private loadUserSession() {
    try {
      const stored = localStorage.getItem('pf_google_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load Google user session:', e);
    }
  }

  private saveUserSession(user: GoogleUser) {
    this.currentUser = user;
    localStorage.setItem('pf_google_user', JSON.stringify(user));
    this.render();
    this.setupEventListeners();
  }

  private clearUserSession() {
    this.currentUser = null;
    localStorage.removeItem('pf_google_user');
    this.render();
    this.setupEventListeners();
  }

  private loadGoogleScript() {
    if (document.getElementById('google-gsi-script')) return;

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (this.googleClientId && (window as any).google) {
        (window as any).google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: this.handleGoogleCredentialResponse.bind(this),
        });
      }
    };
    document.head.appendChild(script);
  }

  private handleGoogleCredentialResponse(response: any) {
    try {
      // Decode JWT payload
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);

      const user: GoogleUser = {
        id: payload.sub,
        name: payload.name || payload.email,
        email: payload.email,
        picture: payload.picture,
      };

      this.saveUserSession(user);
    } catch (err) {
      console.error('Error parsing Google credential response:', err);
    }
  }

  private promptGoogleSignIn() {
    if ((window as any).google && this.googleClientId) {
      (window as any).google.accounts.id.prompt();
    } else {
      // Fallback interactive login modal if no client-id set
      this.showMockGoogleLoginModal();
    }
  }

  private showMockGoogleLoginModal() {
    const existing = this.shadow.getElementById('pf-auth-modal');
    if (existing) return;

    const modal = document.createElement('div');
    modal.id = 'pf-auth-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
      <div style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); border-radius: 16px; padding: 28px; width: 360px; color: white; box-shadow: 0 25px 50px rgba(0,0,0,0.5); text-align: center; display: flex; flex-direction: column; gap: 16px;">
        <div style="font-size: 28px;">🔐</div>
        <h3 style="font-size: 18px; font-weight: 700;">Sign in to Leave Feedback</h3>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">Please log in with Google to post comments, drag pins, and reply to prototype annotations.</p>

        <input type="email" id="pf-login-email" placeholder="alex.designer@company.com" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: white; font-size: 13px; outline: none;" />
        <input type="text" id="pf-login-name" placeholder="Alex Designer" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: white; font-size: 13px; outline: none;" />

        <button id="pf-login-btn" style="padding: 12px; background: #6366f1; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>🌐</span> Sign In with Google
        </button>
        <button id="pf-login-cancel" style="background: none; border: none; color: #94a3b8; font-size: 12px; cursor: pointer;">Cancel</button>
      </div>
    `;

    this.shadow.appendChild(modal);

    modal.querySelector('#pf-login-cancel')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#pf-login-btn')?.addEventListener('click', () => {
      const email = (modal.querySelector('#pf-login-email') as HTMLInputElement)?.value.trim() || 'user@example.com';
      const name = (modal.querySelector('#pf-login-name') as HTMLInputElement)?.value.trim() || email.split('@')[0];

      const user: GoogleUser = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        name,
        email,
        picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
      };

      this.saveUserSession(user);
      modal.remove();
    });
  }

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

    if (e.key.toLowerCase() === 'c') {
      if (!this.currentUser) {
        this.promptGoogleSignIn();
        return;
      }
      this.toggleCommentMode();
    } else if (e.key.toLowerCase() === 'v') {
      this.toggleSidebar();
    } else if (e.key === 'Escape') {
      if (this.isCommentMode) this.disableCommentMode();
      this.closeActivePopover();
    }
  };

  private render() {
    const isLeft = this.position === 'bottom-left';

    const userHtml = this.currentUser
      ? `
        <div style="display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; background: rgba(255,255,255,0.1); border-radius: 9999px; margin-right: 4px;">
          <img src="${this.currentUser.picture}" alt="${this.currentUser.name}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" />
          <span style="font-size: 12px; font-weight: 600;">${this.currentUser.name.split(' ')[0]}</span>
          <button id="pf-logout-btn" title="Sign Out" style="background: none; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 2px;">✕</button>
        </div>
      `
      : `
        <button id="pf-auth-btn" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; color: white; font-size: 12px; font-weight: 600; cursor: pointer; margin-right: 4px;">
          <span>🌐</span> Sign In
        </button>
      `;

    this.shadow.innerHTML = `
      <style>
        :host {
          --pf-primary: #6366f1;
          --pf-primary-hover: #4f46e5;
          --pf-bg-glass: rgba(15, 23, 42, 0.92);
          --pf-border-glass: rgba(255, 255, 255, 0.15);
          --pf-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

          font-family: var(--pf-font);
          position: fixed;
          z-index: 2147483640;
          ${isLeft ? 'left: 24px;' : 'right: 24px;'}
          bottom: 24px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .pf-toolbar-group {
          display: flex;
          align-items: center;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 6px 8px;
          border-radius: 9999px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
          color: white;
          gap: 6px;
        }

        .pf-toolbar-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #ffffff;
          border: none;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .pf-toolbar-btn:hover { transform: translateY(-1px); }

        .pf-toolbar-btn.active {
          background: #ef4444;
        }

        .pf-secondary-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pf-secondary-btn:hover { background: rgba(255, 255, 255, 0.16); }

        .pf-kbd {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 5px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
      </style>

      <div class="pf-toolbar-group">
        ${userHtml}

        <button class="pf-toolbar-btn" id="pf-toggle-btn">
          <span id="pf-btn-icon">💬</span>
          <span id="pf-btn-label">${this.buttonText}</span>
          <span class="pf-kbd">C</span>
        </button>

        <button class="pf-secondary-btn" id="pf-sidebar-btn" title="Toggle Global Site Annotations">
          <span>📋</span>
          <span>All Comments</span>
          <span class="pf-kbd">V</span>
        </button>
      </div>
    `;
  }

  private setupEventListeners() {
    this.shadow.getElementById('pf-auth-btn')?.addEventListener('click', () => this.promptGoogleSignIn());
    this.shadow.getElementById('pf-logout-btn')?.addEventListener('click', () => this.clearUserSession());

    this.shadow.getElementById('pf-toggle-btn')?.addEventListener('click', () => {
      if (!this.currentUser) {
        this.promptGoogleSignIn();
        return;
      }
      this.toggleCommentMode();
    });

    this.shadow.getElementById('pf-sidebar-btn')?.addEventListener('click', () => {
      this.toggleSidebar();
    });
  }

  private toggleCommentMode() {
    if (this.isCommentMode) {
      this.disableCommentMode();
    } else {
      this.enableCommentMode();
    }
  }

  private enableCommentMode() {
    this.isCommentMode = true;
    const toggleBtn = this.shadow.getElementById('pf-toggle-btn');
    const btnIcon = this.shadow.getElementById('pf-btn-icon');
    const btnLabel = this.shadow.getElementById('pf-btn-label');

    toggleBtn?.classList.add('active');
    if (btnIcon) btnIcon.textContent = '✕';
    if (btnLabel) btnLabel.textContent = 'Cancel';

    this.createOverlayBackdrop();
  }

  private disableCommentMode() {
    this.isCommentMode = false;
    const toggleBtn = this.shadow.getElementById('pf-toggle-btn');
    const btnIcon = this.shadow.getElementById('pf-btn-icon');
    const btnLabel = this.shadow.getElementById('pf-btn-label');

    toggleBtn?.classList.remove('active');
    if (btnIcon) btnIcon.textContent = '💬';
    if (btnLabel) btnLabel.textContent = this.buttonText;

    this.removeOverlay();
  }

  private createOverlayBackdrop() {
    this.removeOverlay();

    const overlay = document.createElement('div');
    overlay.className = 'pf-overlay-backdrop';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483630;
      cursor: crosshair;
      background: rgba(99, 102, 241, 0.05);
      outline: 2px dashed #6366f1;
      outline-offset: -2px;
    `;

    const tip = document.createElement('div');
    tip.textContent = '🎯 Click to place a pin, or Click & Drag to highlight a box area';
    tip.style.cssText = `
      position: fixed; top: 20px; left: 50%;
      transform: translateX(-50%);
      background: #6366f1; color: #ffffff;
      padding: 8px 18px; border-radius: 9999px;
      font-family: -apple-system, sans-serif;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      pointer-events: none; z-index: 2147483632;
    `;

    overlay.appendChild(tip);

    // Support Click & Drag Rectangle Selection!
    let isMouseDown = false;
    let startX = 0;
    let startY = 0;

    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;

      if (!this.selectionBoxEl) {
        this.selectionBoxEl = document.createElement('div');
        this.selectionBoxEl.style.cssText = `
          position: fixed;
          border: 2px dashed #6366f1;
          background: rgba(99, 102, 241, 0.2);
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
          z-index: 2147483631;
          pointer-events: none;
          display: none;
        `;
        document.body.appendChild(this.selectionBoxEl);
      }
    });

    overlay.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isMouseDown || !this.selectionBoxEl) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width > 5 || height > 5) {
        this.selectionBoxEl.style.display = 'block';
        this.selectionBoxEl.style.left = `${left}px`;
        this.selectionBoxEl.style.top = `${top}px`;
        this.selectionBoxEl.style.width = `${width}px`;
        this.selectionBoxEl.style.height = `${height}px`;
      }
    });

    overlay.addEventListener('mouseup', (e: MouseEvent) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      const endX = e.clientX;
      const endY = e.clientY;

      const widthPx = Math.abs(endX - startX);
      const heightPx = Math.abs(endY - startY);

      if (this.selectionBoxEl) {
        this.selectionBoxEl.style.display = 'none';
      }

      this.disableCommentMode();

      if (widthPx > 15 && heightPx > 15) {
        // Dragged Rectangle Box Target
        const leftPx = Math.min(startX, endX) + window.scrollX;
        const topPx = Math.min(startY, endY) + window.scrollY;

        const xPercent = Number((((Math.min(startX, endX)) / window.innerWidth) * 100).toFixed(2));
        const yPercent = Number((((Math.min(startY, endY)) / window.innerHeight) * 100).toFixed(2));
        const widthPercent = Number(((widthPx / window.innerWidth) * 100).toFixed(2));
        const heightPercent = Number(((heightPx / window.innerHeight) * 100).toFixed(2));

        const coords = { x: leftPx, y: topPx, xPercent, yPercent, widthPx, heightPx, widthPercent, heightPercent };
        this.renderDraftPopover(leftPx, topPx, coords);
      } else {
        // Single Point Click Pin Target
        const x = endX + window.scrollX;
        const y = endY + window.scrollY;
        const xPercent = Number(((endX / window.innerWidth) * 100).toFixed(2));
        const yPercent = Number(((endY / window.innerHeight) * 100).toFixed(2));

        const coords = { x, y, xPercent, yPercent };
        this.renderDraftPopover(x, y, coords);
      }
    });

    document.body.appendChild(overlay);
    this.overlayBackdrop = overlay;
  }

  private removeOverlay() {
    if (this.overlayBackdrop && this.overlayBackdrop.parentNode) {
      this.overlayBackdrop.parentNode.removeChild(this.overlayBackdrop);
      this.overlayBackdrop = null;
    }
    if (this.selectionBoxEl && this.selectionBoxEl.parentNode) {
      this.selectionBoxEl.parentNode.removeChild(this.selectionBoxEl);
      this.selectionBoxEl = null;
    }
  }

  private async fetchComments() {
    try {
      const res = await fetch(`${this.apiUrl}?allPages=true`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.comments)) {
        this.comments = data.comments;
        this.renderAllPagePins();
        if (this.isSidebarOpen) this.renderSidebarContent();
      }
    } catch (err) {
      console.error('[PrototypeFeedback] Error fetching comments:', err);
    }
  }

  private removeAllPagePins() {
    this.pinElementsMap.forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    this.pinElementsMap.clear();
    this.closeActivePopover();
  }

  private renderAllPagePins() {
    this.removeAllPagePins();

    const currentCleanUrl = window.location.href.split('#')[0];

    this.comments.forEach((comment, index) => {
      if (comment.status === 'resolved') return;
      if (comment.url.split('#')[0] !== currentCleanUrl) return;

      const pinNum = index + 1;
      const pin = document.createElement('div');
      pin.className = 'pf-page-pin';
      pin.setAttribute('data-pin-id', comment.id);
      pin.setAttribute('data-html2canvas-ignore', 'false');

      const leftPx = (comment.coordinates.xPercent / 100) * window.innerWidth + window.scrollX;
      const topPx = (comment.coordinates.yPercent / 100) * window.innerHeight + window.scrollY;

      const isRectangleBox = comment.coordinates.widthPercent && comment.coordinates.widthPercent > 0.5;

      if (isRectangleBox) {
        // Render Rectangle Target Highlight Box!
        const boxWidthPx = (comment.coordinates.widthPercent! / 100) * window.innerWidth;
        const boxHeightPx = (comment.coordinates.heightPercent! / 100) * window.innerHeight;

        pin.style.cssText = `
          position: absolute;
          left: ${leftPx}px;
          top: ${topPx}px;
          width: ${boxWidthPx}px;
          height: ${boxHeightPx}px;
          border: 2px solid #6366f1;
          background: rgba(99, 102, 241, 0.15);
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
          z-index: 2147483620;
          cursor: pointer;
        `;

        // Anchor pin badge on top left corner
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: absolute;
          top: -12px; left: -12px;
          width: 26px; height: 26px;
          background: #6366f1; color: white;
          border: 2px solid white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        `;
        badge.textContent = String(pinNum);
        pin.appendChild(badge);
      } else {
        // Render Single Point Pin Marker
        pin.style.cssText = `
          position: absolute;
          left: ${leftPx}px; top: ${topPx}px;
          transform: translate(-50%, -50%);
          width: 32px; height: 32px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #ffffff; border: 2px solid #ffffff;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg) translate(-10px, -10px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.3);
          z-index: 2147483620;
          cursor: grab;
          display: flex; align-items: center; justify-content: center;
        `;

        const numBadge = document.createElement('span');
        numBadge.textContent = String(pinNum);
        numBadge.style.cssText = `
          transform: rotate(45deg);
          font-family: -apple-system, sans-serif;
          font-size: 12px; font-weight: 700; user-select: none;
        `;
        pin.appendChild(numBadge);
      }

      // Draggable Pins
      this.makePinDraggable(pin, comment);

      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCommentPopover(comment);
      });

      document.body.appendChild(pin);
      this.pinElementsMap.set(comment.id, pin);
    });
  }

  private makePinDraggable(pinEl: HTMLElement, comment: PinComment) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      e.stopPropagation();

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const currentLeft = parseFloat(pinEl.style.left) || 0;
        const currentTop = parseFloat(pinEl.style.top) || 0;

        pinEl.style.left = `${currentLeft + dx}px`;
        pinEl.style.top = `${currentTop + dy}px`;

        startX = moveEvent.clientX;
        startY = moveEvent.clientY;
      };

      const onMouseUp = async () => {
        if (!isDragging) return;
        isDragging = false;

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const currentLeft = parseFloat(pinEl.style.left) || 0;
        const currentTop = parseFloat(pinEl.style.top) || 0;

        const xPercent = Number((((currentLeft - window.scrollX) / window.innerWidth) * 100).toFixed(2));
        const yPercent = Number((((currentTop - window.scrollY) / window.innerHeight) * 100).toFixed(2));

        comment.coordinates.x = currentLeft;
        comment.coordinates.y = currentTop;
        comment.coordinates.xPercent = xPercent;
        comment.coordinates.yPercent = yPercent;

        try {
          await fetch(`${this.apiUrl}/${comment.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: comment.coordinates }),
          });
        } catch (err) {
          console.error('Error updating pin position:', err);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    pinEl.addEventListener('mousedown', onMouseDown);
  }

  private closeActivePopover() {
    const existing = document.getElementById('pf-anchored-popover');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  private renderDraftPopover(x: number, y: number, coords: any) {
    this.closeActivePopover();

    const popover = document.createElement('div');
    popover.id = 'pf-anchored-popover';
    popover.setAttribute('data-html2canvas-ignore', 'true');

    const popoverLeft = Math.min(x + 20, window.innerWidth + window.scrollX - 340);
    const popoverTop = Math.min(y - 10, window.innerHeight + window.scrollY - 300);

    popover.style.cssText = `
      position: absolute;
      left: ${popoverLeft}px; top: ${popoverTop}px;
      width: 320px;
      background: #0f172a; color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      z-index: 2147483645;
      font-family: -apple-system, sans-serif;
      padding: 16px; display: flex; flex-direction: column; gap: 12px;
      animation: pf-pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const userEmail = this.currentUser?.email || '';
    const userName = this.currentUser?.name || '';
    const userPic = this.currentUser?.picture || '';

    popover.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${userPic ? `<img src="${userPic}" style="width: 20px; height: 20px; border-radius: 50%;" />` : '💬'}
          <span style="font-size: 12px; font-weight: 700; color: #a5b4fc;">New Comment</span>
        </div>
        <button id="pf-draft-close" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">&times;</button>
      </div>

      <textarea id="pf-draft-text" placeholder="Type a comment or note..." style="width: 100%; height: 90px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px; color: white; font-family: inherit; font-size: 13px; outline: none; resize: none;"></textarea>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="pf-draft-cancel" style="padding: 8px 14px; background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer;">Cancel</button>
        <button id="pf-draft-post" style="padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">Post Comment</button>
      </div>
    `;

    document.body.appendChild(popover);

    popover.querySelector('#pf-draft-close')?.addEventListener('click', () => this.closeActivePopover());
    popover.querySelector('#pf-draft-cancel')?.addEventListener('click', () => this.closeActivePopover());

    popover.querySelector('#pf-draft-post')?.addEventListener('click', async () => {
      const text = (popover.querySelector('#pf-draft-text') as HTMLTextAreaElement)?.value.trim();
      const category = 'Comment';

      if (!text) return;

      let base64Image = '';
      try {
        popover.style.display = 'none';
        const canvas = await html2canvas(document.body, {
          useCORS: true, logging: false,
          ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore') && el.getAttribute('data-html2canvas-ignore') === 'true',
        });
        base64Image = canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Screenshot capture error:', err);
      }

      const payload = {
        comment: text,
        category,
        email: userEmail,
        userName,
        userPicture: userPic,
        image: base64Image,
        url: window.location.href,
        coordinates: coords,
        resolution: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
      };

      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          this.closeActivePopover();
          this.fetchComments();
        }
      } catch (err) {
        console.error('Error posting comment:', err);
      }
    });

    setTimeout(() => {
      (popover.querySelector('#pf-draft-text') as HTMLTextAreaElement)?.focus();
    }, 100);
  }

  private openCommentPopover(comment: PinComment) {
    this.closeActivePopover();

    const pinEl = this.pinElementsMap.get(comment.id);
    const x = pinEl ? parseFloat(pinEl.style.left) || comment.coordinates.x : comment.coordinates.x;
    const y = pinEl ? parseFloat(pinEl.style.top) || comment.coordinates.y : comment.coordinates.y;

    const popover = document.createElement('div');
    popover.id = 'pf-anchored-popover';
    popover.setAttribute('data-html2canvas-ignore', 'true');

    const popoverLeft = Math.min(x + 20, window.innerWidth + window.scrollX - 360);
    const popoverTop = Math.min(y - 10, window.innerHeight + window.scrollY - 420);

    popover.style.cssText = `
      position: absolute;
      left: ${popoverLeft}px; top: ${popoverTop}px;
      width: 340px; max-height: 480px;
      background: #0f172a; color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 14px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      z-index: 2147483645;
      font-family: -apple-system, sans-serif;
      display: flex; flex-direction: column; overflow: hidden;
      animation: pf-pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const repliesHtml = comment.replies
      .map(
        (r) => `
        <div style="background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${r.avatar.startsWith('http') ? `<img src="${r.avatar}" style="width: 16px; height: 16px; border-radius: 50%;" />` : ''}
              <span style="font-size: 11px; font-weight: 700; color: #a5b4fc;">${r.author}</span>
            </div>
            <span style="font-size: 10px; color: #64748b;">${new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style="font-size: 12px; color: #e2e8f0; white-space: pre-wrap;">${r.text}</div>
        </div>
      `
      )
      .join('');

    const emojis = ['👍', '❤️', '🚀', '🎉', '👀'];
    const reactionsCountMap: Record<string, number> = {};
    comment.reactions.forEach((r) => {
      reactionsCountMap[r.emoji] = (reactionsCountMap[r.emoji] || 0) + 1;
    });

    const reactionsPillsHtml = Object.entries(reactionsCountMap)
      .map(
        ([emoji, count]) => `
        <span class="pf-rx-pill" data-emoji="${emoji}" style="padding: 2px 8px; background: rgba(99,102,241,0.2); border: 1px solid #6366f1; border-radius: 12px; font-size: 11px; cursor: pointer; color: #ffffff;">
          ${emoji} ${count}
        </span>
      `
      )
      .join('');

    const emojiBarHtml = emojis
      .map(
        (e) => `
        <button class="pf-emoji-btn" data-emoji="${e}" style="background: none; border: none; font-size: 16px; cursor: pointer; padding: 2px 4px; border-radius: 4px;">
          ${e}
        </button>
      `
      )
      .join('');

    popover.innerHTML = `
      <div style="padding: 12px 16px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${comment.avatar.startsWith('http') ? `<img src="${comment.avatar}" style="width: 18px; height: 18px; border-radius: 50%;" />` : ''}
          <span style="font-size: 12px; font-weight: 600; color: #a5b4fc;">${comment.author}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="pf-resolve-btn" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">Resolve</button>
          <button id="pf-card-close" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
      </div>

      <div style="padding: 16px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
        <div style="font-size: 13px; line-height: 1.5; color: #f8fafc; white-space: pre-wrap;" id="pf-comment-text">${comment.comment}</div>

        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;" id="pf-rx-container">
          ${reactionsPillsHtml}
        </div>

        <div style="display: flex; gap: 6px; padding: 4px 8px; background: rgba(0,0,0,0.3); border-radius: 8px; width: fit-content;">
          ${emojiBarHtml}
        </div>

        <div id="pf-replies-list" style="margin-top: 8px;">
          ${repliesHtml}
        </div>
      </div>

      <div style="padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); display: flex; gap: 8px; align-items: center;">
        <input type="text" id="pf-reply-input" placeholder="Reply to thread..." style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; color: white; font-size: 12px; outline: none;" />
        <button id="pf-reply-send" style="padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">Send</button>
      </div>
    `;

    document.body.appendChild(popover);

    popover.querySelector('#pf-card-close')?.addEventListener('click', () => this.closeActivePopover());

    popover.querySelector('#pf-resolve-btn')?.addEventListener('click', async () => {
      try {
        await fetch(`${this.apiUrl}/${comment.id}`, { method: 'DELETE' });
        this.closeActivePopover();
        this.fetchComments();
      } catch (err) {
        console.error('Error resolving comment:', err);
      }
    });

    popover.querySelectorAll('.pf-emoji-btn, .pf-rx-pill').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const emoji = btn.getAttribute('data-emoji');
        if (!emoji) return;

        try {
          await fetch(`${this.apiUrl}/${comment.id}/reactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji, author: this.currentUser?.name || 'User', userEmail: this.currentUser?.email }),
          });
          this.fetchComments();
          setTimeout(() => {
            const updated = this.comments.find((c) => c.id === comment.id);
            if (updated) this.openCommentPopover(updated);
          }, 100);
        } catch (err) {
          console.error('Error toggling reaction:', err);
        }
      });
    });

    const replyInput = popover.querySelector('#pf-reply-input') as HTMLInputElement;
    const sendReplyBtn = popover.querySelector('#pf-reply-send');

    const handleSendReply = async () => {
      const text = replyInput?.value.trim();
      if (!text) return;

      try {
        await fetch(`${this.apiUrl}/${comment.id}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: this.currentUser?.name || 'User',
            avatar: this.currentUser?.picture || '👤',
            userEmail: this.currentUser?.email,
            text,
          }),
        });
        replyInput.value = '';
        await this.fetchComments();
        const updated = this.comments.find((c) => c.id === comment.id);
        if (updated) this.openCommentPopover(updated);
      } catch (err) {
        console.error('Error sending reply:', err);
      }
    };

    sendReplyBtn?.addEventListener('click', handleSendReply);
    replyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendReply();
    });
  }

  // ---------------------------------------------------------------------------
  // Requirement 3: Global All Annotations Side Panel (Pushes Body, No Overlay)
  // ---------------------------------------------------------------------------

  private toggleSidebar() {
    if (this.isSidebarOpen) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  private openSidebar() {
    this.isSidebarOpen = true;

    // PUSH BODY MECHANISM: Adjust body margin-right so webpage content shifts left and is NEVER covered!
    document.body.style.transition = 'margin-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.style.marginRight = '340px';

    this.renderSidebarContainer();
    this.renderSidebarContent();
  }

  private closeSidebar() {
    this.isSidebarOpen = false;

    // Reset body margin-right
    document.body.style.marginRight = '0px';

    const sidebar = this.shadow.getElementById('pf-global-sidebar');
    if (sidebar && sidebar.parentNode) {
      sidebar.parentNode.removeChild(sidebar);
    }
  }

  private renderSidebarContainer() {
    const existing = this.shadow.getElementById('pf-global-sidebar');
    if (existing) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'pf-global-sidebar';
    sidebar.style.cssText = `
      position: fixed;
      top: 0; right: 0;
      width: 340px; height: 100vh;
      background: #0f172a;
      border-left: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);
      z-index: 2147483642;
      display: flex; flex-direction: column;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: pf-slide-left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    sidebar.innerHTML = `
      <div style="padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📋</span>
          <span style="font-size: 15px; font-weight: 700; color: #a5b4fc;">All Annotations</span>
        </div>
        <button id="pf-sb-close" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">&times;</button>
      </div>

      <!-- Filters Header -->
      <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; gap: 6px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 8px;">
          <button class="pf-sb-tab active" data-filter="open" style="flex: 1; padding: 6px; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; background: #6366f1; color: white; cursor: pointer;">Open</button>
          <button class="pf-sb-tab" data-filter="resolved" style="flex: 1; padding: 6px; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; background: transparent; color: #94a3b8; cursor: pointer;">Resolved</button>
          <button class="pf-sb-tab" data-filter="all" style="flex: 1; padding: 6px; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; background: transparent; color: #94a3b8; cursor: pointer;">All</button>
        </div>

        <div style="display: flex; gap: 6px; align-items: center; font-size: 11px; color: #94a3b8;">
          <span>Scope:</span>
          <button id="pf-page-toggle" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 8px; color: white; font-size: 11px; cursor: pointer;">
            Current Page
          </button>
        </div>
      </div>

      <!-- Comments List -->
      <div id="pf-sb-list" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;"></div>
    `;

    this.shadow.appendChild(sidebar);

    sidebar.querySelector('#pf-sb-close')?.addEventListener('click', () => this.closeSidebar());

    // Filter Tabs
    sidebar.querySelectorAll('.pf-sb-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        sidebar.querySelectorAll('.pf-sb-tab').forEach((t) => {
          (t as HTMLElement).style.background = 'transparent';
          (t as HTMLElement).style.color = '#94a3b8';
        });
        (tab as HTMLElement).style.background = '#6366f1';
        (tab as HTMLElement).style.color = '#ffffff';
        this.sidebarFilter = tab.getAttribute('data-filter') as any;
        this.renderSidebarContent();
      });
    });

    // Scope Toggle
    const pageToggle = sidebar.querySelector('#pf-page-toggle');
    pageToggle?.addEventListener('click', () => {
      if (this.sidebarPageFilter === 'current') {
        this.sidebarPageFilter = 'all';
        if (pageToggle) pageToggle.textContent = 'Entire Prototype Site';
      } else {
        this.sidebarPageFilter = 'current';
        if (pageToggle) pageToggle.textContent = 'Current Page';
      }
      this.renderSidebarContent();
    });
  }

  private renderSidebarContent() {
    const listEl = this.shadow.getElementById('pf-sb-list');
    if (!listEl) return;

    const currentCleanUrl = window.location.href.split('#')[0];

    const filtered = this.comments.filter((c) => {
      if (this.sidebarPageFilter === 'current' && c.url.split('#')[0] !== currentCleanUrl) {
        return false;
      }
      if (this.sidebarFilter === 'open' && c.status === 'resolved') return false;
      if (this.sidebarFilter === 'resolved' && c.status === 'open') return false;
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: #64748b; font-size: 13px; margin-top: 40px;">
          No ${this.sidebarFilter} annotations found.
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map((c, index) => {
        const pageName = new URL(c.url).pathname || '/';

        return `
        <div class="pf-sb-card" data-comment-id="${c.id}" data-url="${c.url}" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="padding: 2px 6px; background: #6366f1; border-radius: 8px; font-size: 10px; font-weight: 700;">#${index + 1}</span>
              <span style="font-size: 11px; font-weight: 600; color: #a5b4fc;">${c.author}</span>
            </div>
            <span style="font-size: 10px; color: #64748b;">${new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          </div>

          <div style="font-size: 12px; color: #f8fafc; line-height: 1.4; margin-bottom: 8px; white-space: pre-wrap;">${c.comment}</div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 6px;">
            <span>📍 ${pageName}</span>
            <span>💬 ${c.replies.length} replies</span>
          </div>
        </div>
      `;
      })
      .join('');

    // Click handler to jump/navigate to annotation
    listEl.querySelectorAll('.pf-sb-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-comment-id');
        const url = card.getAttribute('data-url');
        if (!id || !url) return;

        const targetCleanUrl = url.split('#')[0];
        if (targetCleanUrl !== currentCleanUrl) {
          window.location.href = url;
          return;
        }

        const comment = this.comments.find((c) => c.id === id);
        if (comment) {
          // Scroll window to pin position
          const targetY = (comment.coordinates.yPercent / 100) * window.innerHeight + window.scrollY;
          window.scrollTo({ top: targetY - 200, behavior: 'smooth' });

          setTimeout(() => {
            this.openCommentPopover(comment);
          }, 300);
        }
      });
    });
  }
}

// Define custom element automatically if window is available
if (typeof window !== 'undefined' && !customElements.get('prototype-feedback')) {
  customElements.define('prototype-feedback', PrototypeFeedback);
}
