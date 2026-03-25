# CyberChat — Complete Setup Guide (Ubuntu 24.04)

> **Total time: ~15-20 minutes** | **Difficulty: Beginner**
> Every command is explained. If something fails, the error message usually tells you exactly what's wrong.

---

## What We're Installing

| Software | What it is | Why we need it |
|----------|-----------|----------------|
| **Node.js** | JavaScript runtime | Runs our server code |
| **npm** | Package manager | Downloads code libraries |
| **PostgreSQL** | Database | Stores all messages and users |
| **Git** | Version control | (Optional) Download project |

---

## Part 1: Install Node.js

Node.js lets us run JavaScript outside a browser (on the server).

### Step 1.1 — Update your package list

Always update before installing anything. This fetches the latest list of available software.

```bash
sudo apt update
```

> **What is `sudo`?** It means "superuser do" — run this command with admin privileges. You'll be asked for your password.

### Step 1.2 — Install Node.js using NodeSource (recommended)

Ubuntu's default Node.js is outdated. We use NodeSource to get a recent version.

```bash
# Download and run the NodeSource setup script for Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

> **What is `curl`?** A command-line tool to download files from the internet. `-fsSL` means: fail silently, follow redirects, show errors.

```bash
# Now install Node.js
sudo apt install -y nodejs
```

> **What is `-y`?** Automatically answers "yes" to the "do you want to continue?" prompt.

### Step 1.3 — Verify installation

```bash
node --version
# Should output: v20.x.x  (or similar)

npm --version
# Should output: 10.x.x  (npm comes bundled with Node.js)
```

If you see version numbers, Node.js is installed correctly! ✓

---

## Part 2: Install PostgreSQL

PostgreSQL is our database. It stores users, messages, and conversations.

### Step 2.1 — Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

> **What is `postgresql-contrib`?** Extra tools and extensions for PostgreSQL. Good to have.

### Step 2.2 — Start and enable PostgreSQL

```bash
# Start the PostgreSQL service right now
sudo systemctl start postgresql

# Enable it to start automatically when Ubuntu boots
sudo systemctl enable postgresql
```

> **What is `systemctl`?** A command to manage system services (programs that run in the background).

### Step 2.3 — Verify PostgreSQL is running

```bash
sudo systemctl status postgresql
```

You should see `● postgresql.service` with `active (running)` highlighted in green. Press `q` to exit.

### Step 2.4 — Create a database user and database

PostgreSQL has its own user system. We need to create a user for our app.

```bash
# Switch to the 'postgres' system user (PostgreSQL's admin)
sudo -i -u postgres
```

> Your terminal prompt will change to `postgres@yourcomputer:~$`

```bash
# Open the PostgreSQL command-line client
psql
```

> Your prompt changes to `postgres=#`

Now run these SQL commands **one at a time**. Copy each line and press Enter:

```sql
-- Create a database user named 'cyberchat' with a password
CREATE USER cyberchat WITH PASSWORD 'your_secure_password_here';
```

> **Important:** Change `your_secure_password_here` to something secure! You'll use this in the `.env` file.

```sql
-- Create the database
CREATE DATABASE cyberchat_db;
```

```sql
-- Give our user full access to the database
GRANT ALL PRIVILEGES ON DATABASE cyberchat_db TO cyberchat;
```

```sql
-- Connect to the new database
\c cyberchat_db
```

```sql
-- Grant schema permissions (required in newer PostgreSQL versions)
GRANT ALL ON SCHEMA public TO cyberchat;
```

```sql
-- Exit psql
\q
```

```bash
# Exit the postgres user session, return to your normal user
exit
```

> Your prompt should return to normal (e.g., `yourname@yourcomputer:~$`)

---

## Part 3: Get the CyberChat Project

### Option A: If you have the files already

Skip to Part 4.

### Option B: If you're copying the project folder

```bash
# Create a directory for the project
mkdir -p ~/projects

# Move your project folder there (adjust the path as needed)
cp -r /path/to/cyberChat ~/projects/cyberChat

cd ~/projects/cyberChat
```

---

## Part 4: Configure the Project

### Step 4.1 — Install npm packages

The `package.json` file lists all the code libraries our project needs. This command downloads them all.

```bash
# Make sure you're in the project directory
cd ~/projects/cyberChat   # (adjust path if needed)

# Download all dependencies listed in package.json
npm install
```

> This creates a `node_modules/` folder with all the libraries. This might take 1-2 minutes.

### Step 4.2 — Create your `.env` file

The `.env` file stores secret configuration values (passwords, secret keys). It's never committed to Git.

```bash
# Copy the example file
cp .env.example .env

# Open it in a text editor
nano .env
```

You'll see something like:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cyberchat_db
DB_USER=cyberchat
DB_PASSWORD=your_secure_password_here
JWT_SECRET=change_this_to_a_random_string
PORT=6767
```

Edit it:
- Set `DB_PASSWORD` to the password you chose in Step 2.4
- Set `JWT_SECRET` to a long random string (this is used to sign JWT tokens — make it unguessable)

**Generate a random JWT secret:**

```bash
# This generates a random 64-character string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as your `JWT_SECRET`.

**Save and exit nano:**
- Press `Ctrl+X`
- Press `Y` to confirm saving
- Press `Enter` to keep the filename

### Step 4.3 — Verify your .env file

```bash
cat .env
```

Make sure all values are filled in correctly.

---

## Part 5: Set Up the Database Tables

Now we need to create the tables (users, messages, conversations, etc.) in our database.

```bash
# Run the database setup script
node backend/config/setupDatabase.js
```

> If successful, you'll see messages like "Table 'users' created" or "Tables already exist".

**If you get a connection error:**
- Double-check your `.env` file — is the password correct?
- Is PostgreSQL running? `sudo systemctl status postgresql`
- Try connecting manually: `psql -U cyberchat -d cyberchat_db -h localhost`

---

## Part 6: Start the Server

```bash
# Start the CyberChat server
node backend/server.js
```

You should see output like:

```
[Server] Connected to PostgreSQL
[Server] Socket.IO ready
[Server] CyberChat running on http://localhost:6767
```

The server is now running! 🎉

### Open in Browser

Open Firefox or Chromium:

```
http://localhost:6767
```

You should see the CyberChat login screen with the cyberpunk theme!

---

## Part 7: Create a Test Account

1. Click "REGISTER" tab
2. Fill in:
   - **Username**: `alice` (letters, numbers, underscores only)
   - **Display Name**: `Alice Smith`
   - **Email**: `alice@test.com`
   - **Password**: at least 8 characters
3. Click "CREATE IDENTITY"

You should be logged in! Open a second browser tab (or use a different browser) and create another account (`bob`) to test chatting.

---

## Running the Server in the Background

Currently if you close the terminal, the server stops. To keep it running:

### Option A: Simple (for testing)

```bash
# Run in background, save output to a log file
nohup node backend/server.js > cyberchat.log 2>&1 &

# See the process ID
echo $!

# View the logs
tail -f cyberchat.log

# Stop it later
kill <process_id>
```

### Option B: Using PM2 (recommended for production)

PM2 is a process manager that auto-restarts your app if it crashes.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start CyberChat with PM2
pm2 start backend/server.js --name cyberchat

# Make it start on boot
pm2 startup
pm2 save

# Useful PM2 commands:
pm2 status          # Check if app is running
pm2 logs cyberchat  # View logs
pm2 restart cyberchat
pm2 stop cyberchat
```

---

## Troubleshooting Common Errors

### "Error: listen EADDRINUSE: address already in use :::6767"

Port 6767 is already in use.

```bash
# Find what's using the port
sudo lsof -i :6767

# Kill it (replace 12345 with the actual PID from above)
kill -9 12345
```

### "Error: connect ECONNREFUSED 127.0.0.1:5432"

PostgreSQL isn't running.

```bash
sudo systemctl start postgresql
```

### "Error: password authentication failed for user 'cyberchat'"

Wrong password in `.env`.

```bash
# Reset the PostgreSQL password
sudo -i -u postgres
psql
ALTER USER cyberchat WITH PASSWORD 'new_password';
\q
exit
# Update .env with the new password
```

### "Cannot find module 'express'"

`npm install` wasn't run, or `node_modules` is missing.

```bash
npm install
```

### "SyntaxError" or JavaScript errors on startup

Check that Node.js version is 18 or higher:
```bash
node --version
```

---

## Summary of All Commands

```bash
# Install Node.js
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Set up database
sudo -i -u postgres
psql
# (run SQL commands for user/database creation)

# Set up project
cd ~/projects/cyberChat
npm install
cp .env.example .env
nano .env  # Fill in passwords

# Initialize database tables
node backend/config/setupDatabase.js

# Start the server
node backend/server.js

# Open in browser
# http://localhost:6767
```

---

*You're now running your own chat server! Everything runs on your Ubuntu machine — no cloud, no external services needed.*
