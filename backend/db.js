const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

let dbInstance = null;
let isPgPool = false;
let initPromise = null;

async function getDB() {
    if (dbInstance) return dbInstance;

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && !databaseUrl.includes('placeholder')) {
        const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
        const isRenderInternal = databaseUrl.includes('dpg-') && !databaseUrl.includes('.render.com');
        const isSsl = process.env.DB_SSL === 'true' || (!isLocal && !isRenderInternal && process.env.DB_SSL !== 'false');
        const pool = new Pool({
            connectionString: databaseUrl,
            ssl: isSsl ? { rejectUnauthorized: false } : false
        });
        pool.on('error', (err) => {
            console.error('PostgreSQL idle client notice:', err.message);
        });
        isPgPool = true;
        dbInstance = {
            async query(sql, params = []) {
                return await pool.query(sql, params);
            },
            async exec(sql) {
                return await pool.query(sql);
            },
            async transaction(fn) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const res = await fn(client);
                    await client.query('COMMIT');
                    return res;
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            }
        };
        console.log('✅ Connected to external PostgreSQL via DATABASE_URL');
    } else {
        const dataDir = path.resolve(__dirname, '../data/postgres');
        fs.mkdirSync(dataDir, { recursive: true });

        const pidFile = path.join(dataDir, 'postmaster.pid');
        if (fs.existsSync(pidFile)) {
            try { fs.unlinkSync(pidFile); } catch (e) {}
        }

        const { PGlite } = require('@electric-sql/pglite');
        const pglite = new PGlite(dataDir);
        isPgPool = false;

        dbInstance = {
            async query(sql, params = []) {
                const res = await pglite.query(sql, params);
                return {
                    rows: res.rows || [],
                    rowCount: res.rows ? res.rows.length : (res.affectedRows || 0)
                };
            },
            async exec(sql) {
                return await pglite.exec(sql);
            },
            async transaction(fn) {
                return await pglite.transaction(async (tx) => {
                    return await fn({
                        query: (sql, params = []) => tx.query(sql, params),
                        exec: (sql) => tx.exec(sql)
                    });
                });
            }
        };
        console.log('✅ Initialized native PostgreSQL engine at', dataDir);
    }

    return dbInstance;
}

async function initDatabase(options = {}) {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        const db = await getDB();
        const schemaPath = path.resolve(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await db.exec(schemaSql);
            try {
                await db.exec(`
                    ALTER TABLE admins ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'admin123';
                    UPDATE admins SET password = 'admin123' WHERE password IS NULL;
                    UPDATE users SET password = 'admin123' WHERE email = 'admin@lifesaver.com' AND password IS NULL;
                `);
            } catch (e) {}

            // Auto-seed if database is empty and backup file is present (skip if called from migrate.js)
            if (!options.skipAutoSeed) {
                try {
                    const userCheck = await db.query('SELECT COUNT(*) as count FROM users');
                    if (parseInt(userCheck.rows[0].count) === 0) {
                        const backupPath = path.resolve(__dirname, '../firebase_backup.json');
                        if (fs.existsSync(backupPath)) {
                            console.log('🔄 Fresh database detected. Auto-seeding from firebase_backup.json...');
                            const { runMigration } = require('./migrate');
                            await runMigration({ skipInit: true });
                        }
                    }
                } catch (e) {
                    console.error('Auto-seed check notice:', e.message);
                }
            }
            console.log('✅ Database schema verified and initialized (raw text passwords)');
        }
        return db;
    })();
    return initPromise;
}

module.exports = {
    getDB,
    initDatabase
};
