# 🌬️ Where Wind Meet — Speedrun Bot
## คู่มือติดตั้ง (สำหรับมือใหม่ ไม่ต้องมีความรู้ server)

---

## ขั้นตอนที่ 1 — สร้าง Discord Bot

1. เปิด https://discord.com/developers/applications
2. กด **"New Application"** → ตั้งชื่อ เช่น `WWM Speedrun Bot` → กด Create
3. เมนูซ้าย กด **"Bot"**
4. กด **"Reset Token"** → คัดลอก Token ไว้ (จะใช้ทีหลัง)
5. เลื่อนลงมา เปิด **✅ MESSAGE CONTENT INTENT**
6. เมนูซ้าย กด **"OAuth2" → "URL Generator"**
7. ติ๊ก: `bot` และ `applications.commands`
8. ใต้ Bot Permissions ติ๊ก: `Send Messages`, `Read Messages/View Channels`, `Embed Links`, `Attach Files`
9. คัดลอก URL ที่ได้ → เปิดใน browser → เพิ่ม Bot เข้า Server ตัวเอง

---

## ขั้นตอนที่ 2 — อัปโหลด Code ขึ้น GitHub

1. ไปที่ https://github.com → สมัครหรือล็อกอิน
2. กด **"New repository"** → ตั้งชื่อ `wwm-bot` → กด Create
3. กด **"uploading an existing file"**
4. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้: `bot.js`, `package.json`, `railway.toml`, `.gitignore`
5. กด **"Commit changes"**

---

## ขั้นตอนที่ 3 — Deploy บน Railway (ฟรี)

1. ไปที่ https://railway.app → กด **"Login with GitHub"**
2. กด **"New Project"** → **"Deploy from GitHub repo"**
3. เลือก repo `wwm-bot` ที่เพิ่งสร้าง
4. Railway จะเริ่ม build อัตโนมัติ (รอ 1-2 นาที)
5. กดที่ project → ไปที่แท็บ **"Variables"**
6. กด **"Add Variable"**:
   - Key: `DISCORD_TOKEN`
   - Value: วาง Token ที่คัดลอกจากขั้นตอนที่ 1
7. Railway จะ restart bot อัตโนมัติ → Bot พร้อมใช้งาน! ✅

---

## คำสั่งใน Discord

| คำสั่ง | ความหมาย |
|--------|----------|
| `!help` | ดูคำสั่งทั้งหมด |
| `!create 5 30:00 2025-06-01` | สร้าง Ticket Party 5 คน เป้าหมาย 30:00 วันที่ 1 มิ.ย. |
| `!create 10 45:30 2025-06-02 ต้องการ healer` | สร้าง Party 10 คน พร้อม note |
| `!tickets` | ดู Ticket ที่เปิดอยู่ทั้งหมด |
| `!tickets 5` | ดูเฉพาะ Party 5 คน |
| `!leaderboard` | ดู Leaderboard |
| `!leaderboard 10` | Leaderboard เฉพาะ 10 คน |
| `!tokens` | ดู Token คงเหลือทุกคน |

### ปุ่มใต้ Ticket
- **+ เข้าร่วม** → เลือกอาชีพ แล้วเข้า party (ใช้ 1 Token)
- **🏁 บันทึกผล** → ใส่เวลาจริง + URL รูป Screenshot
- **✕ ปิด** → ปิด Ticket (เฉพาะผู้สร้าง)

---

## หมายเหตุ

- Token รีใหม่ทุกต้นสัปดาห์ (จันทร์)
- ข้อมูลเก็บในไฟล์ `data.json` บน Railway
- Railway ฟรีใช้งานได้ (มีชั่วโมงจำกัด แนะนำให้ verify credit card เพื่อได้ tier ฟรีเพิ่ม)
