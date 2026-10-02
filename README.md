# 🩸 LifeSaver-Care — Real-Time Healthcare & Voluntary Donor Network

> **Empowering communities through voluntary blood donation, organ pledges, and emergency hospital collaboration.**

[![Production Domain](https://img.shields.io/badge/Production-lifesaver.qd.je-red.svg)](https://lifesaver.qd.je)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20.0.0-green.svg)](package.json)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791.svg)](backend/schema.sql)

---

## 🌟 Overview

**LifeSaver-Care** is an integrated emergency healthcare and voluntary blood/organ donation coordination platform. It bridges the critical time gap between patients requiring emergency blood and nearby available voluntary donors, while enabling hospital communications, ambulance coordination, AI triage, and real-time administrative oversight.

---

## ✨ Key Features

- **🩸 Voluntary Blood Donor Registry**: Register as an available donor with instant certificate generation, contact privacy controls, and city/blood group matching.
- **🚨 Emergency Blood Requests**: Attendants and hospitals can broadcast urgent blood requirements with real-time dispatch alerts.
- **💙 Organ Donation Pledges**: Digital organ donor pledge registration with instant certificate preview and verification.
- **🤝 Hospital Collaboration Network**: Dedicated directory of collaborating hospital partners, emergency lines, and blood inventory.
- **🤖 AI Doctor Triage Assessment**: Smart symptom screening, emergency triage protocol (108 dispatch check), and lab report analyzer.
- **🛡️ Secure Super Admin & Sub-Admin Suite**:
  - 13 comprehensive operational modules.
  - Role-based access control with backend authorization enforcement.
  - Real-time updates powered by Socket.IO.
  - Dynamic badge counters and live data reconciliation.
  - Recycle bin for soft-deleted record restoration and audit logs.
- **📱 Progressive Web App (PWA)**: Installable on mobile and desktop devices with offline caching via Service Worker.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS, ES6 JavaScript Modules, TailwindCSS utility classes, Lucide Icons, Socket.IO Client.
- **Backend**: Node.js, Express, Socket.IO real-time hub.
- **Database**:
  - Dedicated PostgreSQL (Single Source of Truth).
  - Embedded native engine with auto-seeding from verified baseline records.
  - Connection pooling support for cloud PostgreSQL providers (Neon, Supabase, Render, AWS RDS).
- **Authentication**: JWT-based session security and role verification headers.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v20.0.0 or higher)
- npm

### 2. Installation
```bash
git clone https://github.com/jogu-muralikrishna/Life-Saver.git
cd Life-Saver
npm install
```

### 3. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Configure your environment variables in `.env` as needed:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secure-database-key
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3000
```

### 4. Running the Application
```bash
npm start
```
The server will start at `http://localhost:3000`.

### 5. Running Integration Tests
```bash
npm test
```
Executes the comprehensive 36-point automated integration test suite covering authentication, permissions, database queries, and Socket.IO real-time events.

### 6. Database Migration & Seeding
```bash
npm run migrate
```
Synchronizes the database schema and seeds all authentic member records.

---

## 🌐 Production Deployments

- **Primary Production Domain**: [https://lifesaver.qd.je](https://lifesaver.qd.je)
- **Render Deployment**: Supported via `render.yaml` blueprint with health checks at `/health`.
- **Vercel Serverless Deployment**: Supported with catch-all routing via `vercel.json`.

---

## 🔒 Security & Privacy

- **Data Privacy**: Contact preferences (Public / Private) are enforced at the API layer.
- **Zero Real Secrets**: Production environment variables and database credentials are fully isolated from version control.
- **SQL Injection Prevention**: 100% parameterized SQL queries (`$1`, `$2`, ...) across all database interactions.
- **Role Enforcement**: Destructive operations strictly require Super Admin JWT verification.

---

## 📄 License

This project is licensed under the ISC License.
