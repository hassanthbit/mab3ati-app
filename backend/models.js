import mongoose from 'mongoose';

// ── User ──────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true, minlength: 3 },
  password:  { type: String, required: true, minlength: 6 },
  fullName:  { type: String, required: true, trim: true },
  role:      { type: String, enum: ['admin', 'user'], default: 'user' },
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ── Product ───────────────────────────────────────────
const productSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:       { type: String, required: true, trim: true },
  price:      { type: Number, required: true, min: 0 },
  costPrice:  { type: Number, default: 0, min: 0 },
  qty:        { type: Number, default: 0, min: 0 },
  minQty:     { type: Number, default: 5 },
  unit:       { type: String, default: 'قطعة' },
  desc:       { type: String, default: '' },
}, { timestamps: true });

// ── Customer ──────────────────────────────────────────
const customerSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:    { type: String, required: true, trim: true },
  phone:   { type: String, default: '' },
  address: { type: String, default: '' },
  notes:   { type: String, default: '' },
}, { timestamps: true });

// ── Payment (sub-document) ────────────────────────────
const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note:   { type: String, default: '' },
  date:   { type: Date, default: Date.now },
});

// ── Invoice ───────────────────────────────────────────
const invoiceLineSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name:        { type: String, required: true },
  qty:         { type: Number, required: true },
  unitPrice:   { type: Number, required: true },
  costPrice:   { type: Number, default: 0 },
  total:       { type: Number, required: true },
  profit:      { type: Number, default: 0 },
});

const invoiceSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invoiceNum:   { type: String },
  customerName: { type: String, required: true },
  customerPhone:{ type: String, default: '' },
  products:     [invoiceLineSchema],
  total:        { type: Number, required: true },
  totalProfit:  { type: Number, default: 0 },
  paid:         { type: Number, default: 0 },
  remaining:    { type: Number, default: 0 },
  notes:        { type: String, default: '' },
  payments:     [paymentSchema],
}, { timestamps: true });

invoiceSchema.pre('save', async function(next) {
  if (!this.invoiceNum) {
    const count = await mongoose.model('Invoice').countDocuments({ user: this.user });
    this.invoiceNum = 'INV' + String(count + 1).padStart(4, '0');
  }
  next();
});

export const User     = mongoose.model('User',     userSchema);
export const Product  = mongoose.model('Product',  productSchema);
export const Customer = mongoose.model('Customer', customerSchema);
export const Invoice  = mongoose.model('Invoice',  invoiceSchema);
