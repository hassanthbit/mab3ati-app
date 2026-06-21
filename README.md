# مبيعاتي — نظام إدارة المبيعات

تطبيق احترافي لإدارة المبيعات والفواتير والديون مرتبط بـ MongoDB Atlas.

---

## 🗂️ هيكل المشروع

```
sales-app/
├── backend/
│   ├── server.js        ← خادم Express مع جميع API routes
│   ├── models.js        ← نماذج MongoDB (User, Product, Customer, Invoice)
│   ├── package.json
│   └── .env.example     ← نسخ إلى .env وعدّل القيم
│
└── frontend/
    └── index.html       ← التطبيق كاملاً (ملف واحد)
```

---

## ⚡ طريقة التشغيل

### 1. إعداد MongoDB Atlas (مجاناً)

1. افتح [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. أنشئ حساباً ومشروعاً جديداً
3. أنشئ Cluster مجاني (M0 Free Tier)
4. من **Database Access** أضف مستخدم قاعدة البيانات
5. من **Network Access** أضف `0.0.0.0/0` (أو IP الخادم)
6. من **Connect** اختر "Connect your application" وانسخ رابط الاتصال

### 2. إعداد الـ Backend

```bash
cd backend

# انسخ ملف الإعدادات
cp .env.example .env
```

عدّل ملف `.env`:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sales_app
JWT_SECRET=اكتب-مفتاح-سري-طويل-هنا-2024
PORT=3001
```

```bash
# ثبّت الحزم
npm install

# شغّل الخادم
npm start
```

ستظهر رسالة:
```
✅ Connected to MongoDB
🚀 Server running on port 3001
```

### 3. تشغيل الـ Frontend

افتح ملف `frontend/index.html` في أي متصفح.

> إذا كان الـ Backend على سيرفر آخر، عدّل هذا السطر في `index.html`:
> ```js
> const API_URL = 'http://localhost:3001/api';
> // غيّره إلى:
> const API_URL = 'https://your-server.com/api';
> ```

---

## 🌐 النشر على الإنترنت

### Backend — خيارات مجانية:
- **Render.com** — الأسهل (اسحب المجلد وشغّل)
- **Railway.app** — سريع ومجاني
- **Heroku** — الكلاسيكي

### Frontend:
- **Netlify** أو **Vercel** — ارفع `frontend/index.html` مباشرةً
- أو ضعه في مجلد `public` داخل Backend وأضف هذا السطر في `server.js`:
  ```js
  import { fileURLToPath } from 'url';
  import { dirname, join } from 'path';
  const __dirname = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(join(__dirname, '../frontend')));
  ```

---

## 📋 الـ API Endpoints

| Method | Path | الوصف |
|--------|------|-------|
| POST | `/api/auth/register` | إنشاء حساب |
| POST | `/api/auth/login` | تسجيل الدخول |
| GET | `/api/products` | جلب المنتجات |
| POST | `/api/products` | إضافة منتج |
| PUT | `/api/products/:id` | تعديل منتج |
| DELETE | `/api/products/:id` | حذف منتج |
| GET | `/api/customers` | جلب العملاء |
| POST | `/api/customers` | إضافة عميل |
| GET | `/api/invoices` | جلب الفواتير |
| POST | `/api/invoices` | إنشاء فاتورة |
| POST | `/api/invoices/:id/pay` | تسجيل دفعة |
| GET | `/api/stats` | إحصائيات لوحة التحكم |

---

## ✨ المزايا

- ✅ تسجيل دخول / إنشاء حساب حقيقي مع JWT
- ✅ كل مستخدم يرى بياناته فقط
- ✅ MongoDB Atlas للتخزين السحابي
- ✅ إنشاء فواتير مع خصم المخزون تلقائياً
- ✅ تتبع الديون وتسجيل الدفعات
- ✅ واجهة عربية RTL احترافية
- ✅ يعمل على الجوال والكمبيوتر
