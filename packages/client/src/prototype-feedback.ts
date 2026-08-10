import html2canvas from 'html2canvas';

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
  coordinates: {
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
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
  private comments: PinComment[] = [];
  private overlayBackdrop: HTMLElement | null = null;
  private pinElementsMap: Map<string, HTMLElement> = new Map();

  static get observedAttributes() {
    return ['api-url', 'button-text', 'position'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.setAttribute('data-html2canvas-ignore', 'true');
    this.render();
    this.setupEventListeners();
    this.fetchComments();

    // Keydown shortcut 'c' to toggle comment mode
    window.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    this.removeOverlay();
    this.removeAllPagePins();
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

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    if (e.key.toLowerCase() === 'c') {
      this.toggleCommentMode();
    } else if (e.key === 'Escape') {
      if (this.isCommentMode) this.disableCommentMode();
      this.closeActivePopover();
    }
  };

  private render() {
    const isLeft = this.position === 'bottom-left';

    this.shadow.innerHTML = `
      <style>
        :host {
          --pf-primary: #6366f1;
          --pf-primary-hover: #4f46e5;
          --pf-bg-glass: rgba(15, 23, 42, 0.92);
          --pf-border-glass: rgba(255, 255, 255, 0.15);
          --pf-text-main: #f8fafc;
          --pf-text-muted: #94a3b8;
          --pf-danger: #ef4444;
          --pf-success: #10b981;
          --pf-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

          font-family: var(--pf-font);
          position: fixed;
          z-index: 2147483640;
          ${isLeft ? 'left: 24px;' : 'right: 24px;'}
          bottom: 24px;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* Floating Toolbar Button */
        .pf-toolbar-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 9999px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 0 10px 25px -3px rgba(99, 102, 241, 0.4),
                      0 4px 6px -2px rgba(0, 0, 0, 0.15);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }

        .pf-toolbar-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 14px 30px -3px rgba(99, 102, 241, 0.5);
        }

        .pf-toolbar-btn.active {
          background: #ef4444;
          border-color: #f87171;
          box-shadow: 0 10px 25px -3px rgba(239, 68, 68, 0.4);
        }

        .pf-kbd {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }
      </style>

      <!-- Figma Style Toolbar Button -->
      <button class="pf-toolbar-btn" id="pf-toggle-btn">
        <span id="pf-btn-icon">💬</span>
        <span id="pf-btn-label">${this.buttonText}</span>
        <span class="pf-kbd">C</span>
      </button>
    `;
  }

  private setupEventListeners() {
    const toggleBtn = this.shadow.getElementById('pf-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
      this.toggleCommentMode();
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
    if (btnIcon) btnIcon.textContent = '✖';
    if (btnLabel) btnLabel.textContent = 'Cancel Comment';

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
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483630;
      cursor: crosshair;
      background: rgba(99, 102, 241, 0.05);
      outline: 2px dashed #6366f1;
      outline-offset: -2px;
    `;

    const tip = document.createElement('div');
    tip.textContent = '🎯 Click anywhere on the prototype to place a comment pin';
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #6366f1;
      color: #ffffff;
      padding: 8px 18px;
      border-radius: 9999px;
      font-family: -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 2147483632;
    `;

    overlay.appendChild(tip);

    overlay.addEventListener('click', (e: MouseEvent) => {
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      const xPercent = Number(((e.clientX / window.innerWidth) * 100).toFixed(2));
      const yPercent = Number(((e.clientY / window.innerHeight) * 100).toFixed(2));

      this.disableCommentMode();
      this.renderDraftPopover(x, y, xPercent, yPercent);
    });

    document.body.appendChild(overlay);
    this.overlayBackdrop = overlay;
  }

  private removeOverlay() {
    if (this.overlayBackdrop && this.overlayBackdrop.parentNode) {
      this.overlayBackdrop.parentNode.removeChild(this.overlayBackdrop);
      this.overlayBackdrop = null;
    }
  }

  private async fetchComments() {
    try {
      const res = await fetch(`${this.apiUrl}?url=${encodeURIComponent(window.location.href)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.comments)) {
        this.comments = data.comments;
        this.renderAllPagePins();
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

    this.comments.forEach((comment, index) => {
      if (comment.status === 'resolved') return;

      const pinNum = index + 1;
      const pin = document.createElement('div');
      pin.className = 'pf-page-pin';
      pin.setAttribute('data-pin-id', comment.id);
      pin.setAttribute('data-html2canvas-ignore', 'false');

      // Calculate pixel position from percentage so responsive resizing keeps pin anchored!
      const leftPx = (comment.coordinates.xPercent / 100) * window.innerWidth + window.scrollX;
      const topPx = (comment.coordinates.yPercent / 100) * window.innerHeight + window.scrollY;

      pin.style.cssText = `
        position: absolute;
        left: ${leftPx}px;
        top: ${topPx}px;
        transform: translate(-50%, -50%);
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: #ffffff;
        border: 2px solid #ffffff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg) translate(-10px, -10px);
        box-shadow: 0 8px 16px rgba(0,0,0,0.3);
        z-index: 2147483620;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      `;

      const numBadge = document.createElement('span');
      numBadge.textContent = String(pinNum);
      numBadge.style.cssText = `
        transform: rotate(45deg);
        font-family: -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 700;
        user-select: none;
      `;

      pin.appendChild(numBadge);

      // Make Pin Draggable!
      this.makePinDraggable(pin, comment);

      // Click to open anchored popover card
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
      pinEl.style.cursor = 'grabbing';
      e.stopPropagation();

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const currentLeft = parseFloat(pinEl.style.left) || 0;
        const currentTop = parseFloat(pinEl.style.top) || 0;

        const newLeft = currentLeft + dx;
        const newTop = currentTop + dy;

        pinEl.style.left = `${newLeft}px`;
        pinEl.style.top = `${newTop}px`;

        startX = moveEvent.clientX;
        startY = moveEvent.clientY;
      };

      const onMouseUp = async () => {
        if (!isDragging) return;
        isDragging = false;
        pinEl.style.cursor = 'grab';

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Calculate updated percentage coordinates
        const currentLeft = parseFloat(pinEl.style.left) || 0;
        const currentTop = parseFloat(pinEl.style.top) || 0;

        const xPercent = Number((((currentLeft - window.scrollX) / window.innerWidth) * 100).toFixed(2));
        const yPercent = Number((((currentTop - window.scrollY) / window.innerHeight) * 100).toFixed(2));

        comment.coordinates = {
          x: currentLeft,
          y: currentTop,
          xPercent,
          yPercent,
        };

        // Send PUT update to server
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

  private renderDraftPopover(x: number, y: number, xPercent: number, yPercent: number) {
    this.closeActivePopover();

    const popover = document.createElement('div');
    popover.id = 'pf-anchored-popover';
    popover.setAttribute('data-html2canvas-ignore', 'true');

    // Position popover card right beside dropped pin
    const popoverLeft = Math.min(x + 20, window.innerWidth + window.scrollX - 340);
    const popoverTop = Math.min(y - 10, window.innerHeight + window.scrollY - 300);

    popover.style.cssText = `
      position: absolute;
      left: ${popoverLeft}px;
      top: ${popoverTop}px;
      width: 320px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      z-index: 2147483645;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: pf-pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    popover.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
        <span style="font-size: 13px; font-weight: 700; color: #a5b4fc;">💬 New Comment</span>
        <button id="pf-draft-close" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">&times;</button>
      </div>

      <div style="display: flex; gap: 6px;">
        <button class="pf-draft-chip selected" data-cat="Issue" style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #6366f1; color: white; border: none; cursor: pointer;">Issue</button>
        <button class="pf-draft-chip" data-cat="Idea" style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.08); color: #94a3b8; border: none; cursor: pointer;">Idea</button>
        <button class="pf-draft-chip" data-cat="Design" style="padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.08); color: #94a3b8; border: none; cursor: pointer;">Design</button>
      </div>

      <textarea id="pf-draft-text" placeholder="Type a comment or note..." style="width: 100%; height: 80px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 10px; color: white; font-family: inherit; font-size: 13px; outline: none; resize: none;"></textarea>

      <input type="email" id="pf-draft-email" placeholder="Your name/email (optional)" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 10px; color: white; font-size: 12px; outline: none;" />

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="pf-draft-cancel" style="padding: 8px 14px; background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer;">Cancel</button>
        <button id="pf-draft-post" style="padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">Post Comment</button>
      </div>
    `;

    document.body.appendChild(popover);

    // Setup chip selector logic
    const chips = popover.querySelectorAll('.pf-draft-chip');
    chips.forEach((c) => {
      c.addEventListener('click', () => {
        chips.forEach((ch) => {
          (ch as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
          (ch as HTMLElement).style.color = '#94a3b8';
        });
        (c as HTMLElement).style.background = '#6366f1';
        (c as HTMLElement).style.color = '#ffffff';
        c.classList.add('selected');
      });
    });

    popover.querySelector('#pf-draft-close')?.addEventListener('click', () => this.closeActivePopover());
    popover.querySelector('#pf-draft-cancel')?.addEventListener('click', () => this.closeActivePopover());

    popover.querySelector('#pf-draft-post')?.addEventListener('click', async () => {
      const text = (popover.querySelector('#pf-draft-text') as HTMLTextAreaElement)?.value.trim();
      const email = (popover.querySelector('#pf-draft-email') as HTMLInputElement)?.value.trim();
      const selectedChip = popover.querySelector('.pf-draft-chip.selected');
      const category = selectedChip?.getAttribute('data-cat') || 'Issue';

      if (!text) return;

      // Capture screenshot for Slack/Mailtrap notifications
      let base64Image = '';
      try {
        popover.style.display = 'none';
        const canvas = await html2canvas(document.body, {
          useCORS: true,
          logging: false,
          ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore') && el.getAttribute('data-html2canvas-ignore') === 'true',
        });
        base64Image = canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Screenshot capture error:', err);
      }

      const payload = {
        comment: text,
        category,
        email: email || undefined,
        image: base64Image,
        url: window.location.href,
        coordinates: { x, y, xPercent, yPercent },
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

    // Auto focus textarea
    setTimeout(() => {
      (popover.querySelector('#pf-draft-text') as HTMLTextAreaElement)?.focus();
    }, 100);
  }

  private openCommentPopover(comment: PinComment) {
    this.closeActivePopover();

    const pinEl = this.pinElementsMap.get(comment.id);
    if (!pinEl) return;

    const x = parseFloat(pinEl.style.left) || comment.coordinates.x;
    const y = parseFloat(pinEl.style.top) || comment.coordinates.y;

    const popover = document.createElement('div');
    popover.id = 'pf-anchored-popover';
    popover.setAttribute('data-html2canvas-ignore', 'true');

    const popoverLeft = Math.min(x + 20, window.innerWidth + window.scrollX - 360);
    const popoverTop = Math.min(y - 10, window.innerHeight + window.scrollY - 420);

    popover.style.cssText = `
      position: absolute;
      left: ${popoverLeft}px;
      top: ${popoverTop}px;
      width: 340px;
      max-height: 480px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      z-index: 2147483645;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: pf-pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Render Replies HTML
    const repliesHtml = comment.replies
      .map(
        (r) => `
        <div style="background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 700; color: #a5b4fc;">${r.author}</span>
            <span style="font-size: 10px; color: #64748b;">${new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style="font-size: 12px; color: #e2e8f0; white-space: pre-wrap;">${r.text}</div>
        </div>
      `
      )
      .join('');

    // Render Emoji Reactions Bar HTML
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
        <button class="pf-emoji-btn" data-emoji="${e}" style="background: none; border: none; font-size: 16px; cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: transform 0.1s;">
          ${e}
        </button>
      `
      )
      .join('');

    popover.innerHTML = `
      <div style="padding: 12px 16px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="padding: 2px 8px; background: #6366f1; border-radius: 10px; font-size: 10px; font-weight: 700;">${comment.category}</span>
          <span style="font-size: 12px; font-weight: 600; color: #94a3b8;">${comment.author}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="pf-resolve-btn" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">Resolve</button>
          <button id="pf-card-close" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
      </div>

      <div style="padding: 16px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
        <!-- Original Comment -->
        <div style="font-size: 13px; line-height: 1.5; color: #f8fafc; white-space: pre-wrap;" id="pf-comment-text">${comment.comment}</div>

        <!-- Emoji Reaction Pills -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;" id="pf-rx-container">
          ${reactionsPillsHtml}
        </div>

        <!-- Emoji Picker Bar -->
        <div style="display: flex; gap: 6px; padding: 4px 8px; background: rgba(0,0,0,0.3); border-radius: 8px; width: fit-content;">
          ${emojiBarHtml}
        </div>

        <!-- Replies List -->
        <div id="pf-replies-list" style="margin-top: 8px;">
          ${repliesHtml}
        </div>
      </div>

      <!-- Reply Input Footer -->
      <div style="padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); display: flex; gap: 8px; align-items: center;">
        <input type="text" id="pf-reply-input" placeholder="Reply to thread..." style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; color: white; font-size: 12px; outline: none;" />
        <button id="pf-reply-send" style="padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">Send</button>
      </div>
    `;

    document.body.appendChild(popover);

    // Event Handlers for Card
    popover.querySelector('#pf-card-close')?.addEventListener('click', () => this.closeActivePopover());

    // Resolve Pin
    popover.querySelector('#pf-resolve-btn')?.addEventListener('click', async () => {
      try {
        await fetch(`${this.apiUrl}/${comment.id}`, { method: 'DELETE' });
        this.closeActivePopover();
        this.fetchComments();
      } catch (err) {
        console.error('Error resolving comment:', err);
      }
    });

    // Toggle Emoji Reaction
    popover.querySelectorAll('.pf-emoji-btn, .pf-rx-pill').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const emoji = btn.getAttribute('data-emoji');
        if (!emoji) return;

        try {
          await fetch(`${this.apiUrl}/${comment.id}/reactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji, author: 'User' }),
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

    // Send Reply
    const replyInput = popover.querySelector('#pf-reply-input') as HTMLInputElement;
    const sendReplyBtn = popover.querySelector('#pf-reply-send');

    const handleSendReply = async () => {
      const text = replyInput?.value.trim();
      if (!text) return;

      try {
        await fetch(`${this.apiUrl}/${comment.id}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author: 'User', text }),
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
}

// Define custom element automatically if window is available
if (typeof window !== 'undefined' && !customElements.get('prototype-feedback')) {
  customElements.define('prototype-feedback', PrototypeFeedback);
}
