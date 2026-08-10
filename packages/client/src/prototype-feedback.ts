import html2canvas from 'html2canvas';

export interface FeedbackPayload {
  comment: string;
  category: string;
  email?: string;
  image: string; // Base64 data URL
  url: string;
  resolution: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  coordinates: {
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
  } | null;
  userAgent: string;
  timestamp: string;
}

export class PrototypeFeedback extends HTMLElement {
  private shadow: ShadowRoot;
  private isAnnotating: boolean = false;
  private activePin: { x: number; y: number; xPercent: number; yPercent: number } | null = null;
  private pinOverlayElement: HTMLElement | null = null;
  private overlayBackdrop: HTMLElement | null = null;

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
  }

  disconnectedCallback() {
    this.removePin();
    this.removeOverlay();
  }

  attributeChangedCallback(_name: string, _oldValue: string, _newValue: string) {
    this.render();
    this.setupEventListeners();
  }

  private get apiUrl(): string {
    return this.getAttribute('api-url') || '/api/feedback';
  }

  private get buttonText(): string {
    return this.getAttribute('button-text') || 'Feedback';
  }

  private get position(): string {
    return this.getAttribute('position') || 'bottom-right';
  }

  private render() {
    const isLeft = this.position === 'bottom-left';

    this.shadow.innerHTML = `
      <style>
        :host {
          --pf-primary: #6366f1;
          --pf-primary-hover: #4f46e5;
          --pf-bg-glass: rgba(15, 23, 42, 0.85);
          --pf-border-glass: rgba(255, 255, 255, 0.12);
          --pf-text-main: #f8fafc;
          --pf-text-muted: #94a3b8;
          --pf-danger: #ef4444;
          --pf-success: #10b981;
          --pf-radius: 16px;
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

        /* Trigger Button */
        .pf-trigger-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 9999px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 0 10px 25px -3px rgba(99, 102, 241, 0.4),
                      0 4px 6px -2px rgba(0, 0, 0, 0.1);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }

        .pf-trigger-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 14px 30px -3px rgba(99, 102, 241, 0.5),
                      0 6px 10px -2px rgba(0, 0, 0, 0.15);
        }

        .pf-trigger-btn:active {
          transform: translateY(0) scale(0.98);
        }

        .pf-trigger-btn svg {
          width: 18px;
          height: 18px;
          fill: currentColor;
        }

        /* Sidebar / Drawer Panel */
        .pf-drawer {
          position: fixed;
          top: 0;
          ${isLeft ? 'left: 0;' : 'right: 0;'}
          width: 380px;
          max-width: calc(100vw - 32px);
          height: 100vh;
          background: var(--pf-bg-glass);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-${isLeft ? 'right' : 'left'}: 1px solid var(--pf-border-glass);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          transform: translateX(${isLeft ? '-100%' : '100%'});
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 2147483645;
          color: var(--pf-text-main);
        }

        .pf-drawer.open {
          transform: translateX(0);
        }

        .pf-header {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--pf-border-glass);
        }

        .pf-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
        }

        .pf-close-btn {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: var(--pf-text-muted);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s ease;
        }

        .pf-close-btn:hover {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }

        .pf-body {
          padding: 24px;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .pf-form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pf-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--pf-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Annotate Mode Button */
        .pf-annotate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px dashed rgba(255, 255, 255, 0.25);
          border-radius: 12px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pf-annotate-btn:hover {
          background: rgba(99, 102, 241, 0.15);
          border-color: #6366f1;
        }

        .pf-annotate-btn.active {
          background: rgba(99, 102, 241, 0.25);
          border-color: #6366f1;
          color: #a5b4fc;
        }

        .pf-pin-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 10px;
          font-size: 13px;
          color: #34d399;
        }

        .pf-pin-remove {
          background: none;
          border: none;
          color: #f87171;
          font-size: 12px;
          cursor: pointer;
          text-decoration: underline;
        }

        /* Category Chips */
        .pf-categories {
          display: flex;
          gap: 8px;
        }

        .pf-chip {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--pf-text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pf-chip:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .pf-chip.selected {
          background: #6366f1;
          color: #ffffff;
          border-color: #818cf8;
        }

        /* Inputs */
        textarea.pf-input, input.pf-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--pf-border-glass);
          border-radius: 10px;
          padding: 12px;
          color: #ffffff;
          font-family: inherit;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s ease;
        }

        textarea.pf-input {
          resize: vertical;
          min-height: 110px;
        }

        textarea.pf-input:focus, input.pf-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        /* Footer & Submit */
        .pf-footer {
          padding: 20px 24px;
          border-top: 1px solid var(--pf-border-glass);
        }

        .pf-submit-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          border: none;
          border-radius: 12px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .pf-submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          transform: translateY(-1px);
        }

        .pf-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Status Toast */
        .pf-status {
          padding: 12px;
          border-radius: 10px;
          font-size: 13px;
          display: none;
        }

        .pf-status.success {
          display: block;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: #34d399;
        }

        .pf-status.error {
          display: block;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
        }

        /* Spinner */
        .pf-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #ffffff;
          animation: pf-spin 0.8s linear infinite;
        }

        @keyframes pf-spin {
          to { transform: rotate(360deg); }
        }
      </style>

      <!-- Floating Trigger Button -->
      <button class="pf-trigger-btn" id="pf-trigger">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
        </svg>
        <span>${this.buttonText}</span>
      </button>

      <!-- Drawer Panel -->
      <div class="pf-drawer" id="pf-drawer">
        <div class="pf-header">
          <div class="pf-header-title">
            <span>💬</span> Submit Feedback
          </div>
          <button class="pf-close-btn" id="pf-close">&times;</button>
        </div>

        <div class="pf-body">
          <div id="pf-status" class="pf-status"></div>

          <!-- Annotation Mode Toggle -->
          <div class="pf-form-group">
            <span class="pf-label">Visual Pin</span>
            <button class="pf-annotate-btn" id="pf-annotate">
              <span>🎯</span>
              <span id="pf-annotate-label">Click to drop pin on screen</span>
            </button>
            <div id="pf-pin-badge" style="display: none;"></div>
          </div>

          <!-- Category -->
          <div class="pf-form-group">
            <span class="pf-label">Type</span>
            <div class="pf-categories">
              <button class="pf-chip selected" data-cat="Issue">Issue</button>
              <button class="pf-chip" data-cat="Idea">Idea</button>
              <button class="pf-chip" data-cat="Design">Design</button>
            </div>
          </div>

          <!-- Comment Textarea -->
          <div class="pf-form-group">
            <span class="pf-label">Feedback Details</span>
            <textarea class="pf-input" id="pf-comment" placeholder="What looks good, or what needs fixing? Be specific..."></textarea>
          </div>

          <!-- Email Input -->
          <div class="pf-form-group">
            <span class="pf-label">Your Email (optional)</span>
            <input type="email" class="pf-input" id="pf-email" placeholder="alex@example.com" />
          </div>
        </div>

        <div class="pf-footer">
          <button class="pf-submit-btn" id="pf-submit">
            <span id="pf-submit-text">Send Feedback</span>
          </button>
        </div>
      </div>
    `;
  }

  private setupEventListeners() {
    const trigger = this.shadow.getElementById('pf-trigger');
    const drawer = this.shadow.getElementById('pf-drawer');
    const closeBtn = this.shadow.getElementById('pf-close');
    const annotateBtn = this.shadow.getElementById('pf-annotate');
    const submitBtn = this.shadow.getElementById('pf-submit');
    const categoryChips = this.shadow.querySelectorAll('.pf-chip');

    trigger?.addEventListener('click', () => {
      drawer?.classList.add('open');
    });

    closeBtn?.addEventListener('click', () => {
      drawer?.classList.remove('open');
      if (this.isAnnotating) {
        this.disableAnnotateMode();
      }
    });

    annotateBtn?.addEventListener('click', () => {
      if (this.isAnnotating) {
        this.disableAnnotateMode();
      } else {
        this.enableAnnotateMode();
      }
    });

    categoryChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        categoryChips.forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });

    submitBtn?.addEventListener('click', () => {
      this.handleSubmit();
    });
  }

  private enableAnnotateMode() {
    this.isAnnotating = true;
    const drawer = this.shadow.getElementById('pf-drawer');
    const annotateBtn = this.shadow.getElementById('pf-annotate');
    const annotateLabel = this.shadow.getElementById('pf-annotate-label');

    // Close drawer so user can see full screen to click pin
    drawer?.classList.remove('open');
    annotateBtn?.classList.add('active');
    if (annotateLabel) annotateLabel.textContent = 'Annotate Mode Active (Click screen)';

    // Create interactive backdrop overlay
    this.createOverlayBackdrop();
  }

  private disableAnnotateMode() {
    this.isAnnotating = false;
    const annotateBtn = this.shadow.getElementById('pf-annotate');
    const annotateLabel = this.shadow.getElementById('pf-annotate-label');

    annotateBtn?.classList.remove('active');
    if (annotateLabel) annotateLabel.textContent = 'Click to drop pin on screen';

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
      background: rgba(99, 102, 241, 0.08);
      outline: 3px dashed #6366f1;
      outline-offset: -3px;
    `;

    // Helper banner informing user
    const tip = document.createElement('div');
    tip.textContent = '🎯 Click anywhere on the prototype to place a pin';
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #6366f1;
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
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

      this.activePin = { x, y, xPercent, yPercent };
      this.renderPinOnPage(x, y);

      this.disableAnnotateMode();

      // Re-open drawer panel
      const drawer = this.shadow.getElementById('pf-drawer');
      drawer?.classList.add('open');
      this.updatePinBadge();
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

  private renderPinOnPage(x: number, y: number) {
    this.removePin();

    const pin = document.createElement('div');
    pin.className = 'pf-page-pin';
    // Ensure html2canvas captures this pin!
    pin.setAttribute('data-html2canvas-ignore', 'false');
    pin.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      background: #ef4444;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.4), 0 8px 16px rgba(0,0,0,0.3);
      z-index: 2147483620;
      pointer-events: none;
      animation: pf-pin-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    // Add pulse animation keyframes dynamically to document head if not present
    if (!document.getElementById('pf-pin-style')) {
      const style = document.createElement('style');
      style.id = 'pf-pin-style';
      style.textContent = `
        @keyframes pf-pin-pop {
          0% { transform: translate(-50%, -50%) scale(0); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(pin);
    this.pinOverlayElement = pin;
  }

  private removePin() {
    if (this.pinOverlayElement && this.pinOverlayElement.parentNode) {
      this.pinOverlayElement.parentNode.removeChild(this.pinOverlayElement);
      this.pinOverlayElement = null;
    }
    this.activePin = null;
    this.updatePinBadge();
  }

  private updatePinBadge() {
    const badgeContainer = this.shadow.getElementById('pf-pin-badge');
    if (!badgeContainer) return;

    if (this.activePin) {
      badgeContainer.style.display = 'block';
      badgeContainer.innerHTML = `
        <div class="pf-pin-info">
          <span>📍 Pin set at (${this.activePin.xPercent}%, ${this.activePin.yPercent}%)</span>
          <button class="pf-pin-remove" id="pf-remove-pin">Remove</button>
        </div>
      `;
      this.shadow.getElementById('pf-remove-pin')?.addEventListener('click', () => {
        this.removePin();
      });
    } else {
      badgeContainer.style.display = 'none';
      badgeContainer.innerHTML = '';
    }
  }

  private async handleSubmit() {
    const commentInput = this.shadow.getElementById('pf-comment') as HTMLTextAreaElement;
    const emailInput = this.shadow.getElementById('pf-email') as HTMLInputElement;
    const submitBtn = this.shadow.getElementById('pf-submit') as HTMLButtonElement;
    const submitText = this.shadow.getElementById('pf-submit-text');
    const selectedChip = this.shadow.querySelector('.pf-chip.selected');

    const comment = commentInput?.value.trim();
    if (!comment) {
      this.showStatus('Please enter feedback details before sending.', 'error');
      return;
    }

    // Set UI loading state
    submitBtn.disabled = true;
    if (submitText) {
      submitText.innerHTML = `<div class="pf-spinner"></div> Capturing & Sending...`;
    }
    this.showStatus('', 'none');

    try {
      // 1. Temporarily hide drawer panel for clean screenshot capture
      const drawer = this.shadow.getElementById('pf-drawer');
      drawer?.style.setProperty('display', 'none');

      // Small delay to ensure render tree settles
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 2. Capture screenshot using html2canvas
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (element) => {
          return element.hasAttribute('data-html2canvas-ignore') && element.getAttribute('data-html2canvas-ignore') === 'true';
        },
      });

      const base64Image = canvas.toDataURL('image/png');

      // Restore drawer panel
      drawer?.style.removeProperty('display');

      // 3. Construct payload
      const payload: FeedbackPayload = {
        comment,
        category: selectedChip?.getAttribute('data-cat') || 'General',
        email: emailInput?.value.trim() || undefined,
        image: base64Image,
        url: window.location.href,
        resolution: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
        coordinates: this.activePin,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      };

      // 4. Send POST request to backend API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server returned status ${response.status}`);
      }

      // Success
      this.showStatus('✨ Feedback sent successfully! Thank you.', 'success');
      commentInput.value = '';
      if (emailInput) emailInput.value = '';
      this.removePin();

      setTimeout(() => {
        drawer?.classList.remove('open');
        this.showStatus('', 'none');
      }, 2500);

    } catch (err: any) {
      console.error('PrototypeFeedback submission error:', err);
      this.showStatus(`Failed to send feedback: ${err.message || 'Network error'}`, 'error');
    } finally {
      submitBtn.disabled = false;
      if (submitText) {
        submitText.textContent = 'Send Feedback';
      }
    }
  }

  private showStatus(msg: string, type: 'success' | 'error' | 'none') {
    const statusBox = this.shadow.getElementById('pf-status');
    if (!statusBox) return;

    statusBox.className = 'pf-status';
    if (type === 'none' || !msg) {
      statusBox.style.display = 'none';
      statusBox.textContent = '';
      return;
    }

    statusBox.classList.add(type);
    statusBox.textContent = msg;
  }
}

// Define custom element automatically if window is available
if (typeof window !== 'undefined' && !customElements.get('prototype-feedback')) {
  customElements.define('prototype-feedback', PrototypeFeedback);
}
