const http = require('http');
const { io: ioClient } = require('socket.io-client');

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const reqHeaders = { ...headers };
        if (payload) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (e) {}
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTestSuite() {
    console.log('===============================================================');
    console.log('🧪 RUNNING COMPLETE LIFESAVER POSTGRESQL & REAL-TIME TEST SUITE');
    console.log('===============================================================');

    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failedTests++;
        }
    }

    // -------------------------------------------------------------
    // TEST GROUP 1 & 2: Authentication & Database Verification
    // -------------------------------------------------------------
    console.log('\n--- 1. AUTHENTICATION & ROLE ENFORCEMENT ---');

    // 1.1 Super Admin Login with raw text password
    const superAdminLogin = await request('POST', '/api/auth/admin-login', {
        email: 'admin@lifesaver.com',
        password: 'admin123',
        role: 'SUPER_ADMIN'
    });
    assert(superAdminLogin.status === 200 && superAdminLogin.data.success, 'Super Admin logs in successfully with raw password');
    const superToken = superAdminLogin.data.token;

    // 1.2 Sub-Admin Login with raw text password
    const subAdminLogin = await request('POST', '/api/auth/admin-login', {
        email: 'rishitalatam@gmail.com',
        password: 'rishi@2008',
        role: 'SUB_ADMIN'
    });
    assert(subAdminLogin.status === 200 && subAdminLogin.data.role === 'SUB_ADMIN', 'Sub-Admin logs in successfully with raw password');
    const subToken = subAdminLogin.data.token;

    console.log('\n--- 2. DATABASE RECORD COUNT VERIFICATION VIA SECURE API ---');
    const [initial_usersRes, initial_subAdminsRes, initial_donorsRes, initial_logsRes, initial_recycleRes, initial_messagesRes] = await Promise.all([
        request('GET', '/api/db/users', null, { 'Authorization': `Bearer ${superToken}` }),
        request('GET', '/api/db/sub_admins', null, { 'Authorization': `Bearer ${superToken}` }),
        request('GET', '/api/db/donors', null, { 'Authorization': `Bearer ${superToken}` }),
        request('GET', '/api/db/admin_audit_logs', null, { 'Authorization': `Bearer ${superToken}` }),
        request('GET', '/api/db/recycle_bin', null, { 'Authorization': `Bearer ${superToken}` }),
        request('GET', '/api/db/messages', null, { 'Authorization': `Bearer ${superToken}` })
    ]);

    assert(Array.isArray(initial_usersRes.data) && initial_usersRes.data.length >= 7, 'Users table contains all migrated users');
    assert(Array.isArray(initial_subAdminsRes.data) && initial_subAdminsRes.data.length >= 2, 'Sub-Admins table contains all 2 sub-admins');
    assert(Array.isArray(initial_donorsRes.data) && initial_donorsRes.data.length >= 21, 'Blood Donors table contains all 21 donors');
    assert(Array.isArray(initial_logsRes.data) && initial_logsRes.data.length >= 63, 'Admin Audit Logs contains all 63 audit logs');
    assert(Array.isArray(initial_recycleRes.data) && initial_recycleRes.data.length === 4, 'Recycle Bin contains exactly 4 soft-deleted records');
    assert(Array.isArray(initial_messagesRes.data) && initial_messagesRes.data.length >= 10, 'Messages table contains all 10 messages');

    // 2.3 Sub-Admin Permission Guard (Backend Protection)
    const subDeleteAttempt = await request('DELETE', '/api/records/donors/sample-key', null, {
        'Authorization': `Bearer ${subToken}`
    });
    assert(subDeleteAttempt.status === 403, 'Sub-Admin CANNOT delete records (enforced 403 Forbidden on backend)');

    const subCreateAdminAttempt = await request('POST', '/api/sub-admins', {
        name: 'Hacker',
        email: 'hacker@test.com',
        password: '123'
    }, {
        'Authorization': `Bearer ${subToken}`
    });
    assert(subCreateAdminAttempt.status === 403, 'Sub-Admin CANNOT manage other admins (enforced 403 Forbidden on backend)');

    // -------------------------------------------------------------
    // TEST GROUP 3: All 13 Admin Dashboard Modules
    // -------------------------------------------------------------
    console.log('\n--- 3. ALL 13 ADMIN MODULES INTEGRATION ---');

    // Module 1: Blood Donors
    const donorsRes = await request('GET', '/api/donors');
    assert(donorsRes.status === 200 && donorsRes.data.length >= 21, `Module 1 (Blood Donors): Retrieved ${donorsRes.data.length} donors`);

    // Module 2: Blood Requests
    const newReqRes = await request('POST', '/api/blood-requests', {
        patientName: 'K. Ramesh',
        bloodGroup: 'B+',
        units: 2,
        hospital: 'Apollo Hospitals',
        city: 'Hyderabad',
        urgency: 'Emergency'
    });
    assert(newReqRes.status === 201 && newReqRes.data.success, 'Module 2 (Blood Requests): Created new emergency blood request');
    const testReqId = newReqRes.data.id;

    const updateReqRes = await request('PUT', `/api/blood-requests/${testReqId}`, { status: 'In Progress' }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(updateReqRes.status === 200, 'Module 2 (Blood Requests): Updated request status to "In Progress"');

    // Module 3: Collaborating Hospitals
    const hospRes = await request('POST', '/api/hospitals', {
        name: 'Yashoda Hospital',
        city: 'Secunderabad',
        phone: '040-27713333',
        emergencyPhone: '105711',
        coordinator: 'Dr. Rao',
        status: 'Active'
    }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(hospRes.status === 201 && hospRes.data.success, 'Module 3 (Collaborating Hospitals): Registered new partner hospital');
    const testHospId = hospRes.data.id;

    // Hospital Communication Dispatch
    const commRes = await request('POST', '/api/hospitals/communications', {
        hospitalId: testHospId,
        hospitalName: 'Yashoda Hospital',
        subject: 'Platelets Shortage Alert',
        message: 'Please review standby inventory for emergency requirement.'
    }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(commRes.status === 200 && commRes.data.success, 'Module 3 (Collaborating Hospitals): Sent hospital dispatch message');

    // Module 4: Contact Messages
    const msgRes = await request('POST', '/api/contact-messages', {
        name: 'Venkatesh Rao',
        email: 'venkat@example.com',
        mobile: '9848012345',
        reason: 'Volunteering Inquiry',
        message: 'Interested in organizing blood drive.'
    });
    assert(msgRes.status === 201 && msgRes.data.success, 'Module 4 (Contact Messages): Received contact message');
    const testMsgId = msgRes.data.id;

    const updateMsgRes = await request('PUT', `/api/contact-messages/${testMsgId}`, { status: 'in_progress' }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(updateMsgRes.status === 200, 'Module 4 (Contact Messages): Updated contact message status');

    // Module 5: Admin Activity
    const syncRes = await request('GET', '/api/sync/all');
    assert(syncRes.status === 200 && Object.keys(syncRes.data.admin_audit_logs).length >= 63, `Module 5 (Admin Activity): Retrieved ${Object.keys(syncRes.data.admin_audit_logs).length} audit logs`);

    // Module 6: Profile Requests
    const profReqRes = await request('POST', '/api/profile-requests', {
        userId: 'usr_test_1',
        userName: 'Priya Sharma',
        userEmail: 'priya@test.com',
        requestType: 'City Update',
        currentValue: 'Warangal',
        targetValue: 'Hyderabad',
        reason: 'Relocated for work'
    });
    assert(profReqRes.status === 201 && profReqRes.data.success, 'Module 6 (Profile Requests): Submitted profile change request');

    // Module 7: Account Privacy Requests
    const privReqRes = await request('POST', '/api/privacy-requests', {
        userId: 'usr_test_1',
        userName: 'Priya Sharma',
        userEmail: 'priya@test.com',
        requestType: 'Privacy Preference Change',
        currentValue: 'public',
        targetValue: 'private',
        reason: 'Prefer contact requests only'
    });
    assert(privReqRes.status === 201 && privReqRes.data.success, 'Module 7 (Account Privacy Requests): Submitted privacy change request');

    // Module 8: Donor Contact Logs
    const logDonorContact = await request('POST', '/api/db/contact_audit_logs', {
        donorId: '-OmMkSGlUXInffeTsule',
        donorName: 'Jalaka Umadevi',
        requesterName: 'Emergency Triage',
        bloodGroup: 'O-',
        contactAction: 'Phone Call',
        status: 'Connected'
    }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(logDonorContact.status === 200 && logDonorContact.data.success, 'Module 8 (Donor Contact Logs): Logged donor contact interaction');

    // Module 9: Organ Donors
    const organRes = await request('POST', '/api/organ-donors', {
        name: 'Anil Kumar',
        email: 'anil@test.com',
        phone: '9849011223',
        age: 32,
        city: 'Visakhapatnam',
        organsPledged: 'Eyes, Kidneys',
        clearanceRating: 'Prime Candidate'
    });
    assert(organRes.status === 201 && organRes.data.success, 'Module 9 (Organ Donors): Pledged organ donation');

    // Module 10: Registered Users
    const usersRes = await request('GET', '/api/users', null, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(usersRes.status === 200 && usersRes.data.length >= 7, `Module 10 (Registered Users): Retrieved ${usersRes.data.length} registered users`);

    // Module 11: Recycle Bin (Soft Delete & Restore)
    const recycleBinBefore = await request('GET', '/api/sync/all');
    const rbCountBefore = Object.keys(recycleBinBefore.data.recycle_bin).length;

    // Test moving test request to Recycle Bin
    const moveToRbRes = await request('DELETE', `/api/records/blood_requests/${testReqId}`, null, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(moveToRbRes.status === 200 && moveToRbRes.data.success, 'Module 11 (Recycle Bin): Soft-deleted record moved to Recycle Bin');
    const recycleKey = moveToRbRes.data.recycleId;

    // Test restoring from Recycle Bin
    const restoreRes = await request('POST', `/api/recycle-bin/restore/${recycleKey}`, null, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(restoreRes.status === 200 && restoreRes.data.success, 'Module 11 (Recycle Bin): Successfully restored record from Recycle Bin back to live table');

    // Module 12: Sub-Admins Management
    const newSubRes = await request('POST', '/api/sub-admins', {
        name: 'Kavitha Admin',
        email: 'kavitha@test.com',
        password: 'kavi@secure123',
        permissions: ['blood', 'requests']
    }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(newSubRes.status === 201 && newSubRes.data.success, 'Module 12 (Sub-Admins): Super Admin created new sub-admin');
    const newSubId = newSubRes.data.id;

    // Edit Sub-Admin
    const editSubRes = await request('PUT', `/api/sub-admins/${newSubId}`, { status: 'Disabled' }, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(editSubRes.status === 200 && editSubRes.data.success, 'Module 12 (Sub-Admins): Super Admin disabled sub-admin account');

    // Delete Sub-Admin
    const delSubRes = await request('DELETE', `/api/sub-admins/${newSubId}`, null, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(delSubRes.status === 200 && delSubRes.data.success, 'Module 12 (Sub-Admins): Super Admin deleted temporary sub-admin');

    // Module 13: Global Search Records
    const searchRes = await request('GET', '/api/search?q=Apollo', null, {
        'Authorization': `Bearer ${superToken}`
    });
    assert(searchRes.status === 200 && searchRes.data.requests.length > 0, 'Module 13 (Search Records): Search query found matching records in database');

    // -------------------------------------------------------------
    // TEST GROUP 4: Real-Time Socket.IO Synchronization
    // -------------------------------------------------------------
    console.log('\n--- 4. REAL-TIME SOCKET.IO NOTIFICATION TEST ---');

    await new Promise((resolve) => {
        const clientSocket = ioClient('http://localhost:3000');
        let received = false;

        clientSocket.on('connect', async () => {
            // Trigger a write
            await request('POST', '/api/donors', {
                name: 'Socket Realtime Test Donor',
                bloodGroup: 'AB+',
                city: 'Hyderabad',
                phone: '9998887776'
            });
        });

        clientSocket.on('db_change', (payload) => {
            if (payload.node === 'donors') {
                received = true;
                assert(true, `Real-Time Socket.IO: Received 'db_change' event for node '${payload.node}', action '${payload.action}'`);
                clientSocket.disconnect();
                resolve();
            }
        });

        setTimeout(() => {
            if (!received) {
                assert(false, 'Real-Time Socket.IO: Timed out waiting for event');
                clientSocket.disconnect();
                resolve();
            }
        }, 3000);
    });

    // -------------------------------------------------------------
    // TEST GROUP 5: Dynamic Counts Verification
    // -------------------------------------------------------------
    console.log('\n--- 5. DYNAMIC STATS & BADGE COUNTS ---');
    const finalSync = await request('GET', '/api/sync/all');
    const d = finalSync.data;

    const countDonors = Object.keys(d.donors).length;
    const countRequests = Object.keys(d.blood_requests).length;
    const countHospitals = Object.keys(d.partner_hospitals).length;
    const countRecycle = Object.keys(d.recycle_bin).length;

    assert(typeof countDonors === 'number' && countDonors >= 21, `Dynamic Blood Donors count: ${countDonors}`);
    assert(typeof countRequests === 'number' && countRequests >= 1, `Dynamic Blood Requests count: ${countRequests}`);
    assert(typeof countHospitals === 'number' && countHospitals >= 1, `Dynamic Hospitals count: ${countHospitals}`);
    assert(typeof countRecycle === 'number' && countRecycle === 4, `Dynamic Recycle Bin count: ${countRecycle} (matches screenshot Recycle Bin (4))`);

    // Clean up temporary test records via API
    await request('DELETE', `/api/blood-requests/${testReqId}`, null, { 'Authorization': `Bearer ${superToken}` });

    console.log('\n===============================================================');
    console.log(`🏁 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===============================================================');

    if (failedTests === 0) {
        console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
