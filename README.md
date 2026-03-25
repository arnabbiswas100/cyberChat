# ⚡ CyberChat

A cyberpunk-themed real-time chat application with authentication, messaging, and live communication using WebSockets.

---

## 🚀 Features

* 🔐 Full authentication system (JWT-based)
* 💬 Real-time messaging (Socket.IO)
* 👥 Multi-user support
* 🧠 PostgreSQL database
* 🎨 Cyberpunk UI with neon styling
* 📎 File upload support
* ⚡ Fast and responsive

---

## 🛠 Tech Stack

* **Backend:** Node.js, Express, Socket.IO
* **Database:** PostgreSQL
* **Auth:** JWT (jsonwebtoken), bcrypt
* **Frontend:** HTML, CSS, JavaScript
* **Other:** multer, sharp, helmet, cors

---

## 📦 Installation

```bash
git clone https://github.com/arnabbiswas100/cyberChat.git
cd cyberChat
npm install
```

---

## ⚙️ Setup

Create a `.env` file in the root directory:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cyberchat_db
DB_USER=cyberchat
DB_PASSWORD=your_password
JWT_SECRET=your_secret
PORT=6767
```

---

## 🧪 Run the Project

```bash
node backend/config/setupDatabase.js
node backend/server.js
```

Open in browser:

```
http://localhost:6767
```

---

## 📂 Project Structure

```
cyberChat/
├── backend/
├── frontend/
├── uploads/
├── docs/
├── package.json
└── README.md
```

---

## 🧠 Notes

* `.env` is not included for security reasons
* Make sure PostgreSQL is running
* Default port: 6767
* Uses Socket.IO for real-time communication

---

## 👑 Author

**Alnos Xen**

---

## ⭐ Future Improvements

* Group chats
* Message reactions
* Typing indicators
* Push notifications
* Deployment support (Docker / Cloud)
