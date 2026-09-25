import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import http from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'smb-dev-secret';

const users = [
  { id: 'u-1', name: 'Admin Smith', email: 'admin@smb.local', password: bcrypt.hashSync('changeMe123!', 10), role: 'admin' },
  { id: 'u-2', name: 'Maya Brooks', email: 'maya@smb.local', password: bcrypt.hashSync('changeMe123!', 10), role: 'staff' },
];

const cases = [
  { id: 'c-1', patientId: 'P-1001', caseType: 'urgent', workflowStatus: 'new', authorizationStatus: 'pending_pre_auth', priority: 'urgent', assignee: 'Wendy', createdAt: '2026-09-01' },
  { id: 'c-2', patientId: 'P-1002', caseType: 'initial_consult', workflowStatus: 'completed', authorizationStatus: 'approved', priority: 'high', assignee: 'Maya', createdAt: '2026-09-02' },
];

app.use(cors());
app.use(express.json());

function authRequired(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  try {
    const token = header.replace('Bearer ', '');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const user = users.find((entry) => entry.email === email);
  if (!user || !(await bcrypt.compare(password ?? '', user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const found = users.find((user) => user.email === req.user.email);
  if (!found) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: found.id, name: found.name, email: found.email, role: found.role } });
});

app.post('/api/auth/logout', authRequired, (_req, res) => res.json({ ok: true }));

app.get('/api/cases', authRequired, (_req, res) => {
  res.json({ cases });
});

io.on('connection', (socket) => {
  socket.on('ping', () => socket.emit('pong', { ok: true }));
});

server.listen(3001, () => {
  console.log('HTTP API running on http://localhost:3001');
});
