const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const db = require('./models');

const app = express();

// Force nodemon restart

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Ensure at least one admin exists for first-time setup
(async function ensureAdminUser() {
  try {
    // Keep both legacy and current admin fallback accounts for compatibility
    const requiredAdmins = [
      { name: 'Admin User', email: 'admin@company.local', password: 'admin123', role: 'admin', status: 'active' },
      { name: 'Admin Legacy', email: 'admin@vsms.com', password: 'admin123', role: 'admin', status: 'active' }
    ];

    for (const adminUser of requiredAdmins) {
      const existing = await db.User.findOne({ email: adminUser.email.toLowerCase() });
      if (!existing) {
        await db.User.create(adminUser);
        console.log(`Created admin user: ${adminUser.email} / ${adminUser.password}`);
      }
    }
  } catch (error) {
    console.error('Error ensuring admin users exist:', error);
  }
})();

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const PORT = process.env.PORT || 3000;

// serve frontend static files
app.use('/', express.static(path.resolve(__dirname, '..', 'frontend')));

const uploadDir = path.join(__dirname, '..', 'frontend', 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

app.use('/uploads', express.static(path.join(__dirname, '..', 'frontend', 'uploads')));

// Token generation helper
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware - validate session token
async function authMiddleware(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'No session token' });
  
  try {
    const session = await db.Session.findOne({ token, expiresAt: { $gt: new Date() } }).populate('userId');
    if (!session) return res.status(401).json({ error: 'Session has been Expired! Please login again.' });
    req.user = session.userId;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token validation failed' });
  }
}

// API routes
app.get('/api/services', async (req, res) => {
  try {
    const services = await db.Service.find();
    res.json(services);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/services', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Service title is required' });

    const service = await db.Service.create({
      title: title.trim(),
      description: description ? description.trim() : ''
    });
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/services/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const id = req.params.id;
    const service = await db.Service.findById(id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    await db.Service.deleteOne({ _id: id });
    res.json({ ok: true, message: 'Service deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const id = req.params.id;
    const user = await db.User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/users', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { name, email, password, role, status, phone, specialization } = req.body;
    if (!name || !email || !password || !role || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (role === 'technician' && !specialization) {
      return res.status(400).json({ error: 'Technician specialization is required' });
    }

    const existing = await db.User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : '';
    const user = await db.User.create({
      name,
      email,
      password,
      role,
      status: status || 'active',
      phone: phone || '',
      specialization: specialization || '',
      avatar: avatarPath
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone,
      specialization: user.specialization,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });

    // Send email with credentials
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Account Credentials - Car Service Management System',
        html: `
          <h3>Welcome to the Car Service Management System</h3>
          <p>Hello ${name},</p>
          <p>Your account has been created successfully. Below are your login credentials:</p>
          <ul>
            <li><strong>Email (ID):</strong> ${email}</li>
            <li><strong>Password:</strong> ${password}</li>
            <li><strong>Role:</strong> ${role}</li>
          </ul>
          <p>Please log in and change your password if needed.</p>
          <br>
          <p>Best regards,<br>CSMS Admin</p>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending credentials email:', error);
        } else {
          console.log('Credentials email sent:', info.response);
        }
      });
    } else {
      console.warn('EMAIL_USER or EMAIL_PASS not set in .env. Credentials email skipped.');
    }
    
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const changes = req.body;

    // Allow users to update their own profile, or allow admins to update any user
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only update your own profile' });
    }

    // Don't allow changing email or role unless admin
    if (req.user.role !== 'admin') {
      delete changes.email;
      delete changes.role;
      delete changes.status;
    }

    if (changes.email) {
      const existing = await db.User.findOne({ email: changes.email, _id: { $ne: id } });
      if (existing) return res.status(409).json({ error: 'Email already registered' });
    }

    if (changes.avatar === undefined) {
      delete changes.avatar;
    }

    const user = await db.User.findByIdAndUpdate(id, changes, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Avatar upload endpoint for profile
app.post('/api/users/:id/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const id = req.params.id;

    // Allow users to upload their own avatar, or allow admins to upload for any user
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only upload your own avatar' });
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    const user = await db.User.findByIdAndUpdate(id, { avatar: avatarPath }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const id = req.params.id;
    const user = await db.User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent admin from deleting own account
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete own admin account' });
    }

    await db.User.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// combined data endpoint used by frontend - users visible by role
app.get('/api/data', async (req, res) => {
  try {
    const users = await db.User.find().select('-password');
    const vehicles = await db.Vehicle.find();
    const contacts = await db.Contact.find();
    
    // Group users by role for role-wise visibility
    const usersByRole = {};
    users.forEach(user => {
      if (!usersByRole[user.role]) {
        usersByRole[user.role] = [];
      }
      usersByRole[user.role].push(user);
    });
    
    res.json({ users, usersByRole, vehicles, contacts });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// registration endpoint removed - user creation is restricted to Admin operations

app.post('/api/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const u = await db.User.findOne({ email });
    if (!u || u.password !== password) {
      console.warn('Login attempt failed for', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (u.status === 'inactive') {
      return res.status(403).json({ error: 'inactive' });
    }

    // Generate session token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Save session to DB
    await db.Session.create({ userId: u._id, token, expiresAt });

    const out = u.toObject();
    delete out.password;
    res.json({ user: out, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Get current user from session
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findById(req.user._id).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Global error handler for body parser and other middleware
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Avatar image is too large (max 1MB)' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  return res.status(400).json({ error: err.message || 'Server error' });
});

// Logout - invalidate session
app.post('/api/logout', authMiddleware, async (req, res) => {
  try {
    await db.Session.deleteOne({ token: req.token });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// vehicles - role-based visibility
app.get('/api/vehicles', authMiddleware, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'guard') {
      // Non-admin guard users see only their own vehicles, including legacy records saved without user IDs
      query = {
        $or: [
          { createdByUserId: req.user._id },
          { createdBy: req.user.email },
          { createdBy: req.user.name }
        ]
      };
    } else if (req.user.role === 'advisor') {
      // Advisor should only see vehicles assigned to them
      query.assignedAdvisor = String(req.user._id);
    } else if (req.user.role === 'technician') {
      // Technicians should see vehicles with jobs assigned to them
      const techName = req.user.name || '';
      query = {
        $or: [
          { 'jobs.technicianId': String(req.user._id) },
          { 'jobs.technicianId': req.user._id },
          { 'jobs.technician': techName },
          { 'jobs.technician': { $regex: `^${techName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } }
        ]
      };
    } else if (req.user.role === 'qc') {
      // QC users should see all QC-related vehicles from MongoDB
      query = {
        $or: [
          { serviceStatus: 'awaiting-qc' },
          { serviceStatus: 'in-qc' },
          { serviceStatus: 'ready-for-delivery' },
          { serviceStatus: 'rework-required' },
          { qcStatus: 'approved' },
          { qcStatus: 'rejected' }
        ]
      };
    } else if (req.user.role !== 'admin' && req.user.role !== 'receptionist') {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Admin and receptionist see all vehicles
    const vehicles = await db.Vehicle.find(query);
    res.json(vehicles);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/vehicles', authMiddleware, async (req, res) => {
  try {
    // Only admin and guard can add vehicles
    if (req.user.role !== 'admin' && req.user.role !== 'guard') {
      return res.status(403).json({ error: 'Only admin and guard can add vehicles' });
    }

    let { plate, owner, ownerEmail, mobileNumber, make, model, year, color } = req.body;
    plate = (plate || '').trim();
    owner = (owner || ownerEmail || '').trim();
    ownerEmail = (ownerEmail || owner || '').trim();
    mobileNumber = (mobileNumber || '').trim();

    if (!plate || !owner) {
      return res.status(400).json({ error: 'plate and owner are required' });
    }

    const v = await db.Vehicle.create({
      plate,
      owner,
      ownerEmail,
      mobileNumber,
      make,
      model,
      year,
      color,
      createdAt: new Date(),
      status: 'entered',
      createdBy: req.user.name || req.user.email,
      createdByUserId: req.user._id,
      assignedAdvisor: null,
      serviceStatus: 'entered',
      inspectionStatus: 'not-started',
      inspectionReport: null,
      serviceDescription: '',
      jobs: [],
      jobsAssigned: false,
      qcStatus: null,
      qcNotes: null,
      qcPriority: null,
      totalServiceTime: null,
      totalCost: null,
      serviceStartTime: null,
      serviceCompletionTime: null,
      sentToQcTime: null,
      history: [{
        at: new Date().toISOString(),
        by: req.user.name || req.user.email,
        note: 'Created'
      }]
    });
    res.status(201).json(v);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/vehicles/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { changes = {}, actor, note } = req.body;
    const v = await db.Vehicle.findById(id);
    if (!v) return res.status(404).json({ error: 'not found' });

    const actualChanges = {};
    Object.keys(changes).forEach(key => {
      const incoming = changes[key];
      const existing = v[key];
      if (incoming instanceof Date) {
        if (!existing || new Date(existing).toISOString() !== incoming.toISOString()) {
          actualChanges[key] = incoming;
        }
      } else if (typeof incoming === 'object' && incoming !== null) {
        if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
          actualChanges[key] = incoming;
        }
      } else if (incoming !== existing) {
        actualChanges[key] = incoming;
      }
    });

    if (Object.keys(actualChanges).length === 0) {
      return res.json(v);
    }

    const h = v.history || [];
    h.push({
      at: new Date().toISOString(),
      by: actor || 'system',
      note: note || '',
      changes: actualChanges
    });

    const updatedVehicle = await db.Vehicle.findByIdAndUpdate(
      id,
      Object.assign({}, actualChanges, { history: h }),
      { new: true }
    );

    res.json(updatedVehicle);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/vehicles/:id', authMiddleware, async (req, res) => {
  try {
    // Only admin can delete vehicles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete vehicles' });
    }
    const id = req.params.id;
    const v = await db.Vehicle.findByIdAndDelete(id);
    if (!v) return res.status(404).json({ error: 'not found' });
    res.json({ message: 'Vehicle deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Migration route for localStorage vehicles (one-time use)
app.post('/api/migrate-vehicles', authMiddleware, async (req, res) => {
  try {
    const { vehicles } = req.body;
    if (!Array.isArray(vehicles)) {
      return res.status(400).json({ error: 'vehicles must be an array' });
    }

    const migrated = [];
    for (const v of vehicles) {
      // Check if already exists
      const existing = await db.Vehicle.findOne({ plate: v.plate || v.vehicleNumber });
      if (existing) continue;

      const newV = await db.Vehicle.create({
        plate: v.plate || v.vehicleNumber || '',
        owner: v.owner || v.ownerEmail || '',
        ownerEmail: v.ownerEmail || v.owner || '',
        mobileNumber: v.mobileNumber || v.phone || '',
        make: v.make || v.carName || '',
        model: v.model || v.vehicleModel || '',
        year: v.year || 0,
        color: v.color || '',
        assignedAdvisor: v.assignedAdvisor || null,
        serviceStatus: v.serviceStatus || v.status || 'entered',
        inspectionReport: v.inspectionReport || v.inspection || v.inspection_report || null,
        serviceDescription: v.serviceDescription || v.notes || '',
        jobs: Array.isArray(v.jobs) ? v.jobs : v.jobs ? [v.jobs] : [],
        totalServiceTime: v.totalServiceTime ?? null,
        totalCost: v.totalCost ?? null,
        serviceStartTime: v.serviceStartTime || v.startTime || null,
        serviceCompletionTime: v.serviceCompletionTime || v.completionTime || v.finishedAt || null,
        qcStatus: v.qcStatus || null,
        qcNotes: v.qcNotes || null,
        qcPriority: v.qcPriority || null,
        status: v.status || 'entered',
        createdBy: req.user.name || req.user.email,
        createdByUserId: req.user._id,
        history: [{
          at: new Date().toISOString(),
          by: req.user.name || req.user.email,
          note: 'Migrated from localStorage'
        }]
      });
      migrated.push(newV);
    }

    res.json({ message: `Migrated ${migrated.length} vehicles` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// contacts
app.post('/api/contacts', async (req, res) => {
  try {
    const c = await db.Contact.create(req.body);
    res.status(201).json(c);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await db.Contact.find();
    res.json(contacts);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { changes } = req.body;
    const c = await db.Contact.findById(id);
    if (!c) return res.status(404).json({ error: 'not found' });

    const updatedContact = await db.Contact.findByIdAndUpdate(id, Object.assign({}, changes), { new: true });

    // Send email response if status is updated to 'responded'
    if (changes.status === 'responded' && changes.adminResponse && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: updatedContact.email,
        subject: `Response to your inquiry - Car Service Management System`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #4338ca, #6366f1); padding: 20px; text-align: center; color: white;">
              <h2 style="margin: 0;">Car Service Management System</h2>
            </div>
            <div style="padding: 30px;">
              <h3 style="color: #4338ca; margin-top: 0;">Hello ${updatedContact.name},</h3>
              <p>Thank you for reaching out to us. We have reviewed your message regarding <strong>${updatedContact.problemType || 'General Inquiry'}</strong> and provided a response below:</p>
              
              <div style="background-color: #f9fafb; border-left: 4px solid #4338ca; padding: 20px; margin: 25px 0; border-radius: 4px;">
                <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 5px;"><strong>Your Message:</strong></p>
                <p style="color: #9ca3af; font-size: 0.9rem; font-style: italic;">"${updatedContact.description}"</p>
              </div>

              <div style="background-color: #f9fafb; border-left: 4px solid #4338ca; padding: 20px; margin: 25px 0; border-radius: 4px;">
                <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 5px;"><strong>Our Response:</strong></p>
                <p style="color: #9ca3af; font-size: 0.9rem; font-style: italic;">${changes.adminResponse}</p>
              </div>

              <p style="margin-top: 30px;">If you have any further questions, feel free to reply to this email or visit our website.</p>
              
              <p style="margin-bottom: 0;">Best regards,</p>
              <p style="margin-top: 5px; font-weight: bold; color: #4338ca;">The Car Service Team</p>
            </div>
            <div style="background-color: #f3f4f6; padding: 15px; text-align: center; color: #9ca3af; font-size: 0.8rem;">
              &copy; ${new Date().getFullYear()} Car Service Management System. All rights reserved.
            </div>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending response email:', error);
        } else {
          console.log('Response email sent successfully to:', updatedContact.email);
        }
      });
    }

    res.json(updatedContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const c = await db.Contact.findById(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    await db.Contact.deleteOne({ _id: id });
    res.json({ ok: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const a = await db.Appointment.create(req.body);
    res.status(201).json(a);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const appts = await db.Appointment.find().populate('userId').populate('serviceId');
    res.json(appts);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin reset - clear all data
app.post('/api/admin/reset', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findById(req.user._id);
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    // Clear all vehicles and contacts, keep users and services
    await db.Vehicle.deleteMany({});
    await db.Contact.deleteMany({});
    
    res.json({ ok: true, message: 'Data reset successful' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Initialize DB then start server
const initializeDB = async () => {
  try {
    // Clean up problematic indexes on startup
    try {
      await db.Service.collection.dropIndex('serviceNumber_1');
      console.log('Dropped old serviceNumber index');
    } catch (e) {
      // Index doesn't exist, that's fine
    }

    try {
      await db.Vehicle.collection.dropIndex('registrationNumber_1');
      console.log('Dropped legacy registrationNumber index');
    } catch (e) {
      // Legacy index doesn't exist or was already removed
    }

    try {
      await db.Vehicle.collection.dropIndex('vin_1');
      console.log('Dropped legacy vin index');
    } catch (e) {
      // Legacy index doesn't exist or was already removed
    }

    // seed if empty
    const svcCount = await db.Service.countDocuments();
    if (svcCount === 0) {
      await db.Service.insertMany([
        { title: 'Oil Change', description: 'Standard oil change' },
        { title: 'Full Service', description: 'Comprehensive inspection and service' }
      ]);
      console.log('Seeded services');
    }

    // seed admin user
    const admin = await db.User.findOne({ email: 'admin@company.local' });
    if (!admin) {
      await db.User.create({ name: 'Admin', email: 'admin@company.local', password: 'admin123', role: 'admin' });
      console.log('Seeded admin user');
    }

    // seed a sample vehicle and contact if none exist
    const vcount = await db.Vehicle.countDocuments();
    if (vcount === 0) {
      await db.Vehicle.create({ 
        plate: 'ABC-123', 
        owner: 'John Doe', 
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        color: 'Silver',
        status: 'entered', 
        createdBy: 'seed', 
        history: [{ at: new Date().toISOString(), by: 'seed', note: 'Seed vehicle' }] 
      });
      console.log('Seeded sample vehicle');
    }

    const ccount = await db.Contact.countDocuments();
    if (ccount === 0) {
      await db.Contact.create({ name: 'Jane', email: 'jane@example.com', problemType: 'General', description: 'Test message from seed', status: 'new' });
      console.log('Seeded sample contact');
    }

    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}/`));
  } catch (err) {
    console.error('Failed to initialize DB', err);
  }
};

// Wait for MongoDB connection then initialize
setTimeout(initializeDB, 2000);
