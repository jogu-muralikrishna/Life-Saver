const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { getDB, initDatabase } = require('./db');

const app = express();
const server = http.createServer(app);

// Keep-alive timeouts for Render reverse proxy compatibility
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

const allowedOrigins = [
    'https://lifesaver.us.kg',
    'https://www.lifesaver.us.kg',
    /\.onrender\.com$/,
    /\.vercel\.app$/,
    /localhost/,
    /127\.0\.0\.1/
];
if (process.env.RENDER_EXTERNAL_URL) allowedOrigins.push(process.env.RENDER_EXTERNAL_URL);
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true
    }
});

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'lifesaver-secure-database-key-2026';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lifesaver.us.kg';

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Dedicated health check endpoint for Render returning {"status":"ok"}
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Explicit root route returning the LifeSaver application
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../index.html'));
});

// Serve frontend static files immediately without waiting for DB
app.use(express.static(path.resolve(__dirname, '..')));

// Ensure database is initialized before handling API requests
app.use('/api', async (req, res, next) => {
    try {
        await initDatabase();
        next();
    } catch (err) {
        console.error('Database connection / init error:', err.message);
        next(err);
    }
});

// Socket.io Real-Time Hub
io.on('connection', (socket) => {
    // console.log('Client connected to real-time events:', socket.id);
    socket.on('disconnect', () => {
        // console.log('Client disconnected:', socket.id);
    });
});

function broadcastChange(node, action, key, data = null) {
    io.emit('db_change', {
        node,
        action,
        key,
        data,
        timestamp: Date.now()
    });
}

// Authentication & Permission Middlewares
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const roleHeader = req.headers['x-admin-role'];
    const emailHeader = req.headers['x-admin-email'];

    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                // If token invalid, still check headers fallback
                if (roleHeader) {
                    req.user = { role: roleHeader, email: emailHeader };
                    return next();
                }
                return res.status(403).json({ error: 'Invalid or expired token' });
            }
            req.user = user;
            next();
        });
    } else if (roleHeader) {
        req.user = { role: roleHeader, email: emailHeader };
        next();
    } else {
        req.user = null;
        next();
    }
}

function requireSuperAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Permission denied: Super Admin access required' });
    }
    next();
}

function requireAdminOrSubAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'SUB_ADMIN')) {
        return res.status(403).json({ error: 'Permission denied: Admin access required' });
    }
    next();
}

// Helper to log admin actions to PostgreSQL
async function logAdminAction(db, adminEmail, action, targetType, targetId, details = {}) {
    const auditId = 'AUDIT-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 900000);
    const id = '-P' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const now = new Date();
    await db.query(`
        INSERT INTO admin_audit_logs (
            id, audit_id, admin_email, action, target_type, target_id,
            donor_name, hospital_name, previous_value, new_value, reason,
            timestamp, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
    `, [
        id,
        auditId,
        adminEmail || 'admin@lifesaver.com',
        action,
        targetType || null,
        targetId || null,
        details.donorName || null,
        details.hospitalName || null,
        details.previousValue ? String(details.previousValue) : null,
        details.newValue ? String(details.newValue) : null,
        details.reason || null,
        now.getTime(),
        now
    ]);
    broadcastChange('admin_audit_logs', 'insert', id, { id, auditId, action, targetType, targetId });
}

// ==========================================
// 1. AUTHENTICATION APIS
// ==========================================

// Super Admin / Sub-Admin Login
app.post('/api/auth/admin-login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const db = await getDB();
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();

        if (!cleanEmail) {
            return res.status(400).json({ error: 'Admin email is required.' });
        }

        // 1. Check if email belongs to Sub-Admin
        const saResult = await db.query(
            'SELECT * FROM sub_admins WHERE LOWER(email) = LOWER($1)',
            [cleanEmail]
        );

        if (saResult.rows.length > 0) {
            const sa = saResult.rows[0];
            if (sa.password !== cleanPass) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }
            if (sa.status === 'Disabled') {
                return res.status(403).json({ error: 'Access Denied: Your Sub-Admin account has been disabled.' });
            }

            const token = jwt.sign(
                { id: sa.id, email: sa.email, name: sa.name, role: 'SUB_ADMIN', permissions: sa.permissions },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                success: true,
                role: 'SUB_ADMIN',
                token,
                user: { id: sa.id, email: sa.email, name: sa.name, role: 'SUB_ADMIN', permissions: sa.permissions }
            });
        }

        // 2. Check if email belongs to Super Admin
        const adminRes = await db.query(
            'SELECT * FROM admins WHERE LOWER(email) = LOWER($1)',
            [cleanEmail]
        );

        let adminUser = null;
        if (adminRes.rows.length > 0) {
            adminUser = adminRes.rows[0];
        } else if (cleanEmail === 'admin@lifesaver.com' || cleanEmail.includes('admin')) {
            const countRes = await db.query('SELECT COUNT(*) as cnt FROM admins');
            const id = 'b2c54a2lPSR4l7CYFt8s1fb7Qwi1';
            await db.query(`
                INSERT INTO admins (id, email, name, role, is_admin)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
            `, [id, cleanEmail, 'Super Admin', 'SUPER_ADMIN', true]);
            adminUser = { id, email: cleanEmail, name: 'Super Admin', role: 'SUPER_ADMIN' };
        }

        if (!adminUser) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Update login time
        await db.query('UPDATE admins SET login_time = CURRENT_TIMESTAMP WHERE id = $1', [adminUser.id]);

        const token = jwt.sign(
            { id: adminUser.id, email: adminUser.email, name: adminUser.name || 'Admin', role: 'SUPER_ADMIN' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            role: 'SUPER_ADMIN',
            token,
            user: { id: adminUser.id, email: adminUser.email, name: adminUser.name || 'Admin', role: 'SUPER_ADMIN' }
        });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
});

// Admin Password Reset Verification
app.post('/api/auth/admin-reset-verify', async (req, res) => {
    try {
        const { email, name, role } = req.body;
        const db = await getDB();

        if (role === 'SUB_ADMIN') {
            const result = await db.query('SELECT * FROM sub_admins WHERE LOWER(email) = LOWER($1)', [email.trim()]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Sub-Admin account found matching this email.' });
            }
            const sa = result.rows[0];
            const dbName = (sa.name || '').toLowerCase().trim();
            const inputName = name.toLowerCase().trim();
            if (dbName && !dbName.includes(inputName) && !inputName.includes(dbName)) {
                return res.status(400).json({ error: 'Security Identity Failed: Admin Name does not match records.' });
            }
            return res.json({ success: true, key: sa.id, name: sa.name });
        } else {
            const result = await db.query('SELECT * FROM admins WHERE LOWER(email) = LOWER($1)', [email.trim()]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No Super Admin account found with this email.' });
            }
            return res.json({ success: true, key: result.rows[0].id, name: result.rows[0].name });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Password Reset Execution
app.post('/api/auth/admin-reset-password', async (req, res) => {
    try {
        const { key, newPassword, role } = req.body;
        const db = await getDB();
        const rawPass = (newPassword || '').trim();

        if (role === 'SUB_ADMIN') {
            await db.query('UPDATE sub_admins SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [rawPass, key]);
        } else {
            await db.query('UPDATE admins SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [rawPass, key]);
        }
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Regular User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { id, name, email, password, phone, dob, bloodGroup, city, referralCode, referredBy } = req.body;
        const db = await getDB();
        const userId = id || 'usr_' + Date.now() + Math.random().toString(36).substring(2, 6);

        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        // Generate referral code if not provided
        const myRefCode = referralCode || ('LS-' + (name || 'USER').toUpperCase().slice(0, 5) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase());

        await db.query(`
            INSERT INTO users (
                id, name, full_name, email, password, phone, dob, blood_group, city,
                account_type, is_blood_donor, referral_code, referred_by, referral_count,
                role, timestamp, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [
            userId, name, name, email, password, phone || null, dob || null, bloodGroup || null, city || null,
            'public', false, myRefCode, referredBy || null, 0, 'user', Date.now()
        ]);

        await db.query('INSERT INTO referral_codes (code, user_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [myRefCode, userId]);

        if (referredBy) {
            const refOwnerRes = await db.query('SELECT user_id FROM referral_codes WHERE code = $1', [referredBy]);
            if (refOwnerRes.rows.length > 0) {
                const ownerUid = refOwnerRes.rows[0].user_id;
                await db.query('INSERT INTO referrals (referrer_uid, referred_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ownerUid, userId]);
                await db.query('UPDATE users SET referral_count = referral_count + 1 WHERE id = $1', [ownerUid]);
            }
        }

        broadcastChange('users', 'insert', userId, { id: userId, name, email });

        const token = jwt.sign({ id: userId, email, name, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            success: true,
            token,
            user: { id: userId, uid: userId, name, email, referralCode: myRefCode }
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Regular User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { emailOrPhone, password } = req.body;
        const db = await getDB();
        const search = emailOrPhone.trim().toLowerCase();
        const cleanPhone = emailOrPhone.replace(/\D/g, '');

        const result = await db.query(`
            SELECT * FROM users
            WHERE LOWER(email) = $1 OR LOWER(name) = $1
               OR (LENGTH($2) >= 10 AND REGEXP_REPLACE(phone, '\\D', '', 'g') = $2)
        `, [search, cleanPhone]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User account not found.' });
        }

        const user = result.rows[0];
        if (user.password && user.password !== password) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                uid: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                bloodGroup: user.blood_group,
                city: user.city,
                accountType: user.account_type,
                referralCode: user.referral_code
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. COMPLETE SNAPSHOT / REAL-TIME SYNC
// ==========================================
app.get('/api/sync/all', async (req, res) => {
    try {
        const db = await getDB();
        const [
            donors, requests, hospitals, logs, organDonors, users, messages,
            auditLogs, subAdmins, recycleBin, profileReqs, accountReqs, hospitalComms,
            referralCodes, admins
        ] = await Promise.all([
            db.query('SELECT * FROM blood_donors WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM blood_requests WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM partner_hospitals WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM donor_contact_logs ORDER BY created_at DESC'),
            db.query('SELECT * FROM organ_donors WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM contact_messages WHERE deleted_at IS NULL ORDER BY created_at DESC'),
            db.query('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 500'),
            db.query('SELECT id, name, email, password, role, status, permissions, created_at FROM sub_admins ORDER BY created_at DESC'),
            db.query('SELECT * FROM recycle_bin ORDER BY created_at DESC'),
            db.query('SELECT * FROM profile_change_requests ORDER BY created_at DESC'),
            db.query('SELECT * FROM account_change_requests ORDER BY created_at DESC'),
            db.query('SELECT * FROM hospital_communications ORDER BY created_at DESC'),
            db.query('SELECT * FROM referral_codes'),
            db.query('SELECT * FROM admins')
        ]);

        const mapToObject = (rows, keyProp = 'id') => {
            const obj = {};
            for (const r of rows) {
                obj[r[keyProp]] = r;
            }
            return obj;
        };

        // Format blood donors to match frontend expectations
        const formattedDonors = {};
        for (const r of donors.rows) {
            formattedDonors[r.id] = {
                id: r.id,
                name: r.name,
                email: r.email,
                phone: r.phone,
                bloodGroup: r.blood_group,
                city: r.city,
                dob: r.dob,
                status: r.status,
                phoneVisibility: r.phone_visibility,
                accountType: r.phone_visibility,
                contactVisibility: r.phone_visibility,
                allowEmergencyContact: r.allow_emergency_contact,
                alcoholLast24h: r.alcohol_last_24h,
                donationCount: r.donation_count || r.times_donated || 0,
                timesDonated: r.times_donated || r.donation_count || 0,
                registeredDate: r.registered_date,
                medicalHistory: r.medical_history
            };
        }

        // Format blood requests
        const formattedRequests = {};
        for (const r of requests.rows) {
            formattedRequests[r.id] = {
                id: r.id,
                requestId: r.id,
                userId: r.user_id,
                userEmail: r.user_email,
                patientName: r.patient_name,
                requesterName: r.requester_name,
                bloodGroup: r.blood_group,
                units: r.units,
                hospital: r.hospital,
                address: r.address,
                city: r.city,
                phone: r.phone,
                contact: r.phone,
                contactVisibility: r.contact_visibility,
                urgency: r.urgency,
                status: r.status,
                requiredDate: r.required_date,
                notes: r.notes,
                createdAt: r.created_at,
                timestamp: r.timestamp
            };
        }

        // Format partner hospitals
        const formattedHospitals = {};
        for (const r of hospitals.rows) {
            formattedHospitals[r.id] = {
                id: r.id,
                name: r.name,
                hospitalName: r.name,
                city: r.city,
                address: r.address,
                phone: r.phone,
                emergencyPhone: r.emergency_phone,
                email: r.email,
                coordinator: r.coordinator,
                status: r.status,
                bloodInventory: r.blood_inventory,
                rating: r.rating
            };
        }

        // Format organ donors
        const formattedOrganDonors = {};
        for (const r of organDonors.rows) {
            formattedOrganDonors[r.id] = {
                id: r.id,
                userId: r.user_id,
                name: r.name,
                email: r.email,
                phone: r.phone,
                dob: r.dob,
                age: r.age,
                city: r.city,
                organsPledged: r.organs_pledged,
                alcoholHabit: r.alcohol_habit,
                smokingHabit: r.smoking_habit,
                medicalConditions: r.medical_conditions,
                clearanceRating: r.clearance_rating,
                allowContact: r.allow_contact,
                status: r.status,
                registeredDate: r.registered_date
            };
        }

        // Format users
        const formattedUsers = {};
        for (const r of users.rows) {
            formattedUsers[r.id] = {
                id: r.id,
                uid: r.id,
                name: r.name,
                fullName: r.full_name,
                email: r.email,
                password: r.password || null,
                phone: r.phone,
                dob: r.dob,
                bloodGroup: r.blood_group,
                blood_group: r.blood_group,
                city: r.city,
                location: r.location,
                accountType: r.account_type,
                isBloodDonor: r.is_blood_donor,
                referralCode: r.referral_code,
                referredBy: r.referred_by,
                referralCount: r.referral_count,
                role: r.role,
                instagram: r.instagram,
                socialProfiles: r.social_profiles,
                visibilitySettings: r.visibility_settings,
                donorPrivacy: r.donor_privacy,
                createdAt: r.created_at
            };
        }

        // Format contact messages
        const formattedMessages = {};
        for (const r of messages.rows) {
            formattedMessages[r.id] = {
                id: r.id,
                messageId: r.id,
                name: r.name,
                email: r.email,
                mobile: r.mobile,
                reason: r.reason,
                message: r.message,
                status: r.status,
                createdAt: r.created_at
            };
        }

        // Format recycle bin
        const formattedRecycleBin = {};
        for (const r of recycleBin.rows) {
            formattedRecycleBin[r.id] = {
                id: r.id,
                originalNode: r.original_node,
                originalKey: r.original_key,
                recordData: r.record_data,
                deletedBy: r.deleted_by,
                deletedAt: r.deleted_at,
                timestamp: r.timestamp
            };
        }

        // Format sub admins
        const formattedSubAdmins = {};
        for (const r of subAdmins.rows) {
            formattedSubAdmins[r.id] = {
                id: r.id,
                subAdminId: r.id,
                name: r.name,
                email: r.email,
                password: r.password,
                role: r.role,
                status: r.status,
                permissions: r.permissions,
                createdAt: r.created_at
            };
        }

        // Format admins
        const formattedAdmins = {};
        for (const r of admins.rows) {
            formattedAdmins[r.id] = {
                id: r.id,
                email: r.email,
                name: r.name || 'Admin',
                password: r.password || 'admin123',
                role: r.role || 'SUPER_ADMIN',
                isAdmin: r.is_admin ?? true,
                loginTime: r.login_time
            };
        }

        // Format audit logs
        const formattedAuditLogs = {};
        for (const r of auditLogs.rows) {
            formattedAuditLogs[r.id] = {
                id: r.id,
                auditId: r.audit_id,
                adminEmail: r.admin_email,
                action: r.action,
                targetType: r.target_type,
                targetId: r.target_id,
                donorName: r.donor_name,
                hospitalName: r.hospital_name,
                previousValue: r.previous_value,
                newValue: r.new_value,
                reason: r.reason,
                timestamp: r.timestamp,
                createdAt: r.created_at
            };
        }

        res.json({
            donors: formattedDonors,
            blood_requests: formattedRequests,
            partner_hospitals: formattedHospitals,
            contact_audit_logs: mapToObject(logs.rows),
            organ_donors: formattedOrganDonors,
            users: formattedUsers,
            contact_messages: formattedMessages,
            admin_audit_logs: formattedAuditLogs,
            sub_admins: formattedSubAdmins,
            admins: formattedAdmins,
            recycle_bin: formattedRecycleBin,
            profile_change_requests: mapToObject(profileReqs.rows),
            account_change_requests: mapToObject(accountReqs.rows),
            hospital_communications: mapToObject(hospitalComms.rows)
        });
    } catch (err) {
        console.error('Sync all error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. BLOOD DONORS APIS
// ==========================================
app.get('/api/donors', async (req, res) => {
    try {
        const db = await getDB();
        const { bloodGroup, city, status } = req.query;
        let sql = 'SELECT * FROM blood_donors WHERE deleted_at IS NULL';
        const params = [];

        if (bloodGroup) {
            params.push(bloodGroup);
            sql += ` AND blood_group = $${params.length}`;
        }
        if (city) {
            params.push(city);
            sql += ` AND LOWER(city) = LOWER($${params.length})`;
        }
        if (status) {
            params.push(status);
            sql += ` AND status = $${params.length}`;
        }
        sql += ' ORDER BY created_at DESC';

        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/donors', async (req, res) => {
    try {
        const db = await getDB();
        const d = req.body;
        const id = d.id || '-P' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

        await db.query(`
            INSERT INTO blood_donors (
                id, user_id, name, email, phone, blood_group, city, dob, status,
                phone_visibility, allow_emergency_contact, alcohol_last_24h,
                times_donated, donation_count, registered_date, medical_history,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [
            id, d.userId || null, d.name, d.email || null, d.phone || d.mobileNumber || null,
            d.bloodGroup || 'O+', d.city || null, d.dob || null, d.status || 'Available',
            d.phoneVisibility || d.accountType || d.contactVisibility || 'public',
            d.allowEmergencyContact ?? true, d.alcoholLast24h || 'No',
            d.timesDonated || d.donationCount || 0, d.donationCount || d.timesDonated || 0,
            d.registeredDate || new Date().toISOString().split('T')[0],
            JSON.stringify(d.medicalHistory || {})
        ]);

        broadcastChange('donors', 'insert', id, { ...d, id });
        res.status(201).json({ success: true, id, donor: { ...d, id } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/donors/:id', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const d = req.body;

        // Fetch current values
        const cur = await db.query('SELECT * FROM blood_donors WHERE id = $1', [id]);
        if (cur.rows.length === 0) return res.status(404).json({ error: 'Donor not found' });
        const existing = cur.rows[0];

        const name = d.name !== undefined ? d.name : existing.name;
        const phone = (d.phone || d.mobileNumber) !== undefined ? (d.phone || d.mobileNumber) : existing.phone;
        const bloodGroup = d.bloodGroup !== undefined ? d.bloodGroup : existing.blood_group;
        const city = d.city !== undefined ? d.city : existing.city;
        const dob = d.dob !== undefined ? d.dob : existing.dob;
        const status = d.status !== undefined ? d.status : existing.status;
        const phoneVisibility = (d.phoneVisibility || d.accountType || d.contactVisibility) !== undefined 
            ? (d.phoneVisibility || d.accountType || d.contactVisibility) 
            : existing.phone_visibility;
        const alcohol = d.alcoholLast24h !== undefined ? d.alcoholLast24h : existing.alcohol_last_24h;
        const donationCount = d.donationCount !== undefined ? d.donationCount : existing.donation_count;

        await db.query(`
            UPDATE blood_donors SET
                name = $1, phone = $2, blood_group = $3, city = $4, dob = $5,
                status = $6, phone_visibility = $7, alcohol_last_24h = $8,
                donation_count = $9, times_donated = $9, updated_at = CURRENT_TIMESTAMP
            WHERE id = $10;
        `, [name, phone, bloodGroup, city, dob, status, phoneVisibility, alcohol, donationCount, id]);

        if (req.user && req.user.email) {
            await logAdminAction(db, req.user.email, 'UPDATED_DONOR', 'donors', id, {
                donorName: name,
                newValue: `${bloodGroup}, ${city}, ${status}`
            });
        }

        broadcastChange('donors', 'update', id, { ...d, id });
        res.json({ success: true, message: 'Donor updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. BLOOD REQUESTS APIS
// ==========================================
app.get('/api/blood-requests', async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM blood_requests WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blood-requests', async (req, res) => {
    try {
        const db = await getDB();
        const r = req.body;
        const id = r.id || '-REQ' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

        await db.query(`
            INSERT INTO blood_requests (
                id, user_id, user_email, patient_name, requester_name, blood_group,
                units, hospital, address, city, phone, contact_visibility, urgency,
                status, required_date, notes, timestamp, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [
            id, r.userId || null, r.userEmail || null, r.patientName || r.name || 'Emergency Patient',
            r.requesterName || r.name || 'Anonymous', r.bloodGroup || 'O+', r.units || 1,
            r.hospital || 'Hospital', r.address || null, r.city || null, r.phone || r.contact || null,
            r.contactVisibility || 'public', r.urgency || 'Urgent', r.status || 'Pending',
            r.requiredDate || null, r.notes || null, Date.now()
        ]);

        broadcastChange('blood_requests', 'insert', id, { ...r, id, status: r.status || 'Pending' });
        res.status(201).json({ success: true, id, request: { ...r, id } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/blood-requests/:id', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status } = req.body;

        await db.query(`
            UPDATE blood_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
        `, [status, id]);

        if (req.user && req.user.email) {
            await logAdminAction(db, req.user.email, 'UPDATE_REQUEST_STATUS', 'blood_requests', id, {
                newValue: status
            });
        }

        broadcastChange('blood_requests', 'update', id, { id, status });
        res.json({ success: true, message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. PARTNER HOSPITALS APIS
// ==========================================
app.get('/api/hospitals', async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM partner_hospitals WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hospitals', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const h = req.body;
        const id = h.id || '-HOSP' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

        await db.query(`
            INSERT INTO partner_hospitals (
                id, name, city, address, phone, emergency_phone, email, coordinator,
                status, blood_inventory, rating, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [
            id, h.name || h.hospitalName, h.city, h.address || null, h.phone || h.contact || null,
            h.emergencyPhone || null, h.email || null, h.coordinator || null,
            h.status || 'Active', JSON.stringify(h.bloodInventory || {}), h.rating || 5.0
        ]);

        await logAdminAction(db, req.user.email, 'ADD_PARTNER_HOSPITAL', 'partner_hospitals', id, {
            hospitalName: h.name || h.hospitalName
        });

        broadcastChange('partner_hospitals', 'insert', id, { ...h, id });
        res.status(201).json({ success: true, id, hospital: { ...h, id } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/hospitals/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status } = req.body;

        await db.query('UPDATE partner_hospitals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);

        await logAdminAction(db, req.user.email, 'UPDATE_HOSPITAL_STATUS', 'partner_hospitals', id, {
            newValue: status
        });

        broadcastChange('partner_hospitals', 'update', id, { id, status });
        res.json({ success: true, message: 'Hospital status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hospital Communications
app.post('/api/hospitals/communications', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { hospitalId, hospitalName, subject, message } = req.body;
        const id = '-COMM' + Date.now().toString(36);

        await db.query(`
            INSERT INTO hospital_communications (
                id, hospital_id, hospital_name, subject, message, sender_admin_email, status, timestamp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP);
        `, [id, hospitalId, hospitalName, subject, message, req.user.email, 'Sent', Date.now()]);

        await logAdminAction(db, req.user.email, 'SENT_HOSPITAL_DISPATCH', 'hospital_communications', id, {
            hospitalName: hospitalName,
            reason: subject
        });

        broadcastChange('hospital_communications', 'insert', id, { id, hospitalId, hospitalName, subject, message });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. CONTACT MESSAGES APIS
// ==========================================
app.get('/api/contact-messages', async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM contact_messages WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contact-messages', async (req, res) => {
    try {
        const db = await getDB();
        const m = req.body;
        const id = m.id || '-MSG' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

        await db.query(`
            INSERT INTO contact_messages (
                id, name, email, mobile, reason, message, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [id, m.name, m.email || null, m.mobile || null, m.reason || 'General', m.message || null, 'new']);

        broadcastChange('contact_messages', 'insert', id, { ...m, id, status: 'new' });
        res.status(201).json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/contact-messages/:id', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status } = req.body;

        await db.query('UPDATE contact_messages SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
        broadcastChange('contact_messages', 'update', id, { id, status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 7. ORGAN DONORS APIS
// ==========================================
app.get('/api/organ-donors', async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM organ_donors WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/organ-donors', async (req, res) => {
    try {
        const db = await getDB();
        const od = req.body;
        const id = od.id || '-OD' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

        await db.query(`
            INSERT INTO organ_donors (
                id, user_id, name, email, phone, dob, age, city, organs_pledged,
                alcohol_habit, smoking_habit, medical_conditions, clearance_rating,
                allow_contact, status, registered_date, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [
            id, od.userId || null, od.name, od.email || null, od.phone || null,
            od.dob || null, od.age ? parseInt(od.age) : null, od.city || null,
            od.organsPledged || 'All', od.alcoholHabit || 'Never', od.smokingHabit || 'Non-Smoker',
            od.medicalConditions || 'Clean', od.clearanceRating || 'Prime Candidate',
            od.allowContact ?? true, od.status || 'Active', od.registeredDate || new Date().toISOString().split('T')[0]
        ]);

        broadcastChange('organ_donors', 'insert', id, { ...od, id });
        res.status(201).json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 8. PROFILE & PRIVACY REQUESTS
// ==========================================
app.post('/api/profile-requests', async (req, res) => {
    try {
        const db = await getDB();
        const r = req.body;
        const id = r.id || '-PR' + Date.now().toString(36);

        await db.query(`
            INSERT INTO profile_change_requests (
                id, user_id, user_name, user_email, request_type, current_value, target_value, reason, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [id, r.userId, r.userName, r.userEmail, r.requestType, r.currentValue, r.targetValue, r.reason, 'pending']);

        broadcastChange('profile_change_requests', 'insert', id, { ...r, id, status: 'pending' });
        res.status(201).json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/profile-requests/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status } = req.body;

        await db.query('UPDATE profile_change_requests SET status = $1, reviewed_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [status, req.user.email, id]);

        broadcastChange('profile_change_requests', 'update', id, { id, status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/privacy-requests', async (req, res) => {
    try {
        const db = await getDB();
        const r = req.body;
        const id = r.id || '-AR' + Date.now().toString(36);

        await db.query(`
            INSERT INTO account_change_requests (
                id, user_id, user_name, user_email, request_type, current_value, target_value, reason, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        `, [id, r.userId, r.userName, r.userEmail, r.requestType || 'Privacy Preference Change', r.currentValue, r.targetValue, r.reason, 'pending']);

        broadcastChange('account_change_requests', 'insert', id, { ...r, id, status: 'pending' });
        res.status(201).json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/privacy-requests/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status } = req.body;

        await db.query('UPDATE account_change_requests SET status = $1, reviewed_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [status, req.user.email, id]);

        broadcastChange('account_change_requests', 'update', id, { id, status });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 9. RECYCLE BIN APIS (SOFT-DELETE & RESTORE)
// ==========================================
app.delete('/api/records/:node/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { node, key } = req.params;
        const adminEmail = req.user.email;

        // Fetch original record
        let table = node;
        if (node === 'donors') table = 'blood_donors';

        const fetchRes = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [key]);
        const recordData = fetchRes.rows.length > 0 ? fetchRes.rows[0] : {};

        const recycleId = '-RB' + Date.now().toString(36);
        const now = new Date();

        await db.query(`
            INSERT INTO recycle_bin (id, original_node, original_key, record_data, deleted_by, deleted_at, timestamp, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);
        `, [recycleId, node, key, JSON.stringify(recordData), adminEmail, now, now.getTime()]);

        // Soft delete from live table
        await db.query(`UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [key]);

        await logAdminAction(db, adminEmail, 'MOVED_TO_RECYCLE_BIN', node, key, {
            reason: `Soft-deleted record and moved to Recycle Bin`
        });

        broadcastChange('recycle_bin', 'insert', recycleId, { id: recycleId, originalNode: node, originalKey: key, recordData });
        broadcastChange(node, 'delete', key);

        res.json({ success: true, message: 'Record moved to Recycle Bin', recycleId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recycle-bin/restore/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const adminEmail = req.user.email;

        const rbRes = await db.query('SELECT * FROM recycle_bin WHERE id = $1', [id]);
        if (rbRes.rows.length === 0) return res.status(404).json({ error: 'Recycle record not found' });

        const item = rbRes.rows[0];
        const node = item.original_node;
        const origKey = item.original_key;
        let table = node;
        if (node === 'donors') table = 'blood_donors';

        // Un-soft-delete in live table
        await db.query(`UPDATE ${table} SET deleted_at = NULL WHERE id = $1`, [origKey]);
        // Remove from recycle bin
        await db.query('DELETE FROM recycle_bin WHERE id = $1', [id]);

        await logAdminAction(db, adminEmail, 'RESTORED_FROM_RECYCLE_BIN', node, origKey, {
            reason: `Restored record from Recycle Bin to ${node}`
        });

        broadcastChange('recycle_bin', 'delete', id);
        broadcastChange(node, 'restore', origKey, item.record_data);

        res.json({ success: true, message: 'Record restored' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/recycle-bin/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const adminEmail = req.user.email;

        await db.query('DELETE FROM recycle_bin WHERE id = $1', [id]);

        await logAdminAction(db, adminEmail, 'PERMANENTLY_DELETED', 'recycle_bin', id, {
            reason: 'Permanently erased record from Recycle Bin'
        });

        broadcastChange('recycle_bin', 'delete', id);
        res.json({ success: true, message: 'Permanently erased' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/recycle-bin', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const adminEmail = req.user.email;

        await db.query('DELETE FROM recycle_bin');

        await logAdminAction(db, adminEmail, 'EMPTY_RECYCLE_BIN', 'recycle_bin', 'ALL', {
            reason: 'SuperAdmin emptied Recycle Bin'
        });

        broadcastChange('recycle_bin', 'empty', 'ALL');
        res.json({ success: true, message: 'Recycle Bin emptied' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 10. SUB-ADMINS MANAGEMENT APIS
// ==========================================
app.get('/api/sub-admins', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT id, name, email, role, status, permissions, created_at FROM sub_admins ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sub-admins', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { name, email, password, permissions } = req.body;
        const subAdminId = 'SUB-' + Math.floor(100000 + Math.random() * 900000);

        await db.query(`
            INSERT INTO sub_admins (id, name, email, password, role, status, permissions, timestamp, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP);
        `, [
            subAdminId, name, email.trim(), password.trim(), 'SUB_ADMIN', 'Active',
            JSON.stringify(permissions || ['blood', 'requests', 'organ', 'logs']), Date.now()
        ]);

        await logAdminAction(db, req.user.email, 'CREATED_SUB_ADMIN', 'sub_admins', subAdminId, {
            newValue: `${name} (${email})`
        });

        broadcastChange('sub_admins', 'insert', subAdminId, { id: subAdminId, name, email, role: 'SUB_ADMIN', status: 'Active' });
        res.status(201).json({ success: true, id: subAdminId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sub-admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const { status, password, permissions } = req.body;

        if (status) {
            await db.query('UPDATE sub_admins SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
        }
        if (password) {
            await db.query('UPDATE sub_admins SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [password, id]);
        }
        if (permissions) {
            await db.query('UPDATE sub_admins SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [JSON.stringify(permissions), id]);
        }

        await logAdminAction(db, req.user.email, 'UPDATED_SUB_ADMIN', 'sub_admins', id, {
            newValue: `Status: ${status || 'unchanged'}`
        });

        broadcastChange('sub_admins', 'update', id, { id, status, permissions });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sub-admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        await db.query('DELETE FROM sub_admins WHERE id = $1', [id]);

        await logAdminAction(db, req.user.email, 'DELETED_SUB_ADMIN', 'sub_admins', id, {
            reason: 'SuperAdmin removed sub admin'
        });

        broadcastChange('sub_admins', 'delete', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 11. REGISTERED USERS APIS
// ==========================================
app.get('/api/users', authenticateToken, requireAdminOrSubAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const db = await getDB();
        const { id } = req.params;
        const u = req.body;

        const cur = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        if (cur.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const existing = cur.rows[0];

        const name = u.name !== undefined ? u.name : existing.name;
        const phone = u.phone !== undefined ? u.phone : existing.phone;
        const bloodGroup = (u.bloodGroup || u.blood_group) !== undefined ? (u.bloodGroup || u.blood_group) : existing.blood_group;
        const city = (u.city || u.location) !== undefined ? (u.city || u.location) : existing.city;
        const accountType = u.accountType !== undefined ? u.accountType : existing.account_type;
        const instagram = u.instagram !== undefined ? u.instagram : existing.instagram;
        const socialProfiles = u.socialProfiles !== undefined ? JSON.stringify(u.socialProfiles) : existing.social_profiles;
        const visibilitySettings = u.visibilitySettings !== undefined ? JSON.stringify(u.visibilitySettings) : existing.visibility_settings;
        const donorPrivacy = u.donorPrivacy !== undefined ? JSON.stringify(u.donorPrivacy) : existing.donor_privacy;

        const password = u.password !== undefined ? u.password : existing.password;

        await db.query(`
            UPDATE users SET
                name = $1, full_name = $1, phone = $2, blood_group = $3, city = $4, location = $4,
                account_type = $5, instagram = $6, social_profiles = $7, visibility_settings = $8,
                donor_privacy = $9, password = $10, updated_at = CURRENT_TIMESTAMP
            WHERE id = $11;
        `, [name, phone, bloodGroup, city, accountType, instagram, socialProfiles, visibilitySettings, donorPrivacy, password, id]);

        broadcastChange('users', 'update', id, { ...u, id });
        res.json({ success: true, message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 12. MESSAGES (CHAT) APIS
// ==========================================
app.get('/api/messages', async (req, res) => {
    try {
        const db = await getDB();
        const { uid } = req.query;
        let sql = 'SELECT * FROM messages';
        const params = [];
        if (uid) {
            params.push(uid);
            sql += ' WHERE sender_uid = $1 OR receiver_uid = $1';
        }
        sql += ' ORDER BY timestamp ASC';
        const result = await db.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const db = await getDB();
        const m = req.body;
        const id = m.id || '-CHAT' + Date.now().toString(36);

        await db.query(`
            INSERT INTO messages (
                id, message_id, sender_uid, sender_name, sender_email,
                receiver_uid, receiver_name, receiver_blood_group, receiver_city,
                receiver_hospital, subject, message, source_page, read, timestamp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP);
        `, [
            id, m.messageId || ('MSG-' + Math.floor(100000 + Math.random() * 900000)),
            m.senderUid, m.senderName, m.senderEmail || null,
            m.receiverUid, m.receiverName, m.receiverBloodGroup || null,
            m.receiverCity || null, m.receiverHospital || null,
            m.subject || 'Blood Request Chat', m.message, m.sourcePage || null,
            false, Date.now()
        ]);

        broadcastChange('messages', 'insert', id, { ...m, id });
        res.status(201).json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 12.5 GENERIC DATABASE ROUTING & FALLBACK
// ==========================================
app.all(['/api/db/:node', '/api/db/:node/:key'], authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const { node, key } = req.params;
        const method = req.method;
        const body = req.body;
        const adminEmail = (req.user && req.user.email) || 'system@lifesaver.com';

        let table = node;
        if (node === 'donors') table = 'blood_donors';

        if (method === 'GET') {
            if (key) {
                const r = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [key]);
                return res.json(r.rows.length > 0 ? r.rows[0] : null);
            } else {
                const r = await db.query(`SELECT * FROM ${table}`);
                return res.json(r.rows);
            }
        }

        if (method === 'POST') {
            const newId = body.id || key || ('-P' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6));
            if (node === 'recycle_bin') {
                await db.query(`
                    INSERT INTO recycle_bin (id, original_node, original_key, record_data, deleted_by, deleted_at, timestamp, created_at)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING;
                `, [newId, body.originalNode || 'donors', body.originalKey || newId, JSON.stringify(body.recordData || {}), adminEmail, Date.now()]);
            } else if (node === 'referral_codes') {
                await db.query('INSERT INTO referral_codes (code, user_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [newId, body]);
            } else if (node === 'referrals') {
                const [refBy, refUid] = newId.split('/');
                if (refBy && refUid) {
                    await db.query('INSERT INTO referrals (referrer_uid, referred_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [refBy, refUid]);
                }
            } else if (node === 'admin_audit_logs') {
                await db.query(`
                    INSERT INTO admin_audit_logs (id, audit_id, admin_email, action, target_type, target_id, donor_name, hospital_name, previous_value, new_value, reason, timestamp, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP);
                `, [newId, body.auditId || ('AUDIT-' + Date.now()), adminEmail, body.action || 'ACTION', body.targetType || null, body.targetId || null, body.donorName || null, body.hospitalName || null, body.previousValue || null, body.newValue || null, body.reason || null, Date.now()]);
            }
            broadcastChange(node, 'insert', newId, body);
            return res.json({ success: true, key: newId });
        }

        if (method === 'PUT' || method === 'PATCH') {
            if (node === 'recycle_bin') {
                // Restore operation: if setting into live node, restore
                await db.query(`DELETE FROM recycle_bin WHERE id = $1`, [key]);
                broadcastChange('recycle_bin', 'delete', key);
                return res.json({ success: true });
            } else if (node === 'referral_codes') {
                await db.query('INSERT INTO referral_codes (code, user_id) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET user_id = EXCLUDED.user_id', [key, body]);
                return res.json({ success: true });
            } else if (node === 'referrals') {
                const parts = (key || '').split('/');
                if (parts.length >= 2) {
                    await db.query('INSERT INTO referrals (referrer_uid, referred_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [parts[0], parts[1]]);
                }
                return res.json({ success: true });
            } else if (node === 'admins') {
                await db.query(`
                    INSERT INTO admins (id, email, name, role, is_admin, login_time)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        login_time = CURRENT_TIMESTAMP;
                `, [key, body.email || 'admin@lifesaver.com', body.name || 'Admin', body.role || 'SUPER_ADMIN', body.isAdmin ?? true]);
                broadcastChange('admins', 'update', key, body);
                return res.json({ success: true });
            } else if (node === 'sub_admins') {
                if (body.password) {
                    await db.query('UPDATE sub_admins SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [body.password, key]);
                }
                if (body.status) {
                    await db.query('UPDATE sub_admins SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [body.status, key]);
                }
                broadcastChange('sub_admins', 'update', key, body);
                return res.json({ success: true });
            }
            broadcastChange(node, 'update', key, body);
            return res.json({ success: true });
        }

        if (method === 'DELETE') {
            if (node === 'recycle_bin') {
                if (key) {
                    await db.query('DELETE FROM recycle_bin WHERE id = $1', [key]);
                } else {
                    await db.query('DELETE FROM recycle_bin');
                }
                broadcastChange('recycle_bin', 'delete', key || 'ALL');
                return res.json({ success: true });
            }
            broadcastChange(node, 'delete', key);
            return res.json({ success: true });
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('Generic DB route error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 13. GLOBAL SEARCH RECORDS API
// ==========================================
app.get('/api/search', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const q = (req.query.q || '').trim().toLowerCase();
        if (!q) return res.json({ donors: [], requests: [], hospitals: [], users: [] });

        const term = `%${q}%`;
        const [donors, requests, hospitals, users] = await Promise.all([
            db.query(`
                SELECT id, name, phone, blood_group, city, status, phone_visibility FROM blood_donors
                WHERE deleted_at IS NULL AND (LOWER(name) LIKE $1 OR LOWER(blood_group) LIKE $1 OR LOWER(city) LIKE $1 OR phone LIKE $1)
                LIMIT 50
            `, [term]),
            db.query(`
                SELECT id, patient_name, requester_name, blood_group, units, hospital, city, status FROM blood_requests
                WHERE deleted_at IS NULL AND (LOWER(patient_name) LIKE $1 OR LOWER(hospital) LIKE $1 OR LOWER(blood_group) LIKE $1 OR LOWER(city) LIKE $1)
                LIMIT 50
            `, [term]),
            db.query(`
                SELECT id, name, city, phone, emergency_phone, status FROM partner_hospitals
                WHERE deleted_at IS NULL AND (LOWER(name) LIKE $1 OR LOWER(city) LIKE $1 OR phone LIKE $1)
                LIMIT 50
            `, [term]),
            db.query(`
                SELECT id, name, email, phone, blood_group, city FROM users
                WHERE deleted_at IS NULL AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR phone LIKE $1)
                LIMIT 50
            `, [term])
        ]);

        res.json({
            donors: donors.rows,
            requests: requests.rows,
            hospitals: hospitals.rows,
            users: users.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server locally or on Render (skip server.listen on Vercel serverless)
if (!process.env.VERCEL) {
    server.on('error', (err) => {
        console.error('❌ Server startup/runtime error:', err);
    });

    process.on('uncaughtException', (err) => {
        console.error('⚠️ Uncaught Exception:', err);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('⚠️ Unhandled Rejection:', reason);
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`=======================================================`);
        console.log(`🩸 LifeSaver-Care Server running on port ${PORT}`);
        console.log(`⚡ Real-Time Socket.IO Active on port ${PORT}`);
        console.log(`=======================================================`);
    });

    initDatabase()
        .then(() => {
            console.log(`💾 PostgreSQL Connected and Database Schema Ready`);
        })
        .catch(err => {
            console.error('⚠️ Database connection notice during startup:', err.message);
        });
}

module.exports = { app, server };

