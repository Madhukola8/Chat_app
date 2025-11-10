const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ===== Models =====
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// ===== JWT Secret =====
const JWT_SECRET = process.env.JWT_SECRET;

// ===== Auth Middleware =====
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ===== REST API =====

// Register
app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users + last message
app.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('-password')
      .lean();

    const usersWithLast = await Promise.all(
      users.map(async u => {
        const conversationId = [req.user.id, u._id].sort().join('-');
        const lastMessage = await Message.findOne({ conversationId })
          .sort({ timestamp: -1 })
          .lean();
        return {
          ...u,
          lastMessage: lastMessage
            ? {
                text: lastMessage.message,
                time: lastMessage.timestamp,
                senderId: lastMessage.senderId,
                read: lastMessage.read
              }
            : null
        };
      })
    );

    usersWithLast.sort((a, b) => {
      const tA = a.lastMessage ? new Date(a.lastMessage.time).getTime() : 0;
      const tB = b.lastMessage ? new Date(b.lastMessage.time).getTime() : 0;
      return tB - tA;
    });

    res.json(usersWithLast);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation messages
app.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversationId = [req.user.id, req.params.id].sort().join('-');
    const messages = await Message.find({ conversationId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SOCKET.IO =====
const userSockets = new Map(); // userId -> socketId

io.on('connection', socket => {
  console.log('🔌 User connected:', socket.id);

  // Mark user online
  socket.on('user:online', async userId => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('user:status', { userId, isOnline: true });
  });

  // Typing indicators
  socket.on('typing:start', ({ from, to }) => {
    const receiverSocket = userSockets.get(to);
    if (receiverSocket)
      io.to(receiverSocket).emit('typing:start', { from });
  });

  socket.on('typing:stop', ({ from, to }) => {
    const receiverSocket = userSockets.get(to);
    if (receiverSocket)
      io.to(receiverSocket).emit('typing:stop', { from });
  });

  // Message send
  socket.on('message:send', async data => {
    try {
      const { senderId, receiverId, message } = data;
      const conversationId = [senderId, receiverId].sort().join('-');

      const newMsg = new Message({
        conversationId,
        senderId,
        receiverId,
        message
      });
      await newMsg.save();

      const receiverSocket = userSockets.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('message:new', newMsg);
        await Message.findByIdAndUpdate(newMsg._id, { delivered: true });
      }

      socket.emit('message:sent', newMsg);
    } catch (err) {
      console.error('❌ Message send error:', err);
    }
  });

  // Message read
  socket.on('message:read', async ({ messageId }) => {
    const msg = await Message.findByIdAndUpdate(messageId, { read: true }, { new: true });
    if (msg) {
      const senderSocket = userSockets.get(msg.senderId.toString());
      if (senderSocket) io.to(senderSocket).emit('message:read', { messageId });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date()
      });
      io.emit('user:status', { userId: socket.userId, isOnline: false });
    }
    console.log('❌ Disconnected:', socket.id);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
