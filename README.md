# 🎨 Visual Feedback Tool for Web Prototypes

A full-stack, framework-agnostic visual feedback tool for web prototypes inspired by Mouseback and Marker.io. This repository is structured as an **NPM Workspace / Monorepo** containing a Vanilla JS Web Component client package and an Express/TypeScript backend server.

---

## 📂 Repository Structure

```
web-feedback/
├── package.json               # Root monorepo workspace configuration
├── packages/
│   ├── client/                # @prototype-feedback/client (Web Component package)
│   │   ├── src/
│   │   │   ├── prototype-feedback.ts  # Web Component class implementation
│   │   │   └── index.ts              # ESM & UMD exports
│   │   ├── index.html         # Interactive prototype test/demo page
│   │   ├── vite.config.ts     # Vite bundler config (ESM & UMD)
│   │   └── package.json
│   └── server/                # @prototype-feedback/server (Express API package)
│       ├── src/
│       │   ├── index.ts        # Express app entry point
│       │   ├── routes/         # POST /api/feedback route
│       │   ├── services/       # Slack Webhook & Email (Nodemailer) services
│       │   └── config.ts       # Dotenv configuration
│       ├── .env.example
│       └── package.json
```

---

## ⚡ Quick Start

### 1. Install Dependencies
Run from the root directory to install dependencies for all workspaces:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in `packages/server/`:
```bash
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env` with your Slack Webhook URL and SMTP credentials:
```env
PORT=3000
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
ADMIN_EMAIL=admin@yourcompany.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@yourcompany.com
SMTP_PASS=your-app-password
```

### 3. Run Development Servers

- **Start Express Backend Server** (Port 3000):
  ```bash
  npm run dev:server
  ```

- **Start Client Demo App** (Vite Dev Server):
  ```bash
  npm run dev:client
  ```

- **Build Both Packages for Production**:
  ```bash
  npm run build
  ```

---

## 📦 How to Use the Web Component (`<prototype-feedback>`)

### Option A: Using `<script>` Tag in Plain HTML (UMD)

Build the client package or link the UMD bundle directly into your HTML prototype page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My Web Prototype</title>
</head>
<body>

  <h1>Welcome to my Prototype</h1>

  <!-- 1. Include the Prototype Feedback UMD Script -->
  <script src="./packages/client/dist/prototype-feedback.umd.cjs"></script>

  <!-- 2. Add the Web Component anywhere in body -->
  <prototype-feedback 
    api-url="http://localhost:3000/api/feedback" 
    button-text="Leave Feedback"
    position="bottom-right">
  </prototype-feedback>

</body>
</html>
```

### Option B: Using NPM in React / Vue / Next.js / Svelte (ESM)

Install the client package:
```bash
npm install @prototype-feedback/client
```

Import it in your entry file (e.g., `main.tsx` or `App.jsx`):
```tsx
import '@prototype-feedback/client';

export function App() {
  return (
    <div>
      <h1>My App</h1>
      <prototype-feedback 
        api-url="https://your-backend.com/api/feedback"
        button-text="Feedback">
      </prototype-feedback>
    </div>
  );
}
```

---

## ⚙️ Component Attributes

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `api-url` | `string` | `http://localhost:3000/api/feedback` | The backend API endpoint to POST feedback payload |
| `button-text` | `string` | `Feedback` | Text label displayed on the floating action button |
| `position` | `string` | `bottom-right` | Position of floating trigger button (`bottom-right` or `bottom-left`) |

---

## 📡 Backend API Payload Format (`POST /api/feedback`)

The component captures screen resolution, current URL, user agent, base64 screenshot image with visual pin overlay, and coordinates:

```json
{
  "comment": "The headline font feels too small on desktop screens.",
  "category": "Design",
  "email": "designer@acme.com",
  "url": "http://localhost:5173/",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "resolution": {
    "width": 1440,
    "height": 900,
    "devicePixelRatio": 2
  },
  "coordinates": {
    "x": 450,
    "y": 180,
    "xPercent": 31.25,
    "yPercent": 20.0
  },
  "userAgent": "Mozilla/5.0 ...",
  "timestamp": "2026-08-10T14:20:00.000Z"
}
```

---

## 🔔 Integrations

1. **Slack Webhook**: Formats incoming feedback into Slack Block Kit cards with project URL, pin coordinates, resolution, and user comments.
2. **Email Notification**: Uses `nodemailer` to dispatch an HTML email containing feedback metadata and attaches the annotated screenshot as an **inline CID image** (`cid:screenshot`).

---

## 📄 License
MIT
