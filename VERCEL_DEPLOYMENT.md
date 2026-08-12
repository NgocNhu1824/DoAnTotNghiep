# Vercel Deployment Guide - Frontend

## Prerequisites
- Vercel account (https://vercel.com - sign up with GitHub)
- GitHub repository pushed
- Backend deployed on Railway: `https://doantotnghiep-production-c6b5.up.railway.app`

---

## Step 1: Commit và Push code

```bash
# Đảm bảo đang ở nhánh main
git checkout main

# Nếu chưa merge dev vào main
git merge dev

# Add và commit
git add .
git commit -m "chore: add Vercel deployment config"

# Push lên GitHub
git push origin main
```

---

## Step 2: Import Project vào Vercel

### 2.1. Đăng nhập Vercel
1. Truy cập: https://vercel.com
2. Click **"Sign Up"** hoặc **"Log in"**
3. Chọn **"Continue with GitHub"**
4. Authorize Vercel access to GitHub

### 2.2. Import Repository
1. Click **"Add New..."** → **"Project"**
2. Chọn repository **"DoAnTotNghiep"**
3. Click **"Import"**

### 2.3. Configure Project
Vercel sẽ hiển thị màn hình config:

**Framework Preset:** `Create React App` (auto-detect)

**Root Directory:** 
- Click **"Edit"**
- Chọn: `frontend`
- Click **"Continue"**

**Build Settings:**
- Build Command: `npm run build` ✅ (auto)
- Output Directory: `build` ✅ (auto)
- Install Command: `npm install` ✅ (auto)

---

## Step 3: Add Environment Variables

Trong phần **"Environment Variables"**, thêm 2 biến:

### Variable 1:
```
Name:  REACT_APP_API_URL
Value: https://doantotnghiep-production-c6b5.up.railway.app/api
```

### Variable 2:
```
Name:  REACT_APP_WS_URL
Value: https://doantotnghiep-production-c6b5.up.railway.app
```

**Lưu ý:** Bỏ dấu `/` cuối URL!

---

## Step 4: Deploy

1. Click **"Deploy"**
2. Đợi 2-3 phút để Vercel build và deploy
3. Sau khi xong, Vercel sẽ tạo domain:
   ```
   https://do-an-tot-nghiep.vercel.app
   ```
   hoặc tương tự

---

## Step 5: Update Backend CORS

Sau khi có frontend URL từ Vercel, cần cập nhật Railway backend:

1. Vào **Railway Dashboard** → project backend
2. Tab **"Variables"**
3. Sửa biến `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://your-frontend-url.vercel.app
   ```
4. Lưu → Railway sẽ tự động redeploy

---

## Step 6: Update Google OAuth

1. Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Chọn OAuth 2.0 Client ID
3. Thêm vào **Authorized JavaScript origins**:
   ```
   https://your-frontend-url.vercel.app
   ```
4. Thêm vào **Authorized redirect URIs**:
   ```
   https://your-frontend-url.vercel.app/auth/callback
   https://doantotnghiep-production-c6b5.up.railway.app/api/auth/google/callback
   ```
5. Save

---

## Step 7: Test Frontend

1. Truy cập frontend URL: `https://your-app.vercel.app`
2. Test login với Google
3. Test các features

---

## Auto Deploy

Vercel tự động deploy khi có push mới lên branch `main`.

### Deploy Preview:
- Mỗi Pull Request sẽ có preview URL riêng
- Test trước khi merge

### Thay đổi branch deploy:
1. Project Settings → Git
2. Production Branch: chọn branch (main/production)

---

## Custom Domain (Optional)

### Thêm domain riêng:
1. Project Settings → Domains
2. Add Domain
3. Nhập domain của bạn (vd: `doantotnghiep.com`)
4. Cập nhật DNS theo hướng dẫn:
   - Type: `A`
   - Value: `76.76.21.21`
   - hoặc CNAME: `cname.vercel-dns.com`

---

## Environment Variables Management

### Update biến:
1. Project Settings → Environment Variables
2. Edit/Add/Delete variables
3. Redeploy để apply

### Biến cho từng environment:
- Production
- Preview (PR previews)
- Development

---

## Monitoring & Logs

### View Deployment Logs:
1. Deployments tab
2. Click vào deployment
3. Xem **"Building"** và **"Functions"** logs

### Analytics (nếu cần):
1. Analytics tab
2. Xem visitors, page views, performance

---

## Troubleshooting

### Build failed:
- Xem logs chi tiết
- Check dependencies trong package.json
- Verify Node version compatibility

### CORS errors:
- Verify `FRONTEND_URL` trong Railway backend
- Check backend CORS config trong main.ts

### Blank page:
- Check browser console cho errors
- Verify `REACT_APP_API_URL` đúng
- Check network tab để xem API calls

### 404 on refresh:
- File `vercel.json` đã có rewrite rules
- Nếu vẫn lỗi, check Output Directory = `build`

---

## Cost

### Free Tier includes:
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Unlimited preview deployments
- ✅ Custom domains
- ✅ Automatic HTTPS
- ✅ Edge Network (CDN)

**Đủ cho hầu hết dự án cá nhân và demo!**

---

## Quick Commands (Vercel CLI - Optional)

### Install CLI:
```bash
npm i -g vercel
```

### Deploy manually:
```bash
cd frontend
vercel
```

### Deploy to production:
```bash
vercel --prod
```

### View logs:
```bash
vercel logs
```

---

## Summary URLs

| Service | URL |
|---------|-----|
| **Backend** | https://doantotnghiep-production-c6b5.up.railway.app/api |
| **Frontend** | https://your-app.vercel.app (sau khi deploy) |
| **Google OAuth** | https://console.cloud.google.com/apis/credentials |

---

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Community: https://github.com/vercel/vercel/discussions
- Vercel Discord: https://vercel.com/discord
