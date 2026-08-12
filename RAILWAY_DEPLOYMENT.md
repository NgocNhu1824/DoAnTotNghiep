# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (https://railway.app)
- MongoDB Atlas account (hoặc database accessible từ internet)

## Step 1: Commit và Push code lên GitHub

```bash
# Đảm bảo bạn đang ở nhánh main
git checkout main

# Nếu chưa merge dev vào main
git merge dev

# Push lên GitHub
git push origin main
```

## Step 2: Deploy trên Railway

### 2.1. Tạo Project mới
1. Đăng nhập vào https://railway.app
2. Click **"New Project"**
3. Chọn **"Deploy from GitHub repo"**
4. Authorize Railway access to GitHub
5. Chọn repository **DoAnTotNghiep**
6. Railway sẽ tự động detect và deploy

### 2.2. Configure Root Directory
Vì backend ở trong folder `backendAPI`:
1. Vào **Settings** → **General**
2. Tìm **"Root Directory"**
3. Set value: `backendAPI`
4. Click **"Save"**

### 2.3. Set Environment Variables
Vào **Variables** tab và thêm các biến sau:

```env
NODE_ENV=production
PORT=3000

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-production-jwt-secret-key-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-production-refresh-secret-key-min-32-chars
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-app.railway.app/api/auth/google/callback

# Frontend URL
FRONTEND_URL=https://your-frontend-url.com

# System Settings
MAX_OVERDUE_MINUTES=15
AUTO_UNLOCK_BEFORE_CLASS=5
NOTIFICATION_BEFORE_CLASS=30
```

### 2.4. Generate Domain
1. Vào **Settings** → **Networking**
2. Click **"Generate Domain"**
3. Railway sẽ tạo domain dạng: `your-app.railway.app`
4. Copy URL này để cập nhật `GOOGLE_CALLBACK_URL` và thông báo cho frontend

## Step 3: Update Google OAuth Callback

1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project OAuth của bạn
3. APIs & Services → Credentials
4. Click vào OAuth 2.0 Client ID
5. Thêm vào **Authorized redirect URIs**:
   ```
   https://your-app.railway.app/api/auth/google/callback
   ```
6. Save

## Step 4: Update Frontend Environment

Cập nhật file `.env` của frontend:
```env
REACT_APP_API_URL=https://your-app.railway.app/api
REACT_APP_WS_URL=https://your-app.railway.app
```

## Step 5: Verify Deployment

1. Click vào **Deployments** tab
2. Xem logs để đảm bảo deploy thành công
3. Test API endpoint: `https://your-app.railway.app/api`
4. Test health check (nếu có): `https://your-app.railway.app/api/health`

## Auto Deploy từ GitHub

Railway tự động deploy khi có push mới lên branch được config (mặc định là `main`).

### Thay đổi branch deploy:
1. Settings → **Deploy** section
2. **Branch**: chọn branch muốn deploy (main/dev/production)
3. Save

## Monitoring

- **Logs**: Xem real-time logs trong Railway dashboard
- **Metrics**: CPU, Memory, Network usage
- **Uptime**: Railway tự động restart nếu app crash

## Troubleshooting

### App không start được:
- Kiểm tra logs trong Deployments tab
- Verify environment variables
- Ensure MongoDB connection string đúng và accessible

### Port issues:
- Railway tự động assign PORT, app phải listen trên `process.env.PORT`
- Code hiện tại đã đúng: `const port = process.env.PORT || 3000;`

### Socket.IO không hoạt động:
- Đảm bảo frontend config đúng WebSocket URL
- Check CORS settings trong main.ts

## Cost

- **Free Tier**: $5 credit/month
- Sau khi hết credit: ~$5-10/month tùy usage
- No credit card required cho free tier

## Custom Domain (Optional)

1. Settings → Networking
2. Custom Domain section
3. Add your domain
4. Update DNS records theo hướng dẫn

---

## Quick Commands

### View Logs
```bash
railway logs
```

### Deploy manually
```bash
railway up
```

### Open app
```bash
railway open
```

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
