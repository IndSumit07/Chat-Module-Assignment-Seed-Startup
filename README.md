# 💬 Chat Service

A production-ready, full-stack real-time chat application built with modern web technologies, designed for high performance, horizontal scalability, and an excellent developer + user experience.

---

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Architecture Deep Dive](#-in-depth-technical-architecture)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Socket.io Events](#-socketio-events-reference)
- [Data Models](#-data-models)
- [Environment Variables](#-environment-variables)
- [Local Development](#-local-development)
- [Deployment Guide](#-deployment-guide)

---

## 🛠 Tech Stack

### Frontend (Client)

| Technology | Purpose |
|---|---|
| **React 19** + Vite | UI framework & blazing-fast build toolchain |
| **Tailwind CSS v3** | Utility-first styling |
| **Socket.io-client v4** | Real-time bidirectional communication |
| **React Router DOM v7** | Client-side routing |
| **Axios** | HTTP client with cookie credential support |
| **Lucide React** | Icon library |
| **React Hot Toast** | Non-blocking notification toasts |

### Backend (Server)

| Technology | Purpose |
|---|---|
| **Node.js** + Express v5 | HTTP server & REST API |
| **Socket.io v4** | WebSocket server |
| **MongoDB** (Mongoose v9) | Primary persistent data store |
| **Redis** (ioredis v5) | Caching, Pub/Sub, Rate Limiting, Presence |
| **BullMQ v5** | Background job queue (runs on Redis) |
| **JWT** + bcryptjs | Stateless authentication & password hashing |
| **AWS S3** (multer-s3) | File & media attachment storage |
| **Brevo** (@getbrevo/brevo) | Transactional email delivery (OTPs, invites) |

---

## ✨ Features

### 🔐 Authentication & Security
- **Email + Password Registration** with OTP email verification
- **Smart Re-registration**: Silently cleans up stale unverified accounts, no confusing errors
- **Two-Factor Authentication (2FA)**: Optional per-account; sends OTP on every login when enabled
- **Forgot/Reset Password** via OTP with anti-enumeration protection (identical response regardless of email existence)
- **JWT Authentication** stored in `httpOnly` cookies (XSS-proof) with `secure` + `sameSite` flags for CSRF protection
- **Socket.io Auth Middleware**: Every WebSocket connection is authenticated via JWT before the `connection` event fires

### 💬 Real-Time Messaging
- **Optimistic UI**: Messages appear instantly for the sender with a `tempId` — no waiting for server round-trip
- **Reconciliation**: Server confirms the message, sender's UI replaces the temporary placeholder with the official server-stamped message
- **Message Edit & Delete**: Edit message text or soft-delete (preserved in DB for audit/threading, hidden from clients)
- **Reply Threading**: Messages can quote/reply to any prior message in the conversation
- **Media Attachments**: Upload images, files, video, and audio — stored on AWS S3, supports `image`, `file`, `video`, `audio` types
- **Read Receipts**: Per-user read timestamps tracked at the conversation level with `lastReadAt` cursors
- **Unread Counts**: Atomically tracked in Redis per `(user, conversation)` pair; reset when the conversation is opened

### 🖊️ Typing Indicators
- Real-time "X is typing…" indicators using **Redis Sorted Sets (ZSET)**
- **Lazy pruning**: Stale typers (>5s ago) are removed on-read via `ZREMRANGEBYSCORE` — no cron jobs needed
- **TTL-based cleanup**: The entire ZSET expires after 30s to prevent orphaned data

### 🟢 User Presence
- **Online/Offline** status tracked in Redis with a **35-second TTL + heartbeat** pattern
- Client sends a `heartbeat` event every 20 seconds to refresh the TTL
- **Multi-tab/multi-device aware**: Redis `SET` tracks all active `socketId`s per user; user only goes offline when the last session disconnects
- **Last Seen** timestamp persisted to Redis when the user goes fully offline
- **Active Conversation** tracking: Knows which conversation a user is currently viewing (used to suppress redundant unread increments)

### 📨 Invitation System
- Invite users to conversations **by email** (works for both existing and non-existing users)
- **Existing users**: Receive an instant in-app notification via Socket.io + a branded email
- **Non-existing emails**: Receive a branded invitation email with accept/reject deep links
- Invitations have a **7-day expiry** and a full lifecycle: `pending → accepted | rejected | expired`
- Rate-limited to **10 invitations per minute** per user

### 🔔 In-App Notifications
- Persistent notification documents stored in MongoDB
- **Unread count** cached in Redis for instant badge counts
- Delivered in real-time via Socket.io pub/sub
- Background worker processes notification creation asynchronously

### 📦 Background Job Queues (BullMQ)
- **Email Queue**: OTP emails for registration, 2FA login, and password reset
- **Invitation Email Queue**: Full branded HTML invitation emails
- **Notification Queue**: In-app notification creation and real-time delivery
- All queues use **exponential backoff retry** (3 attempts: 5s → 10s → 20s)
- Workers run with controlled concurrency to respect external API rate limits

### ⚡ Caching Strategy (Redis)
- **Conversation metadata** cached for 1 hour (`conv:{id}`)
- **Hot message cache**: 50 most recent messages per conversation, 30-minute TTL (`msgs:{convId}` Redis List)
- **Unread counts**: Redis Hash per user (`unread:{userId}`)
- **Notification counts**: Redis String per user (`notify:count:{userId}`)
- All caches are **write-invalidated** on mutation to ensure consistency

### 🌐 Horizontal Scaling (Redis Pub/Sub)
- All real-time events are routed through **Redis Pub/Sub** — every server instance subscribes to the same channels
- A dedicated `ioredis` connection (not the main client) is used for the subscriber to avoid command conflicts
- 10 channel namespaces: `chat:message:*`, `chat:typing:*`, `chat:read:*`, `conversation:updated:*`, `conversation:deleted:*`, `invitation:*`, `notification:*`, `presence:*`

### 🛡️ Rate Limiting
- **Sliding window** rate limiter backed by Redis Sorted Sets (fair, no sharp resets)
- Atomic pipeline: prune stale → count → record in a single round-trip

| Action | Limit |
|---|---|
| Send Message | 30 per 10 seconds |
| Create Conversation | 5 per minute |
| Send Invitation | 10 per minute |
| Typing Events | 20 per 5 seconds |
| Auth Endpoints | 10 per 15 minutes |
| General API | 100 per minute |

### 📱 Responsive UI
- Mobile-first layout with sidebar/chat drawer pattern
- Works seamlessly on phones, tablets, and desktops

---

## 🏗 In-Depth Technical Architecture

### 1. Message Flow & Optimistic UI

```
CLIENT                            SERVER                         REDIS / MONGO
  │                                  │                                │
  │── message:send (tempId) ────────>│                                │
  │   (msg shown in UI immediately)  │── save to MongoDB ────────────>│
  │                                  │── prependMessage() ───────────>│ (msgs:{convId} LIST)
  │                                  │── updateLastMessage() ─────────>│
  │                                  │── invalidateConversation() ────>│
  │                                  │── incrementUnreadCount() ──────>│ (unread:{userId} HASH)
  │                                  │── publish(chat:message:{id}) ──>│
  │<── message:new (msg + tempId) ───│<── subscriber re-emits ────────│
  │   (replace tempId placeholder)   │                                │
```

### 2. Typing Indicators (Redis ZSET)

```
Key:   typing:{conversationId}   (Sorted Set)
Score: Unix timestamp (ms)       (last typing event)
Value: userId

typing:start  → ZADD key <now> <userId>  + EXPIRE 30s
typing:stop   → ZREM key <userId>
get typers    → ZRANGEBYSCORE key <(now-5000)> <+inf>
              + ZREMRANGEBYSCORE key -inf <(now-5000)>  ← prunes stale in same call
```

### 3. Presence System (Redis TTL + Heartbeat)

```
Keys:
  presence:status:{userId}   → 'online' | (absent = offline)  TTL: 35s
  presence:lastseen:{userId} → ISO timestamp                   (persistent)
  sessions:{userId}          → Set of active socketIds
  presence:active:{userId}   → conversationId being viewed     TTL: 1h

Heartbeat flow:
  Client ──── heartbeat (every 20s) ──>  Server
  Server ──── EXPIRE status key 35s ──>  Redis

  If heartbeat stops → key expires at 35s → user appears offline on next lookup
```

### 4. Email Queue System (BullMQ)

```
Controller/Service
  │── emailQueue.add('otp', { email, otp, purpose })
  │── invitationEmailQueue.add('invitation-email', { ... })
  │── notificationQueue.add('notification', { ... })
         │
         ▼ (async, non-blocking)
    BullMQ Worker (Redis-backed)
         │── concurrency: 5  (protects Brevo API rate limits)
         │── attempts: 3, backoff: exponential (5s → 10s → 20s)
         │── generates branded HTML email
         └── Brevo API call
```

### 5. Redis Pub/Sub for Cross-Instance Delivery

```
Server Instance A                Redis                  Server Instance B
       │                           │                           │
       │── publish(channel, msg) ──>│                           │
       │                           │── pmessage event ─────────>│
       │                           │                    io.to(room).emit(...)
       │                           │                           │
  Subscriber connection (dedicated ioredis — never used for regular commands)
  Subscribes to 8 wildcard patterns via psubscribe()
```

### 6. Authentication Flow

```
Registration:
  POST /auth/register → create unverified user → send OTP email (queue)
  POST /auth/verify-otp → mark isVerified=true → delete OTP (replay-attack prevention)

Login (no 2FA):
  POST /auth/login → verify password → sign JWT → set httpOnly cookie

Login (2FA enabled):
  POST /auth/login → verify password → send OTP → { requires2FA: true }
  POST /auth/verify-login-otp → verify OTP → sign JWT → set httpOnly cookie

Password Reset:
  POST /auth/forgot-password → (if user exists) send OTP → same response always (anti-enumeration)
  POST /auth/reset-password → verify OTP → hash new password → save → delete OTP
```

---

## 📁 Project Structure

```text
Chat Service/
├── docker-compose.yml          # Local dev: Redis + Server containers
├── client/                     # React 19 + Vite frontend
│   ├── vercel.json             # SPA rewrite rule for Vercel deployment
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx             # Router, protected routes, auth guards
│       ├── api/                # Axios instance + per-domain API functions
│       │   ├── axios.js        # Base Axios instance (withCredentials)
│       │   ├── auth.js         # register, login, logout, me, toggle2FA…
│       │   ├── conversation.js # CRUD conversations, members
│       │   ├── message.js      # fetch messages
│       │   ├── invitation.js   # send, respond, list invitations
│       │   ├── notification.js # fetch, mark-read notifications
│       │   └── upload.js       # presigned/direct S3 upload
│       ├── contexts/
│       │   └── AuthContext.jsx # Global auth state (user, loading)
│       ├── hooks/              # Custom React hooks
│       └── pages/
│           ├── DashboardPage.jsx       # Main chat UI (sidebar + chat window)
│           ├── LoginPage.jsx           # Login + 2FA OTP flow
│           ├── RegisterPage.jsx        # Registration form
│           ├── VerifyOtpPage.jsx       # OTP verification
│           ├── ForgotPasswordPage.jsx  # Password reset initiation
│           ├── ResetPasswordPage.jsx   # New password entry
│           ├── ProfilePage.jsx         # Avatar, password change, 2FA toggle
│           └── RespondInvitationPage.jsx # Accept/reject deep-link handler
│
└── server/                     # Node.js + Express backend
    ├── Dockerfile              # node:20-alpine production image
    ├── server.js               # Entry point: HTTP server + socket + workers
    └── src/
        ├── app.js              # Express app, CORS, routes, error handler
        ├── configs/
        │   ├── env.config.js   # Validates + exports all env vars
        │   ├── mongo.config.js # Mongoose connection
        │   ├── redis.config.js # ioredis client (main)
        │   ├── socket.config.js# Socket.io init + JWT auth middleware
        │   ├── queue.config.js # BullMQ Queue instances (email, invite, notify)
        │   ├── brevo.config.js # Brevo API client
        │   └── s3.config.js    # AWS S3 client + multer-s3
        ├── controllers/        # Express route handlers
        │   ├── auth.controller.js          # Register, login, 2FA, reset, profile
        │   ├── conversation.controller.js  # CRUD conversations, members
        │   ├── invitation.controller.js    # Send, respond, list invitations
        │   ├── message.controller.js       # Fetch + paginate messages
        │   ├── notification.controller.js  # Fetch + mark-read notifications
        │   └── upload.controller.js        # S3 upload endpoint
        ├── models/             # Mongoose schemas
        │   ├── user.model.js           # User (username, email, password, 2FA, avatar)
        │   ├── conversation.model.js   # Conversation (members[], roles, lastReadAt)
        │   ├── message.model.js        # Message (text, attachments, replyTo, readBy)
        │   ├── invitation.model.js     # Invitation (email, status, expiresAt)
        │   └── notification.model.js   # Notification (title, body, type, isRead)
        ├── routes/             # Express routers
        │   ├── auth.route.js
        │   ├── conversation.route.js
        │   ├── invitation.route.js
        │   ├── message.route.js
        │   ├── notification.route.js
        │   └── upload.route.js
        ├── services/           # Core business logic & infrastructure
        │   ├── auth.service.js         # findUser, createUser, markVerified…
        │   ├── cache.service.js        # Redis cache R/W for conv, msgs, unread
        │   ├── conversation.service.js # Conversation CRUD + member management
        │   ├── invitation.service.js   # Invitation CRUD
        │   ├── mail.service.js         # Dispatches jobs to emailQueue
        │   ├── message.service.js      # Message CRUD, soft-delete, mark-read
        │   ├── notification.service.js # Notification CRUD
        │   ├── otp.service.js          # Generate, store (Redis), verify, delete OTPs
        │   ├── presence.service.js     # Online/offline Redis presence management
        │   ├── pubsub.service.js       # Redis pub/sub publisher + subscriber bridge
        │   ├── ratelimit.service.js    # Sliding window rate limiter (Redis ZSET)
        │   └── typing.service.js       # Typing indicator Redis ZSET management
        ├── sockets/            # Modular Socket.io event handlers
        │   ├── chat.socket.js          # message:send/edit/delete/read
        │   ├── typing.socket.js        # typing:start/stop
        │   ├── presence.socket.js      # heartbeat, conversation:join/leave, presence:get
        │   └── notification.socket.js  # notification:read
        ├── middlewares/
        │   ├── auth.middleware.js      # JWT cookie verification (Express)
        │   └── upload.middleware.js    # multer-s3 configuration
        └── workers/            # BullMQ background job processors
            ├── mail.worker.js          # OTP email sender (concurrency: 5)
            ├── invitation.worker.js    # Invitation email HTML builder + sender
            └── notification.worker.js  # In-app notification creator + socket emitter
```

---

## 🔌 API Reference

All endpoints are prefixed with `/api/v1`. Protected routes require a valid `accessToken` cookie.

### Auth — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | — | Create account, send OTP email |
| `POST` | `/verify-otp` | — | Verify registration OTP, activate account |
| `POST` | `/resend-otp` | — | Resend registration OTP |
| `POST` | `/login` | — | Password login; triggers 2FA OTP if enabled |
| `POST` | `/verify-login-otp` | — | Complete 2FA login |
| `POST` | `/forgot-password` | — | Send password reset OTP |
| `POST` | `/reset-password` | — | Set new password with OTP |
| `GET` | `/me` | ✅ | Get authenticated user's profile |
| `POST` | `/logout` | ✅ | Clear auth cookie |
| `POST` | `/change-password` | ✅ | Change password (requires current password) |
| `POST` | `/toggle-2fa` | ✅ | Enable/disable 2FA `{ enabled: bool }` |
| `PATCH` | `/profile` | ✅ | Update profile (e.g. avatarUrl) |

### Conversations — `/api/v1/conversations`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✅ | Get all conversations for authenticated user |
| `POST` | `/` | ✅ | Create a new conversation (DM or group) |
| `GET` | `/:id` | ✅ | Get a single conversation by ID |
| `PATCH` | `/:id` | ✅ | Update conversation (name, icon) |
| `DELETE` | `/:id` | ✅ | Delete conversation |
| `POST` | `/:id/invite` | ✅ | Invite a user by email |
| `DELETE` | `/:id/members/:userId` | ✅ | Remove a member |

### Messages — `/api/v1/messages`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/:conversationId` | ✅ | Fetch paginated messages (Redis cache → MongoDB) |

### Invitations — `/api/v1/invitations`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✅ | Get all pending invitations for authenticated user |
| `PATCH` | `/:id` | ✅ | Accept or reject `{ action: 'accept' | 'reject' }` |

### Notifications — `/api/v1/notifications`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✅ | Get all notifications |
| `PATCH` | `/:id/read` | ✅ | Mark notification as read |

### Upload — `/api/v1/upload`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/` | ✅ | Upload file to S3, returns URL |

### Health — `/health`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | MongoDB + Redis connection status |

---

## 📡 Socket.io Events Reference

### Client → Server (Emit)

| Event | Payload | Description |
|---|---|---|
| `message:send` | `{ conversationId, text, attachments?, replyTo?, tempId }` | Send a message |
| `message:edit` | `{ messageId, text }` | Edit message text |
| `message:delete` | `{ messageId }` | Soft-delete a message |
| `message:read` | `{ conversationId }` | Mark conversation as read |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `heartbeat` | — | Refresh online presence TTL (every 20s) |
| `conversation:join` | `{ conversationId }` | Join a Socket.io room |
| `conversation:leave` | `{ conversationId }` | Leave a Socket.io room |
| `presence:get` | `{ userIds: string[] }` | Batch fetch presence status |

### Server → Client (Listen)

| Event | Payload | Description |
|---|---|---|
| `message:new` | `{ message, tempId }` | New message broadcast |
| `message:edited` | `{ messageId, text, conversationId }` | Message was edited |
| `message:deleted` | `{ messageId, conversationId }` | Message was soft-deleted |
| `message:read` | `{ userId, conversationId, lastReadAt }` | User read a conversation |
| `typing:update` | `{ typers: string[] }` | Active typers list |
| `conversation:updated` | `{ conversation }` | Conversation metadata changed |
| `conversation:deleted` | `{ conversationId }` | Conversation was deleted |
| `invitation:new` | `{ invitation }` | New invitation received |
| `notification:new` | `{ notification }` | New in-app notification |
| `presence:snapshot` | `{ presenceMap }` | Batch presence response |
| `presence:changed` | `{ userId, status, lastSeen }` | User came online/offline |
| `error` | `{ event, message }` | Socket error for a specific event |

---

## 🗃 Data Models

### User
```js
{ username, email, password (hashed), avatarUrl, isVerified, twoFactorEnabled, createdAt }
```

### Conversation
```js
{
  name, icon,
  isGroup,          // true = group chat, false = DM
  createdBy,        // ObjectId → User
  members: [{
    userId,         // ObjectId → User
    role,           // 'owner' | 'admin' | 'moderator' | 'member'
    joinedAt,
    lastReadAt,     // Unread cursor
  }],
  lastMessage,      // ObjectId → Message
  lastActivityAt,   // Drives sidebar sort order
}
```

### Message
```js
{
  conversationId, sender,
  text,
  attachments: [{ type, url, filename, mimeType, size }],  // S3 URLs
  replyTo,          // ObjectId → Message
  status,           // 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  isEdited,
  isDeleted,        // Soft delete
  deletedAt,
  readBy: [{ userId, readAt }],
  deliveredTo: [{ userId, deliveredAt }],
}
```

### Invitation
```js
{
  conversationId, invitedBy,
  invitedUserId,    // null if email not registered
  invitedEmail,
  message,          // Optional personal note
  status,           // 'pending' | 'accepted' | 'rejected' | 'expired'
  respondedAt,
  expiresAt,        // +7 days from creation
}
```

---

## 🔑 Environment Variables

Create `server/.env` from the template below:

```env
# ─── Server ───────────────────────────────────────────────
PORT=4000
NODE_ENV=development

# ─── MongoDB ──────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017/chat-service

# ─── Redis ────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=              # Leave blank for local dev

# ─── JWT ──────────────────────────────────────────────────
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# ─── AWS S3 ───────────────────────────────────────────────
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=your-s3-bucket-name

# ─── Brevo (Transactional Email) ──────────────────────────
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Chat Service

# ─── Client URL (for invitation deep links) ───────────────
CLIENT_URL=http://localhost:5173
```

---

## 🚀 Local Development

### Prerequisites

- Node.js v20+
- Docker & Docker Compose (for Redis)

### 1. Clone & Install

```bash
git clone https://github.com/IndSumit07/Chat-Module-Assignment-Seed-Startup-.git
cd "Chat Service"

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 2. Configure Environment

```bash
# Copy and fill in your values
cp server/.env.example server/.env
```

### 3. Start Redis (via Docker)

```bash
# From the project root
docker compose up redis -d
```

### 4. Start the Server

```bash
cd server
npm run dev        # nodemon — auto-restarts on file changes
```

Server starts at `http://localhost:4000`

### 5. Start the Client

```bash
cd client
npm run dev        # Vite dev server with HMR
```

Client starts at `http://localhost:5173`

### Health Check

```bash
curl http://localhost:4000/health
# Expected: { "status": "OK", "services": { "mongodb": "connected", "redis": "ready" } }
```

---

## 🚢 Deployment Guide

### Option A: Docker Compose (Self-Hosted / VPS)

This is the simplest full-stack deployment. The `docker-compose.yml` in the project root manages Redis and the server container.

#### Step 1 — Prepare the Server `.env`

Ensure `server/.env` has all required production values (see [Environment Variables](#-environment-variables)).

Set the following for production:
```env
NODE_ENV=production
CLIENT_URL=https://your-frontend-domain.com
```

#### Step 2 — Build & Start

```bash
# From the project root
docker compose up --build -d
```

This will:
- Pull `redis:7-alpine` and start it with AOF persistence
- Build the server image from `server/Dockerfile` (Node 20 Alpine)
- Start the server on host port **5000** (mapped to container port 4000)

#### Step 3 — Verify

```bash
docker compose ps          # Check both containers are "Up"
curl http://localhost:5000/health
docker compose logs server  # Tail server logs
```

#### Step 4 — Nginx Reverse Proxy (Recommended)

Place Nginx in front to handle SSL termination:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;

        # Required for Socket.io WebSocket upgrades
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;  # Keep WebSocket connections alive
    }
}
```

---

### Option B: Render (Server) + Vercel (Client) — Recommended Cloud Setup

#### Deploy the Backend to Render

1. **Create a new Web Service** on [render.com](https://render.com)
2. Connect your GitHub repository
3. Configure the service:

   | Setting | Value |
   |---|---|
   | **Root Directory** | `server` |
   | **Environment** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Starter (or higher) |

4. **Add Redis**: Create a new **Redis** instance on Render (or use [Upstash](https://upstash.com) for a free serverless Redis)

5. **Set Environment Variables** in the Render dashboard — add all variables from the `.env` template:
   - Set `REDIS_HOST` and `REDIS_PORT` to your Render Redis values
   - Set `NODE_ENV=production`
   - Set `CLIENT_URL` to your Vercel deployment URL (e.g. `https://chat-service.vercel.app`)

6. **Deploy** — Render will build and start the server automatically on every push to `main`

#### Deploy the Frontend to Vercel

1. Import your repository at [vercel.com](https://vercel.com)
2. Configure the project:

   | Setting | Value |
   |---|---|
   | **Root Directory** | `client` |
   | **Framework Preset** | `Vite` |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

3. **Set Environment Variable**:
   ```
   VITE_API_BASE_URL=https://your-render-service.onrender.com
   ```

4. The `client/vercel.json` already contains the SPA rewrite rule:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
   ```
   This ensures React Router handles all client-side routes correctly.

5. **Deploy** — Vercel auto-deploys on every push to `main`

---

### Option C: Manual VPS Deployment (PM2)

For production on a bare Ubuntu/Debian server without Docker:

#### Step 1 — Install Prerequisites

```bash
# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server && sudo systemctl start redis-server

# PM2 process manager
npm install -g pm2
```

#### Step 2 — Clone & Install

```bash
git clone https://github.com/IndSumit07/Chat-Module-Assignment-Seed-Startup-.git /var/www/chat-service
cd /var/www/chat-service/server
npm ci --only=production
```

#### Step 3 — Configure Environment

```bash
cp .env.example .env
nano .env    # Fill in all production values
```

#### Step 4 — Start with PM2

```bash
pm2 start server.js --name chat-server
pm2 save
pm2 startup   # Enable PM2 to survive reboots
```

#### Step 5 — Deploy the Client

```bash
cd /var/www/chat-service/client
npm ci
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
```

Serve the `dist/` folder with Nginx:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/chat-service/client/dist;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

### 🔒 Production Checklist

Before going live, verify the following:

- [ ] `NODE_ENV=production` is set on the server
- [ ] `JWT_SECRET` is a long, random, unique string (min 32 chars)
- [ ] `CLIENT_URL` matches the exact frontend origin (no trailing slash)
- [ ] MongoDB is secured with authentication and not publicly accessible
- [ ] Redis is bound to localhost or secured with a password (`REDIS_PASSWORD`)
- [ ] AWS S3 bucket has CORS configured to allow your frontend origin
- [ ] AWS IAM user has **only** `s3:PutObject` and `s3:GetObject` permissions on the target bucket
- [ ] SSL/TLS is enabled on all public endpoints (HTTPS + WSS)
- [ ] Nginx `proxy_read_timeout` is set high enough for WebSocket connections
- [ ] Brevo sender email is verified/domain-authenticated to avoid spam filters

---

## 🐳 Docker Reference

```bash
# Start everything (Redis + Server)
docker compose up -d

# View logs
docker compose logs -f server
docker compose logs -f redis

# Stop everything
docker compose down

# Rebuild after code changes
docker compose up --build -d

# Open a Redis CLI session
docker exec -it chat-redis redis-cli
```

**`server/Dockerfile` summary:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production    # Production deps only
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
```

**`docker-compose.yml` services:**
- `redis`: `redis:7-alpine` with AOF persistence, mapped to host port `6379`
- `server`: Built from `./server/Dockerfile`, mapped to host port `5000` → container `4000`
