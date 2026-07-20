# Chat Service

A full-stack, real-time chat application built with modern web technologies, focusing on high performance, scalability, and an excellent user experience. 

## 🛠 Tech Stack

### Frontend (Client)
- **Framework**: React 19, Vite
- **Styling**: Tailwind CSS
- **Real-Time**: Socket.io-client
- **Routing**: React Router DOM
- **HTTP Client**: Axios
- **Icons**: Lucide React

### Backend (Server)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Real-Time**: Socket.io
- **Database**: MongoDB (Mongoose) for persistent storage
- **Cache & Message Broker**: Redis (ioredis) for caching, pub/sub, and rate limiting
- **Job Queue**: BullMQ for background tasks
- **Authentication**: JWT (JSON Web Tokens) & bcryptjs
- **File Storage**: AWS S3 (via Multer-S3) for media/attachments
- **Email Service**: Brevo for transactional emails (OTPs)

---

## ✨ Features
- **Real-Time Messaging**: Low-latency message delivery using WebSockets.
- **Optimistic UI**: Messages appear instantly for the sender before server confirmation.
- **Typing Indicators**: Real-time feedback when users are typing, managed efficiently via Redis.
- **Read Receipts & Unread Counts**: Track conversation unread counts and last-read timestamps.
- **Email Verification (OTP)**: Secure registration, login, and password resets using background email queues.
- **Media Attachments**: Secure file uploads to AWS S3.
- **Cross-Instance Pub/Sub**: Highly scalable real-time events that work across multiple server instances using Redis Pub/Sub.
- **Fully Responsive**: Mobile-first layout with a sidebar/chat drawer pattern — works seamlessly on phones, tablets, and desktops.

---

## 🏗 In-Depth Technical Architecture

### 1. Database Message Sync & Optimistic UI
The messaging architecture is designed to feel instantaneous to the user while guaranteeing data consistency and cross-instance delivery on the server.

* **Optimistic UI (Client)**: When a user sends a message, the client generates a `tempId` (UUID) and immediately displays the message in the UI. 
* **Persistence & Caching (Server)**: 
  - The server receives the `message:send` event with the `tempId`, verifies rate limits, and persists the message to MongoDB.
  - The message is prepended to a **Redis List** cache (`msgs:{convId}`) which keeps the hot cache of the 50 most recent messages for lightning-fast conversation loading (TTL: 30 mins).
  - Unread counts are incremented atomically in Redis (`unread:{userId}`) for offline or inactive members.
* **Pub/Sub Broadcast**: 
  - To support horizontal scaling (multiple Node.js instances), the server publishes the saved message and `tempId` to a Redis Pub/Sub channel (`chat:message:{convId}`).
  - A dedicated Redis subscriber connection on every server instance listens for these events and re-emits them to the corresponding Socket.io room (`io.to(convId).emit('message:new')`).
* **Reconciliation (Client)**: The sending client receives the broadcast, matches the `tempId`, and replaces the temporary local message with the official server-confirmed message (including its real database ID and timestamp).

### 2. Typing Indicator Mechanism (Redis Sorted Sets)
Tracking typing status efficiently without spamming the database or causing memory leaks is handled using **Redis Sorted Sets (ZSET)**.

* **Data Structure**: `typing:{conversationId}` (Sorted Set), where the **score** is the Unix timestamp (in milliseconds) of the last typing event, and the **value** is the `userId`.
* **Flow**:
  - `typing:start`: User is added to the ZSET with `score = Date.now()`. The key is given a 30-second TTL to prevent orphaned data.
  - `typing:stop`: User is explicitly removed from the ZSET using `ZREM`.
* **Lazy Pruning**: When fetching active typers, the server looks for entries within the last 5 seconds. Stale entries are immediately purged using `ZREMRANGEBYSCORE` before returning the active typers. This ensures the list is always accurate without requiring background cron jobs.

### 3. Email Queue System (BullMQ)
To prevent blocking the main Node.js event loop and to handle network failures gracefully, transactional emails (OTPs for login, registration, resets) are offloaded to background workers.

* **Queue Management**: Powered by **BullMQ** running on Redis. 
* **Worker**: A dedicated worker (`mail.worker.js`) listens to the email queue with a strict `concurrency: 5` limit. This protects the external API (Brevo) from rate limits during traffic spikes.
* **Templates**: Generates branded HTML emails dynamically based on the job payload (`purpose`, `otp`).
* **Resilience**: If the Brevo API fails, BullMQ automatically retries the job using an exponential backoff strategy, ensuring no OTPs are lost due to transient network issues.

---

## 📁 Project Structure

```text
Chat Service/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── api/            # Axios API client configurations
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React Contexts (Socket, Auth, etc.)
│   │   ├── hooks/          # Custom React hooks
│   │   └── pages/          # Route views
│   └── package.json        
└── server/                 # Node.js backend application
    ├── src/
    │   ├── configs/        # Env, Redis, DB, BullMQ, Brevo configurations
    │   ├── controllers/    # Express route handlers
    │   ├── models/         # Mongoose schemas (User, Message, Conversation)
    │   ├── routes/         # API routes
    │   ├── services/       # Core business logic & Cache management
    │   ├── sockets/        # Socket.io event handlers (chat, typing, presence)
    │   └── workers/        # BullMQ background processors
    └── package.json
```
