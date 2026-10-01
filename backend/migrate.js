const fs = require('fs');
const path = require('path');
const { getDB, initDatabase } = require('./db');

function parseTimestamp(val) {
    if (!val) return Date.now();
    if (typeof val === 'number') return Math.floor(val);
    const ms = new Date(val).getTime();
    return isNaN(ms) ? Date.now() : ms;
}

function parseDate(val) {
    if (!val) return new Date();
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
}

async function runMigration(options = {}) {
    console.log('🚀 Starting Firebase to PostgreSQL Migration...');

    if (!options.skipInit) {
        await initDatabase({ skipAutoSeed: true });
    }
    const db = await getDB();

    const backupPath = path.resolve(__dirname, '../firebase_backup.json');
    if (!fs.existsSync(backupPath)) {
        throw new Error('firebase_backup.json not found! Please ensure backup exists before running migration.');
    }

    const firebaseData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    const counts = {
        users: 0,
        admins: 0,
        sub_admins: 0,
        blood_donors: 0,
        blood_requests: 0,
        partner_hospitals: 0,
        hospital_communications: 0,
        contact_messages: 0,
        donor_contact_logs: 0,
        contact_requests: 0,
        organ_donors: 0,
        admin_audit_logs: 0,
        profile_change_requests: 0,
        account_change_requests: 0,
        recycle_bin: 0,
        messages: 0,
        referral_codes: 0,
        referrals: 0,
        ai_learning_dataset: 0
    };

    // 1. Users
    if (firebaseData.users) {
        for (const [id, u] of Object.entries(firebaseData.users)) {
            await db.query(`
                INSERT INTO users (
                    id, name, full_name, email, password, phone, dob, blood_group, city, location,
                    account_type, is_blood_donor, referral_code, referred_by, referral_count, role,
                    instagram, social_profiles, visibility_settings, donor_privacy, timestamp,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    phone = EXCLUDED.phone,
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                id,
                u.name || u.fullName || 'Anonymous',
                u.fullName || u.name || 'Anonymous',
                u.email || null,
                u.password || null,
                u.phone || null,
                u.dob || null,
                u.bloodGroup || u.blood_group || null,
                u.city || u.location || null,
                u.location || u.city || null,
                u.accountType || 'public',
                !!u.isBloodDonor,
                u.referralCode || null,
                u.referredBy || null,
                u.referralCount || 0,
                u.role || 'user',
                u.instagram || null,
                JSON.stringify(u.socialProfiles || {}),
                JSON.stringify(u.visibilitySettings || {}),
                JSON.stringify(u.donorPrivacy || {}),
                parseTimestamp(u.timestamp || u.createdAt),
                parseDate(u.createdAt),
                parseDate(u.updatedAt)
            ]);
            counts.users++;
        }
    }

    // 2. Admins
    if (firebaseData.admins) {
        for (const [id, a] of Object.entries(firebaseData.admins)) {
            await db.query(`
                INSERT INTO admins (id, email, name, password, role, is_admin, login_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role,
                    login_time = EXCLUDED.login_time;
            `, [
                id,
                a.email || 'admin@lifesaver.com',
                a.name || 'Admin',
                a.password || 'admin123',
                a.role || 'SUPER_ADMIN',
                a.isAdmin ?? true,
                parseDate(a.loginTime)
            ]);
            counts.admins++;
        }
    }

    // 3. Sub-Admins
    if (firebaseData.sub_admins) {
        for (const [id, sa] of Object.entries(firebaseData.sub_admins)) {
            await db.query(`
                INSERT INTO sub_admins (id, name, email, password, role, status, permissions, timestamp, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    status = EXCLUDED.status;
            `, [
                sa.subAdminId || id,
                sa.name || 'Sub Admin',
                sa.email,
                sa.password,
                sa.role || 'SUB_ADMIN',
                sa.status || 'Active',
                JSON.stringify(sa.permissions || ['blood', 'requests', 'organ', 'logs']),
                parseTimestamp(sa.timestamp || sa.createdAt),
                parseDate(sa.createdAt)
            ]);
            counts.sub_admins++;
        }
    }

    // 4. Blood Donors (donors node)
    if (firebaseData.donors) {
        for (const [id, d] of Object.entries(firebaseData.donors)) {
            await db.query(`
                INSERT INTO blood_donors (
                    id, user_id, name, email, phone, blood_group, city, dob, status,
                    phone_visibility, allow_emergency_contact, alcohol_last_24h,
                    times_donated, donation_count, registered_date, medical_history,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    phone = EXCLUDED.phone,
                    blood_group = EXCLUDED.blood_group,
                    city = EXCLUDED.city,
                    status = EXCLUDED.status;
            `, [
                id,
                d.userId || null,
                d.name || 'Anonymous',
                d.email || null,
                d.phone || d.mobileNumber || null,
                d.bloodGroup || 'O+',
                d.city || null,
                d.dob || null,
                d.status || 'Available',
                d.phoneVisibility || d.accountType || d.contactVisibility || 'public',
                d.allowEmergencyContact ?? true,
                d.alcoholLast24h || 'No',
                d.timesDonated || d.donationCount || 0,
                d.donationCount || d.timesDonated || 0,
                d.registeredDate || null,
                JSON.stringify(d.medicalHistory || {}),
                parseDate(d.registeredDate),
                new Date()
            ]);
            counts.blood_donors++;
        }
    }

    // 5. Blood Requests
    if (firebaseData.blood_requests) {
        for (const [id, r] of Object.entries(firebaseData.blood_requests)) {
            await db.query(`
                INSERT INTO blood_requests (
                    id, user_id, user_email, patient_name, requester_name, blood_group,
                    units, hospital, address, city, phone, contact_visibility, urgency,
                    status, required_date, notes, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                r.userId || null,
                r.userEmail || null,
                r.patientName || r.name || null,
                r.requesterName || r.name || null,
                r.bloodGroup || 'O+',
                r.units || 1,
                r.hospital || 'Local Hospital',
                r.address || null,
                r.city || null,
                r.phone || r.contact || null,
                r.contactVisibility || 'public',
                r.urgency || 'Urgent',
                r.status || 'Pending',
                r.requiredDate || null,
                r.notes || null,
                parseTimestamp(r.timestamp || r.createdAt),
                parseDate(r.createdAt)
            ]);
            counts.blood_requests++;
        }
    }

    // 6. Partner Hospitals
    if (firebaseData.partner_hospitals) {
        for (const [id, h] of Object.entries(firebaseData.partner_hospitals)) {
            await db.query(`
                INSERT INTO partner_hospitals (
                    id, name, city, address, phone, emergency_phone, email, coordinator,
                    status, blood_inventory, rating, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                h.name || h.hospitalName || 'Hospital',
                h.city || 'City',
                h.address || null,
                h.phone || h.contact || null,
                h.emergencyPhone || null,
                h.email || null,
                h.coordinator || null,
                h.status || 'Active',
                JSON.stringify(h.bloodInventory || {}),
                h.rating || 5.0,
                parseDate(h.createdAt)
            ]);
            counts.partner_hospitals++;
        }
    }

    // 7. Organ Donors
    if (firebaseData.organ_donors) {
        for (const [id, od] of Object.entries(firebaseData.organ_donors)) {
            await db.query(`
                INSERT INTO organ_donors (
                    id, user_id, name, email, phone, dob, age, city, organs_pledged,
                    alcohol_habit, smoking_habit, medical_conditions, clearance_rating,
                    allow_contact, status, registered_date, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                od.userId || null,
                od.name || 'Anonymous',
                od.email || null,
                od.phone || null,
                od.dob || null,
                od.age ? parseInt(od.age) : null,
                od.city || null,
                od.organsPledged || 'All',
                od.alcoholHabit || 'Never',
                od.smokingHabit || 'Non-Smoker',
                od.medicalConditions || 'Clean',
                od.clearanceRating || 'Prime Candidate',
                od.allowContact ?? true,
                od.status || 'Active',
                od.registeredDate || null,
                parseDate(od.createdAt)
            ]);
            counts.organ_donors++;
        }
    }

    // 8. Contact Messages
    if (firebaseData.contact_messages) {
        for (const [id, m] of Object.entries(firebaseData.contact_messages)) {
            await db.query(`
                INSERT INTO contact_messages (
                    id, name, email, mobile, reason, message, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                m.name || 'Anonymous',
                m.email || null,
                m.mobile || null,
                m.reason || 'General',
                m.message || null,
                m.status || 'new',
                parseDate(m.createdAt)
            ]);
            counts.contact_messages++;
        }
    }

    // 9. Admin Audit Logs
    if (firebaseData.admin_audit_logs) {
        for (const [id, log] of Object.entries(firebaseData.admin_audit_logs)) {
            await db.query(`
                INSERT INTO admin_audit_logs (
                    id, audit_id, admin_email, action, target_type, target_id,
                    donor_name, hospital_name, previous_value, new_value, reason,
                    timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                log.auditId || null,
                log.adminEmail || 'admin@lifesaver.com',
                log.action || 'ACTION',
                log.targetType || null,
                log.targetId || null,
                log.donorName || null,
                log.hospitalName || null,
                typeof log.previousValue === 'object' ? JSON.stringify(log.previousValue) : (log.previousValue || null),
                typeof log.newValue === 'object' ? JSON.stringify(log.newValue) : (log.newValue || null),
                log.reason || null,
                parseTimestamp(log.timestamp || log.createdAt),
                parseDate(log.createdAt)
            ]);
            counts.admin_audit_logs++;
        }
    }

    // 10. Recycle Bin
    if (firebaseData.recycle_bin) {
        for (const [id, rb] of Object.entries(firebaseData.recycle_bin)) {
            await db.query(`
                INSERT INTO recycle_bin (
                    id, original_node, original_key, record_data, deleted_by, deleted_at, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                rb.originalNode || 'donors',
                rb.originalKey || id,
                JSON.stringify(rb.recordData || {}),
                rb.deletedBy || 'admin@lifesaver.com',
                parseDate(rb.deletedAt),
                parseTimestamp(rb.timestamp || rb.deletedAt),
                new Date()
            ]);
            counts.recycle_bin++;
        }
    }

    // 11. Messages
    if (firebaseData.messages) {
        for (const [id, msg] of Object.entries(firebaseData.messages)) {
            await db.query(`
                INSERT INTO messages (
                    id, message_id, sender_uid, sender_name, sender_email,
                    receiver_uid, receiver_name, receiver_blood_group, receiver_city,
                    receiver_hospital, subject, message, source_page, read, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                msg.messageId || null,
                msg.senderUid || null,
                msg.senderName || null,
                msg.senderEmail || null,
                msg.receiverUid || null,
                msg.receiverName || null,
                msg.receiverBloodGroup || null,
                msg.receiverCity || null,
                msg.receiverHospital || null,
                msg.subject || null,
                msg.message || null,
                msg.sourcePage || null,
                !!msg.read,
                parseTimestamp(msg.timestamp || msg.createdAt),
                parseDate(msg.createdAt)
            ]);
            counts.messages++;
        }
    }

    // 12. Referral Codes
    if (firebaseData.referral_codes) {
        for (const [code, uid] of Object.entries(firebaseData.referral_codes)) {
            await db.query(`
                INSERT INTO referral_codes (code, user_id)
                VALUES ($1, $2)
                ON CONFLICT (code) DO NOTHING;
            `, [code, uid]);
            counts.referral_codes++;
        }
    }

    // 13. Referrals
    if (firebaseData.referrals) {
        for (const [referrerUid, referredObj] of Object.entries(firebaseData.referrals)) {
            if (typeof referredObj === 'object' && referredObj !== null) {
                for (const referredUid of Object.keys(referredObj)) {
                    await db.query(`
                        INSERT INTO referrals (referrer_uid, referred_uid)
                        VALUES ($1, $2)
                        ON CONFLICT (referrer_uid, referred_uid) DO NOTHING;
                    `, [referrerUid, referredUid]);
                    counts.referrals++;
                }
            }
        }
    }

    // 14. AI Learning Dataset
    if (firebaseData.ai_learning_dataset) {
        for (const [id, item] of Object.entries(firebaseData.ai_learning_dataset)) {
            await db.query(`
                INSERT INTO ai_learning_dataset (
                    id, active_symptom, user_query, response_snippet, has_image_attached, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                item.activeSymptom || null,
                item.userQuery || null,
                item.responseSnippet || null,
                !!item.hasImageAttached,
                parseTimestamp(item.timestamp)
            ]);
            counts.ai_learning_dataset++;
        }
    }

    // 15. Other collections if present in Firebase
    if (firebaseData.hospital_communications) {
        for (const [id, comm] of Object.entries(firebaseData.hospital_communications)) {
            await db.query(`
                INSERT INTO hospital_communications (
                    id, hospital_id, hospital_name, subject, message, sender_admin_email, status, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                comm.hospitalId || null,
                comm.hospitalName || null,
                comm.subject || null,
                comm.message || null,
                comm.senderAdminEmail || null,
                comm.status || 'Sent',
                parseTimestamp(comm.timestamp || comm.createdAt)
            ]);
            counts.hospital_communications++;
        }
    }

    if (firebaseData.contact_audit_logs) {
        for (const [id, log] of Object.entries(firebaseData.contact_audit_logs)) {
            await db.query(`
                INSERT INTO donor_contact_logs (
                    id, donor_id, donor_name, requester_uid, requester_name, requester_phone,
                    requester_email, blood_group, contact_action, status, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                log.donorId || null,
                log.donorName || null,
                log.requesterUid || null,
                log.requesterName || null,
                log.requesterPhone || null,
                log.requesterEmail || null,
                log.bloodGroup || null,
                log.contactAction || 'Contact Attempt',
                log.status || 'Success',
                parseTimestamp(log.timestamp || log.createdAt)
            ]);
            counts.donor_contact_logs++;
        }
    }

    if (firebaseData.contact_requests) {
        for (const [id, req] of Object.entries(firebaseData.contact_requests)) {
            await db.query(`
                INSERT INTO contact_requests (
                    id, donor_id, donor_name, requester_uid, requester_name, requester_phone,
                    requester_email, blood_group, status, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING;
            `, [
                id,
                req.donorId || null,
                req.donorName || null,
                req.requesterUid || null,
                req.requesterName || null,
                req.requesterPhone || null,
                req.requesterEmail || null,
                req.bloodGroup || null,
                req.status || 'pending',
                parseTimestamp(req.timestamp || req.createdAt)
            ]);
            counts.contact_requests++;
        }
    }

    console.log('✅ Migration data insertion complete!');
    return counts;
}

async function verifyMigration() {
    console.log('\n🔍 Verifying PostgreSQL Migrated Data...');
    const db = await getDB();
    const backupPath = path.resolve(__dirname, '../firebase_backup.json');
    const fb = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    const tablesToCheck = [
        { table: 'users', fbKey: 'users' },
        { table: 'admins', fbKey: 'admins' },
        { table: 'sub_admins', fbKey: 'sub_admins' },
        { table: 'blood_donors', fbKey: 'donors' },
        { table: 'admin_audit_logs', fbKey: 'admin_audit_logs' },
        { table: 'recycle_bin', fbKey: 'recycle_bin' },
        { table: 'messages', fbKey: 'messages' },
        { table: 'referral_codes', fbKey: 'referral_codes' },
        { table: 'ai_learning_dataset', fbKey: 'ai_learning_dataset' }
    ];

    let allPassed = true;
    console.log('------------------------------------------------------------');
    console.log(String('Module / Table').padEnd(25) + String('Firebase').padEnd(12) + String('PostgreSQL').padEnd(12) + 'Status');
    console.log('------------------------------------------------------------');

    for (const item of tablesToCheck) {
        const fbCount = fb[item.fbKey] ? Object.keys(fb[item.fbKey]).length : 0;
        const pgRes = await db.query(`SELECT COUNT(*) as count FROM ${item.table}`);
        const pgCount = parseInt(pgRes.rows[0].count);

        const match = (fbCount === pgCount);
        if (!match) allPassed = false;

        const status = match ? '✅ VERIFIED' : `⚠️ MISMATCH (${pgCount} vs ${fbCount})`;
        console.log(String(item.table).padEnd(25) + String(fbCount).padEnd(12) + String(pgCount).padEnd(12) + status);
    }
    console.log('------------------------------------------------------------');

    if (allPassed) {
        console.log('🎉 ALL DATA FULLY VERIFIED 100% MATCH WITH FIREBASE!');
    } else {
        console.warn('⚠️ Verification finished with some discrepancies. Please check.');
    }
}

if (require.main === module) {
    runMigration()
        .then(() => verifyMigration())
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}

module.exports = {
    runMigration,
    verifyMigration
};
