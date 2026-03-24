require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const connectDB = require('./config/db');
const resolutionRoutes = require('./routes/resolutionRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
      return;
    }

    cb(new Error('Only PDF files are allowed.'), false);
  },
});

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

const dbPath = path.join(__dirname, 'mepc.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('SQLite connection error:', err.message);
    return;
  }

  console.log('SQLite connected');
  initializeDatabase();
});

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Contacts table initialization error:', err.message);
      return;
    }

    createDefaultAdmin();
  });
}

function createDefaultAdmin() {
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@mepc.com';
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  bcrypt.hash(defaultPassword, 10, (hashError, hash) => {
    if (hashError) {
      console.error('Password hashing error:', hashError.message);
      return;
    }

    db.run(
      'INSERT OR IGNORE INTO users (email, password, role) VALUES (?, ?, ?)',
      [defaultEmail, hash, 'admin'],
      (insertError) => {
        if (insertError) {
          console.error('Default admin creation error:', insertError.message);
        }
      }
    );
  });
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    bcrypt.compare(password, user.password, (compareError, isMatch) => {
      if (compareError) {
        return res.status(500).json({ error: 'Error comparing passwords' });
      }

      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    });
  });
});

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  bcrypt.hash(password, 10, (hashError, hash) => {
    if (hashError) {
      return res.status(500).json({ error: 'Error hashing password' });
    }

    db.run(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email, hash, 'admin'],
      function onInsert(insertError) {
        if (insertError) {
          if (insertError.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Email already exists' });
          }

          return res.status(500).json({ error: 'Error creating user' });
        }

        return res.json({
          success: true,
          message: 'User registered successfully',
          userId: this.lastID,
        });
      }
    );
  });
});

app.get('/api/users', (req, res) => {
  db.all('SELECT id, email, role, created_at FROM users', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json(users);
  });
});

app.delete('/api/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function onDelete(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting user' });
    }

    return res.json({ success: true, message: 'User deleted successfully' });
  });
});

app.get('/api/contacts', (req, res) => {
  db.all('SELECT * FROM contacts ORDER BY created_at DESC', [], (err, contacts) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    return res.json(contacts);
  });
});

app.post('/api/contacts', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  db.run(
    'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)',
    [name, email, message],
    function onInsert(err) {
      if (err) {
        return res.status(500).json({ error: 'Error saving contact message' });
      }

      return res.json({
        success: true,
        message: 'Contact message saved successfully',
        contactId: this.lastID,
      });
    }
  );
});

app.delete('/api/contacts/:id', (req, res) => {
  db.run('DELETE FROM contacts WHERE id = ?', [req.params.id], function onDelete(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting contact message' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Contact message not found' });
    }

    return res.json({ success: true, message: 'Contact message deleted successfully' });
  });
});

app.post('/api/upload', upload.single('pdfFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or invalid file type' });
  }

  return res.json({
    success: true,
    message: 'File uploaded successfully',
    filePath: `/uploads/${req.file.filename}`,
    fileName: req.file.filename,
  });
});

app.use('/api', resolutionRoutes);
app.use('/', resolutionRoutes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed' });
  }

  return next();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
