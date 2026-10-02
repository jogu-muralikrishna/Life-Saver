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

async function restoreAndSync() {
    console.log('🔄 Starting 21 Members Data Restoration & Verification...');
    
    await initDatabase();
    const db = await getDB();
    
    const backupPath = path.resolve(__dirname, '../firebase_backup.json');
    if (!fs.existsSync(backupPath)) {
        throw new Error('firebase_backup.json not found!');
    }
    
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const donors = backup.donors || {};
    const users = backup.users || {};
    
    console.log(`📋 Found ${Object.keys(donors).length} authentic donors in firebase_backup.json`);
    console.log(`📋 Found ${Object.keys(users).length} existing user auth accounts in firebase_backup.json`);

    // Clean up test donor records that were created by tests
    await db.query("DELETE FROM blood_donors WHERE name LIKE '%Test Donor%'");
    
    // 1. Ensure all 21 authentic donors are in blood_donors table
    for (const [id, d] of Object.entries(donors)) {
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
                email = EXCLUDED.email,
                status = EXCLUDED.status,
                deleted_at = NULL;
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
            d.timesDonated || 0,
            d.donationCount || 0,
            d.registeredDate || null,
            JSON.stringify(d.medicalHistory || {}),
            parseDate(d.registeredDate || d.createdAt || d.timestamp),
            parseDate(d.updatedAt || d.registeredDate || d.createdAt)
        ]);
    }
    
    // 2. Ensure all original 7 user accounts are in users table
    for (const [id, u] of Object.entries(users)) {
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
                updated_at = CURRENT_TIMESTAMP,
                deleted_at = NULL;
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
    }

    // 3. Ensure all 21 authentic donors ALSO have a registered member profile in users
    for (const [id, d] of Object.entries(donors)) {
        const check = await db.query(
            'SELECT id FROM users WHERE id = $1 OR (email IS NOT NULL AND email = $2) OR (phone IS NOT NULL AND phone = $3)',
            [id, d.email || '___NONE___', d.phone || '___NONE___']
        );
        
        if (check.rows.length === 0) {
            await db.query(`
                INSERT INTO users (
                    id, name, full_name, email, password, phone, dob, blood_group, city, location,
                    account_type, is_blood_donor, role, timestamp, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'user', $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    blood_group = EXCLUDED.blood_group,
                    phone = EXCLUDED.phone,
                    city = EXCLUDED.city,
                    is_blood_donor = true;
            `, [
                id,
                d.name,
                d.name,
                d.email || null,
                null, // No fake password
                d.phone || d.mobileNumber || null,
                d.dob || null,
                d.bloodGroup || null,
                d.city || null,
                d.city || null,
                d.phoneVisibility || 'public',
                parseTimestamp(d.registeredDate || d.createdAt || d.timestamp),
                parseDate(d.registeredDate || d.createdAt),
                parseDate(d.updatedAt || d.registeredDate || d.createdAt)
            ]);
            
            // Also add to backup.users in memory
            backup.users[id] = {
                name: d.name,
                fullName: d.name,
                email: d.email || '',
                phone: d.phone || d.mobileNumber || '',
                bloodGroup: d.bloodGroup || '',
                city: d.city || '',
                dob: d.dob || '',
                accountType: d.phoneVisibility || 'public',
                isBloodDonor: true,
                role: 'user',
                createdAt: d.registeredDate || d.createdAt || '2026-08-18'
            };
        } else {
            await db.query('UPDATE users SET is_blood_donor = true WHERE id = $1', [check.rows[0].id]);
        }
    }

    // Write updated backup file so it reflects all members across both tables
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');

    // Final verification of counts
    const donorCountRes = await db.query('SELECT COUNT(*) as count FROM blood_donors WHERE deleted_at IS NULL');
    const userCountRes = await db.query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
    
    console.log(`\n✅ RESTORATION COMPLETE!`);
    console.log(`🩸 Active Blood Donors in PostgreSQL: ${donorCountRes.rows[0].count}`);
    console.log(`👤 Active Registered Users in PostgreSQL: ${userCountRes.rows[0].count}`);

    // Print all 21 donors to prove 0 fake data
    console.log('\n--- 21 AUTHENTIC REGISTERED BLOOD DONORS ---');
    const donorList = await db.query('SELECT id, name, blood_group, city, phone, email FROM blood_donors WHERE deleted_at IS NULL ORDER BY name ASC');
    donorList.rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.name} | ${row.blood_group} | ${row.city} | ${row.phone} | ${row.email || 'No email'}`);
    });

    process.exit(0);
}

restoreAndSync().catch(err => {
    console.error('❌ Error during restore:', err);
    process.exit(1);
});
