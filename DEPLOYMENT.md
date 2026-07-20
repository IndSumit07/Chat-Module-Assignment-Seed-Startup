# Deployment Guide (EC2 & Vercel)

This guide covers the step-by-step process of deploying the Chat Service. The frontend will be deployed on Vercel with automatic CI/CD, and the backend will be deployed on an AWS EC2 instance using **Docker Compose** and **Nginx** as a reverse proxy, along with a GitHub Actions workflow for auto-sync.

---

## 1. Frontend Deployment (Vercel)

Vercel provides native support for Vite and React apps with built-in CI/CD.

### Steps:
1. Push your entire repository to GitHub.
2. Log in to [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. **Configure the Project**:
   - **Framework Preset**: Vite
   - **Root Directory**: `client` *(Important! Edit this to point to the client folder)*.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**: Add your frontend environment variables (e.g., `VITE_API_URL` pointing to `https://api.yourdomain.com`).
6. Click **Deploy**. Vercel will automatically sync and redeploy whenever you push to the `main` branch.

---

## 2. Backend Deployment (AWS EC2)

We will set up an EC2 instance (Ubuntu), install Docker and Nginx, and run the Node.js server alongside Redis in a Docker Compose network. Nginx will handle SSL and route external traffic to the Docker container.

### A. Server Setup & Dependencies
1. Launch an EC2 instance (Ubuntu 22.04/24.04 LTS).
2. Configure Security Group: Open ports **22 (SSH)**, **80 (HTTP)**, and **443 (HTTPS)**.
3. SSH into your instance:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```
4. Install Nginx and Docker:
   ```bash
   # Update packages
   sudo apt update && sudo apt upgrade -y

   # Install Nginx
   sudo apt install nginx -y

   # Install Docker and Docker Compose
   sudo apt install docker.io docker-compose-v2 -y
   sudo systemctl enable docker
   sudo systemctl start docker
   sudo usermod -aG docker ubuntu
   ```
   *(Note: You may need to log out and log back in for the `docker` group changes to take effect).*

### B. Setup the Backend Application
1. Clone your repository on the EC2 instance:
   ```bash
   git clone https://github.com/yourusername/your-repo.git
   cd your-repo
   ```
2. Create your server `.env` file:
   ```bash
   nano server/.env
   # Add all your production environment variables 
   # (MongoDB URI, JWT Secret, Brevo, AWS S3 keys, etc.)
   ```

### C. Running with Docker Compose
To build the server image and run both Redis and the Node API in detached mode:
```bash
docker compose up -d --build
```
This will expose the API internally on port `5000`.

### D. Nginx Reverse Proxy & SSL
Configure Nginx to listen to your custom API domain and proxy requests (including WebSockets) to the Docker container running on port `5000`.

1. Create a new Nginx configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/chat-api
   ```
2. Add the following config (replace `api.yourdomain.com` with your domain):
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/chat-api /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
4. Install Certbot and secure with SSL (HTTPS):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d api.yourdomain.com
   ```

---

## 3. Auto-Sync (CI/CD) with GitHub Actions

To automatically deploy the backend to EC2 when you push to the `main` branch, we use a GitHub Actions workflow.

### A. Create Deployment Script on EC2
On your EC2 instance, create a script that pulls the latest code and rebuilds the containers:
```bash
nano /home/ubuntu/deploy.sh
```
Add the following content:
```bash
#!/bin/bash
cd /home/ubuntu/your-repo
git pull origin main
docker compose up -d --build
```
Make it executable:
```bash
chmod +x /home/ubuntu/deploy.sh
```

### B. Add GitHub Secrets
Go to your GitHub Repository -> **Settings -> Secrets and variables -> Actions**. Add:
- `EC2_HOST`: Your EC2 public IP or domain.
- `EC2_USERNAME`: `ubuntu`
- `EC2_SSH_KEY`: The contents of your `.pem` private key file.

### C. GitHub Actions Workflow
The project includes a `.github/workflows/deploy.yml` file that triggers deployment whenever changes are pushed to the `server/` directory or `docker-compose.yml`.

With this setup:
1. Every time you push changes affecting the `client/` directory, **Vercel** will automatically rebuild and deploy.
2. Every time you push changes affecting the backend, **GitHub Actions** will securely SSH into your EC2 instance, pull the latest code, and seamlessly rebuild and restart your Docker containers.
