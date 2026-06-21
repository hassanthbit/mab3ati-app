import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Product, Customer, Invoice } from './models.js';
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// استضافة ملفات الواجهة الأمامية
app.use(express.static(path.join(__dirname, '../frontend')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sales_app';

// ── DB Connect ────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ── Auth Middleware ───────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.ownerId) req.user.ownerId = req.user.id;
    next();
  } catch {
    res.status(401).json({ error: 'انتهت الجلسة' });
  }
}

function adminAuth(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحيات مدير مطلوبة' });
  next();
}

// ══════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════

// GET /api/auth/setup-status
app.get('/api/auth/setup-status', async (req, res) => {
  const count = await User.countDocuments();
  res.json({ hasUsers: count > 0 });
});

// POST /api/auth/register (Only for first admin setup)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, fullName } = req.body;
    if (!username || !password || !fullName)
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ error: 'تم إنشاء حساب المدير مسبقاً.' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim().toLowerCase(),
      password: hashed,
      fullName: fullName.trim(),
      role: 'admin',
    });
    
    user.ownerId = user._id;
    await user.save();

    const token = jwt.sign({ id: user._id, ownerId: user.ownerId, username: user.username, fullName: user.fullName, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.trim().toLowerCase() });
    if (!user) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

    if (!user.ownerId) {
      user.ownerId = user._id; // Backward compatibility for first user
      user.role = 'admin';
      await user.save();
    }

    const token = jwt.sign({ id: user._id, ownerId: user.ownerId, username: user.username, fullName: user.fullName, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// USERS MANAGEMENT (Admin Only)
// ══════════════════════════════════════════
app.get('/api/users', auth, adminAuth, async (req, res) => {
  const users = await User.find({ ownerId: req.user.ownerId }).select('-password');
  res.json(users);
});

app.post('/api/users', auth, adminAuth, async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    if (!username || !password || !fullName) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير' });
    
    const exists = await User.findOne({ username: username.trim().toLowerCase() });
    if (exists) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim().toLowerCase(),
      password: hashed,
      fullName: fullName.trim(),
      role: role || 'user',
      ownerId: req.user.ownerId
    });
    res.json({ id: user._id, username: user.username, fullName: user.fullName, role: user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminAuth, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الشخصي' });
  await User.deleteOne({ _id: req.params.id, ownerId: req.user.ownerId });
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════
app.get('/api/products', auth, async (req, res) => {
  const prods = await Product.find({ user: req.user.ownerId }).sort({ createdAt: -1 });
  res.json(prods);
});

app.post('/api/products', auth, async (req, res) => {
  try {
    const p = await Product.create({ ...req.body, user: req.user.ownerId });
    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/products/:id', auth, async (req, res) => {
  try {
    const p = await Product.findOneAndUpdate({ _id: req.params.id, user: req.user.ownerId }, req.body, { new: true });
    if (!p) return res.status(404).json({ error: 'غير موجود' });
    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  await Product.deleteOne({ _id: req.params.id, user: req.user.ownerId });
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════
app.get('/api/customers', auth, async (req, res) => {
  const customers = await Customer.find({ user: req.user.ownerId }).sort({ createdAt: -1 });
  res.json(customers);
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    const c = await Customer.create({ ...req.body, user: req.user.ownerId });
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const c = await Customer.findOneAndUpdate({ _id: req.params.id, user: req.user.ownerId }, req.body, { new: true });
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  await Customer.deleteOne({ _id: req.params.id, user: req.user.ownerId });
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════
app.get('/api/invoices', auth, async (req, res) => {
  const invs = await Invoice.find({ user: req.user.ownerId }).sort({ createdAt: -1 });
  res.json(invs);
});

app.post('/api/invoices', auth, async (req, res) => {
  try {
    const { customerName, customerPhone, products, total, paid, notes } = req.body;
    const remaining = Math.max(0, total - (paid || 0));
    const payments = paid > 0 ? [{ amount: paid, note: 'دفعة أولى', date: new Date() }] : [];

    let totalProfit = 0;
    const enrichedProducts = await Promise.all(products.map(async (line) => {
      let costPrice = line.costPrice || 0;
      if (line.productId && !costPrice) {
        const prod = await Product.findById(line.productId);
        if (prod) costPrice = prod.costPrice || 0;
      }
      const lineProfit = (line.unitPrice - costPrice) * line.qty;
      totalProfit += lineProfit;
      return { ...line, costPrice, profit: lineProfit };
    }));

    const inv = await Invoice.create({
      user: req.user.ownerId,
      customerName, customerPhone, products: enrichedProducts, total,
      totalProfit, paid: paid || 0, remaining, notes, payments
    });

    for (const line of products) {
      if (line.productId) {
        await Product.findOneAndUpdate(
          { _id: line.productId, user: req.user.ownerId },
          { $inc: { qty: -line.qty } }
        );
      }
    }

    let cust = await Customer.findOne({ user: req.user.ownerId, name: { $regex: new RegExp('^' + customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
    if (!cust) {
      await Customer.create({ user: req.user.ownerId, name: customerName, phone: customerPhone || '' });
    } else if (customerPhone && !cust.phone) {
      cust.phone = customerPhone;
      await cust.save();
    }

    res.json(inv);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/invoices/:id/pay', auth, async (req, res) => {
  try {
    const { amount, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'أدخل مبلغاً صحيحاً' });

    const inv = await Invoice.findOne({ _id: req.params.id, user: req.user.ownerId });
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

    inv.paid += amount;
    inv.remaining = Math.max(0, inv.total - inv.paid);
    inv.payments.push({ amount, note: note || '', date: new Date() });
    await inv.save();

    res.json(inv);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/invoices/:id', auth, async (req, res) => {
  try {
    const { customerName, customerPhone, products, total, paid, notes } = req.body;
    const inv = await Invoice.findOne({ _id: req.params.id, user: req.user.ownerId });
    if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

    // إرجاع المخزون القديم
    for (const line of (inv.products || [])) {
      if (line.productId) {
        await Product.findOneAndUpdate(
          { _id: line.productId, user: req.user.ownerId },
          { $inc: { qty: line.qty } }
        );
      }
    }

    // حساب الأرباح وخصم المخزون الجديد
    let totalProfit = 0;
    const enrichedProducts = await Promise.all((products || []).map(async (line) => {
      let costPrice = line.costPrice || 0;
      if (line.productId && !costPrice) {
        const prod = await Product.findById(line.productId);
        if (prod) costPrice = prod.costPrice || 0;
      }
      const lineProfit = (line.unitPrice - costPrice) * line.qty;
      totalProfit += lineProfit;
      return { ...line, costPrice, profit: lineProfit };
    }));

    // خصم المخزون الجديد
    for (const line of (products || [])) {
      if (line.productId) {
        await Product.findOneAndUpdate(
          { _id: line.productId, user: req.user.ownerId },
          { $inc: { qty: -line.qty } }
        );
      }
    }

    inv.customerName = customerName;
    inv.customerPhone = customerPhone || '';
    inv.products = enrichedProducts;
    inv.total = total;
    inv.totalProfit = totalProfit;
    inv.paid = paid || 0;
    inv.remaining = Math.max(0, total - (paid || 0));
    inv.notes = notes || '';
    inv.payments = inv.payments || [];
    await inv.save();

    res.json(inv);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/invoices/:id', auth, async (req, res) => {
  try {
    // إرجاع المخزون قبل الحذف
    const inv = await Invoice.findOne({ _id: req.params.id, user: req.user.ownerId });
    if (inv) {
      for (const line of (inv.products || [])) {
        if (line.productId) {
          await Product.findOneAndUpdate(
            { _id: line.productId, user: req.user.ownerId },
            { $inc: { qty: line.qty } }
          );
        }
      }
      await Invoice.deleteOne({ _id: req.params.id, user: req.user.ownerId });
    }
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Dashboard Stats ───────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
  const [invs, customers, products] = await Promise.all([
    Invoice.find({ user: req.user.ownerId }),
    Customer.countDocuments({ user: req.user.ownerId }),
    Product.find({ user: req.user.ownerId }),
  ]);
  res.json({
    totalSales:  invs.reduce((s, i) => s + i.total, 0),
    totalDebt:   invs.reduce((s, i) => s + i.remaining, 0),
    totalProfit: invs.reduce((s, i) => s + (i.totalProfit || 0), 0),
    invoiceCount: invs.length,
    customerCount: customers,
    lowStock: products.filter(p => p.qty <= p.minQty).length,
  });
});

async function sendTelegramMessage(url, message) {
  const endpoint = String(url || '').trim();
  if (!endpoint) throw new Error('رابط تيليغرام غير موجود');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message, message, content: message })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`فشل الإرسال (${response.status}): ${raw || 'خطأ غير معروف'}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

app.post('/api/telegram/send', auth, async (req, res) => {
  try {
    const { message, url } = req.body;
    if (!message || !url) return res.status(400).json({ error: 'الرابط والرسالة مطلوبة' });

    const result = await sendTelegramMessage(url, message);
    res.json({ success: true, message: 'تم الإرسال إلى تيليغرام', result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WhatsApp Bot Setup ───────────────────────────────────
import fs from 'fs';
let executablePath = undefined;
if (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
  executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
} else if (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')) {
  executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
} else if (fs.existsSync('C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe')) {
  executablePath = 'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe';
}

let waReady = false;
let waClient = null;

function normalizeWhatsAppPhone(phone) {
  if (!phone) return '';
  let clean = String(phone).trim().replace(/[^0-9+]/g, '');
  if (!clean) return '';
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (clean.startsWith('+')) clean = clean.slice(1);
  if (clean.startsWith('0')) clean = '964' + clean.slice(1);
  return clean.replace(/\D/g, '');
}

async function sendWhatsAppMessage(phone, message) {
  if (!waClient || !waReady) {
    throw new Error('بوت الواتساب غير متصل بالسيرفر أو تم تعطيله مؤقتاً');
  }

  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) {
    throw new Error('رقم الهاتف غير صالح');
  }

  const candidates = [];
  try {
    const resolved = await waClient.getNumberId(cleanPhone);
    if (resolved?._serialized) candidates.push(resolved._serialized);
    if (resolved?.user) candidates.push(`${resolved.user}@s.whatsapp.net`);
  } catch (e) {
    console.warn('⚠️ تعذر حل رقم واتساب:', e.message);
  }

  candidates.push(`${cleanPhone}@c.us`, `${cleanPhone}@s.whatsapp.net`, cleanPhone);
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  let lastError = null;
  for (const chatId of uniqueCandidates) {
    try {
      await waClient.sendMessage(chatId, message);
      return { success: true, chatId };
    } catch (error) {
      lastError = error;
      if (!/LID|lid/i.test(error.message)) {
        break;
      }
    }
  }

  throw lastError || new Error('فشل إرسال الرسالة عبر الواتساب');
}

if (ENABLE_WHATSAPP) {
  const waSessionDir = path.join(__dirname, '.wwebjs_auth');
  const waClientId = process.env.WA_CLIENT_ID || `sales-app-${process.env.PORT || 3001}`;
  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: waSessionDir, clientId: waClientId }),
    puppeteer: { 
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
  });

  waClient.on('qr', (qr) => {
    console.log('\n======================================');
    console.log('📸 امسح كود الـ QR لربط الواتساب بالسيرفر');
    console.log('======================================\n');
    qrcode.generate(qr, { small: true });
  });

  waClient.on('ready', () => {
    console.log('✅ تم تفعيل بوت الواتساب وارتباطه بنجاح!');
    waReady = true;
  });

  waClient.on('disconnected', () => {
    console.log('❌ انقطع اتصال الواتساب.');
    waReady = false;
  });

  waClient.on('auth_failure', (msg) => {
    console.log('⚠️ فشل مصادقة واتساب:', msg);
    waReady = false;
  });

  waClient.initialize().catch((e) => {
    console.log('⚠️ لم يتمكن من بدء الواتساب:', e.message);
  });
} else {
  console.log('ℹ️ تم تعطيل تشغيل واتساب من خلال متغير البيئة ENABLE_WHATSAPP=false');
}

// ── WhatsApp Send API ───────────────────────────────────
app.post('/api/whatsapp/send', auth, async (req, res) => {
  try {
    if (!ENABLE_WHATSAPP) {
      return res.status(400).json({ error: 'تم تعطيل واتساب مؤقتاً' });
    }

    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'رقم الهاتف والرسالة مطلوبة' });
    }

    const result = await sendWhatsAppMessage(phone, message);
    res.json({ success: true, message: 'تم الإرسال بنجاح', chatId: result.chatId });
  } catch (error) {
    res.status(500).json({ error: 'فشل إرسال الرسالة عبر الواتساب: ' + error.message });
  }
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

function startServer(port, host) {
  const server = app.listen(port, host, () => console.log(`🚀 Server running on ${host}:${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      if (nextPort <= port + 5) {
        console.warn(`⚠️ Port ${port} is busy, trying ${nextPort}...`);
        server.close(() => startServer(nextPort, host));
        return;
      }
    }
    console.error('❌ Server failed to start:', err);
    process.exit(1);
  });
}

startServer(PORT, HOST);
