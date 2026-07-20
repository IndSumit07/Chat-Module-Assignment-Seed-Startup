# Frontend Deployment Guide (Vercel)

This guide covers the step-by-step process of deploying the Chat Service frontend. We will use **Vercel**, which provides native support for Vite and React applications, along with built-in automated deployments (CI/CD) directly from your GitHub repository.

---

## 1. Preparing for Deployment

Before deploying, ensure your code is pushed to your GitHub repository and your frontend environment variables are ready.

1. Commit and push all your frontend changes to the `main` branch on GitHub:
   ```bash
   git add .
   git commit -m "Prepare for frontend deployment"
   git push origin main
   ```

2. Make sure you have your production backend API URL ready (e.g., `https://api.yourdomain.com`), as you will need to provide this to Vercel so the frontend knows where to connect.

---

## 2. Deploying on Vercel

Vercel makes deploying frontend applications incredibly simple. It will automatically detect Vite and configure the build settings for you.

### Steps:
1. **Log in to Vercel**: Go to [Vercel](https://vercel.com/) and log in using your GitHub account.
2. **Import Project**: Click the **Add New Project** button.
3. **Select Repository**: Find your Chat Service repository in the list and click **Import**.
4. **Configure Project Settings**:
   - **Project Name**: `chat-service-client` (or whatever you prefer)
   - **Framework Preset**: Vercel should auto-detect **Vite**. If not, select it from the dropdown.
   - **Root Directory**: Click `Edit` and select the **`client`** folder. *(This is extremely important since your repo has both client and server folders!)*
5. **Build and Output Settings** (These should be auto-filled by Vite):
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
6. **Environment Variables**:
   - Expand the "Environment Variables" section.
   - Add your production variables. For example:
     - **Name**: `VITE_API_URL`
     - **Value**: `https://api.yourdomain.com` (Your EC2 backend URL)
7. **Deploy**: Click the **Deploy** button. Vercel will now install dependencies, build your Vite app, and publish it to a live URL.

---

## 3. Automated Deployment (CI/CD)

One of the biggest advantages of using Vercel is its native GitHub integration, which eliminates the need to write custom GitHub Actions workflows for the frontend.

### How it works automatically:
1. **Push to GitHub**: Whenever you make changes to your frontend code and push them to the `main` branch on GitHub, Vercel is immediately notified via webhooks.
2. **Automatic Rebuild**: Vercel automatically starts a new deployment, running your build command (`npm run build`).
3. **Zero-Downtime Release**: Once the build succeeds, Vercel instantly swaps the old version with the new version. Your users will never experience downtime.

### Preview Deployments (Optional but recommended):
If you open a Pull Request in your GitHub repository, Vercel will automatically generate a temporary "Preview URL". This allows you to test your frontend changes in a live environment before merging them into the `main` branch. 

*(Note: Because Vercel handles all of this natively through its GitHub app integration, you do **not** need to create a `.github/workflows` YAML file for the frontend!)*
