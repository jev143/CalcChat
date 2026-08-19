import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { createServer as createViteServer } from 'vite';
import config from './firebase-applet-config.json';

// Initialize Firebase App instance for server-side auth & verification
const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

const fbApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
  ? getFirestore(fbApp, config.firestoreDatabaseId)
  : getFirestore(fbApp);

// Persistent secret for signing server sessions. It must be loaded from the project-root .env.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET is missing or too short. Add a 32+ character SESSION_SECRET to the project-root .env file.');
}

// Cryptographic Character Pools (Excluding ambiguous chars: O, 0, I, 1, L)
const UNAMBIGUOUS_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const UNAMBIGUOUS_ALPHANUMERIC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALLOWED_SECRET_CHARS_REGEX = /^[0-9+\-%*]+$/;

function validatePasswordOrSecret(val: string, fieldName = 'Password'): string | null {
  if (!val) return `${fieldName} is required.`;
  if (val.length < 4 || val.length > 10) {
    return `${fieldName} must be between 4 and 10 characters.`;
  }
  if (!ALLOWED_SECRET_CHARS_REGEX.test(val)) {
    return `${fieldName} must contain only numbers (0-9) and math symbols (+, -, %, *).`;
  }
  return null;
}


function hashAccountPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password.trim(), Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function verifyAccountPassword(password: string, saltHex: string, storedHash: string, algorithm?: string): boolean {
  if (algorithm === 'scrypt-v1') return crypto.timingSafeEqual(Buffer.from(hashAccountPassword(password, saltHex), 'hex'), Buffer.from(storedHash, 'hex'));
  return crypto.timingSafeEqual(Buffer.from(hashPasswordWithSalt(password, saltHex), 'hex'), Buffer.from(storedHash, 'hex'));
}

function generateAccountCode(): string {
  const l1 = UNAMBIGUOUS_LETTERS.charAt(crypto.randomInt(UNAMBIGUOUS_LETTERS.length));
  const l2 = UNAMBIGUOUS_LETTERS.charAt(crypto.randomInt(UNAMBIGUOUS_LETTERS.length));
  let digits = '';
  for (let i = 0; i < 6; i++) {
    digits += UNAMBIGUOUS_ALPHANUMERIC.charAt(crypto.randomInt(UNAMBIGUOUS_ALPHANUMERIC.length));
  }
  return `${l1}${l2}${digits}`;
}

function generateRecoveryKey(): string {
  const segment = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += UNAMBIGUOUS_ALPHANUMERIC.charAt(crypto.randomInt(UNAMBIGUOUS_ALPHANUMERIC.length));
    }
    return s;
  };
  return `REC-${segment(4)}-${segment(4)}-${segment(4)}`;
}

function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(`calcchat_vault_v2_${salt.trim()}_${password.trim()}`)
    .digest('hex');
}

function signSessionToken(payload: { uid: string; accountCode: string }): string {
  const data = JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const b64Data = Buffer.from(data).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(b64Data)
    .digest('base64url');
  return `${b64Data}.${signature}`;
}

function verifySessionToken(tokenString?: string): { uid: string; accountCode: string } | null {
  if (!tokenString) return null;
  const parts = tokenString.split('.');
  if (parts.length !== 2) return null;
  const [b64Data, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(b64Data)
    .digest('base64url');

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(b64Data, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Date.now()) return null;
    return { uid: data.uid, accountCode: data.accountCode };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Basic in-memory abuse protection for local/single-instance deployments.
  // For production, put a real reverse-proxy/WAF rate limiter in front of this server.
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (windowMs: number, max: number) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    bucket.count += 1;
    next();
  };

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  // Local persistent uploads storage directory
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
  const MEDIA_META_DIR = path.join(UPLOADS_DIR, '.metadata');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEDIA_META_DIR)) {
    fs.mkdirSync(MEDIA_META_DIR, { recursive: true });
  }

  // Media ownership metadata is kept server-side instead of in Firestore.
  // The app uses a custom HttpOnly session rather than Firebase Auth, so a
  // Firestore rules write would otherwise fail with PERMISSION_DENIED.
  const mediaMetaPath = (filename: string) =>
    path.join(MEDIA_META_DIR, `${path.basename(filename)}.json`);

  // Support up to 100MB payloads for images, videos, audio notes and documents
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // Helper middleware to extract user session
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Session is HttpOnly cookie only; never accept bearer/localStorage tokens.
    const token = req.cookies?.calcchat_token as string | undefined;
    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized session' });
    }
    (req as any).session = session;
    next();
  };

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ==========================================
  // POST /api/media/upload
  // Raw and binary media upload handler with up to 100MB support
  // ==========================================
  app.post('/api/media/upload', requireAuth, rateLimit(60_000, 20), express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
      const rawFileName = (req.headers['x-file-name'] as string) || `file_${Date.now()}`;
      let decodedFileName = rawFileName;
      try {
        decodedFileName = decodeURIComponent(rawFileName);
      } catch {
        decodedFileName = rawFileName;
      }
      const mimeType = (req.headers['content-type'] as string) || 'application/octet-stream';
      const lowerName = decodedFileName.toLowerCase();
      const allowedMime = /^(image\/|video\/|audio\/|application\/pdf$|application\/zip$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-|application\/rtf$|text\/(plain|csv)$)/i.test(mimeType) || /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods|odp)$/i.test(lowerName);
      if (!allowedMime) return res.status(415).json({ error: 'Unsupported media type.' });
      let conversationId = (req.headers['x-conversation-id'] as string) || 'general';
      try {
        conversationId = decodeURIComponent(conversationId);
      } catch {
        // Keep the original header value if it was not URI-encoded.
      }

      const safeBaseName = decodedFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBaseName}`;
      const targetFilePath = path.join(UPLOADS_DIR, uniqueFileName);

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'No media data received.' });
      }

      // Resolve the real account participants from the conversation document.
      // Never depend on client-supplied participant headers: older conversations
      // can have stale/missing participantsMeta and that was causing every media
      // upload to fail with 'Missing media participants'.
      const session = (req as any).session as { uid: string };
      const conversationSnap = await getDoc(doc(db, 'conversations', conversationId));
      if (!conversationSnap.exists()) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }
      const conversationData: any = conversationSnap.data();
      let participantUids = Array.from(new Set((conversationData.participantUids || []).map((v: unknown) => String(v)).filter(Boolean)));

      // Legacy conversations may have participantIdentityIds but no participantUids.
      // Resolve those identity records server-side instead of trusting client headers.
      if (participantUids.length < 2 && Array.isArray(conversationData.participantIdentityIds)) {
        const identityIds = conversationData.participantIdentityIds.map((v: unknown) => String(v)).filter(Boolean);
        const identityDocs = await Promise.all(identityIds.map((identityId: string) => getDoc(doc(db, 'identities', identityId))));
        participantUids = Array.from(new Set(identityDocs
          .filter((snap) => snap.exists())
          .map((snap) => String((snap.data() as any).uid || (snap.data() as any).ownerUserId || ''))
          .filter(Boolean)));
      }

      if (!participantUids.includes(session.uid)) {
        return res.status(403).json({ error: 'You are not a participant in this conversation.' });
      }
      if (participantUids.length < 2) {
        return res.status(400).json({ error: 'Conversation participants are incomplete.' });
      }

      await fs.promises.writeFile(targetFilePath, buffer);

      // Keep a server-side ownership record so file downloads can be authorized too.
      // This avoids a Firestore write that cannot be authorized by the custom session.
      const mediaMetadata = {
        fileName: decodedFileName,
        mimeType,
        fileSize: buffer.length,
        conversationId,
        participantUids,
        ownerUid: session.uid,
        createdAt: Date.now(),
      };
      try {
        await fs.promises.writeFile(
          mediaMetaPath(uniqueFileName),
          JSON.stringify(mediaMetadata),
          { encoding: 'utf8', flag: 'wx' }
        );
      } catch (metaErr) {
        await fs.promises.rm(targetFilePath, { force: true });
        throw metaErr;
      }

      const downloadUrl = `/api/media/file/${encodeURIComponent(uniqueFileName)}?name=${encodeURIComponent(decodedFileName)}`;

      return res.json({
        success: true,
        downloadUrl,
        fileName: decodedFileName,
        fileSize: buffer.length,
        mimeType,
        storagePath: `uploads/${uniqueFileName}`,
      });
    } catch (err: any) {
      console.error('Server media upload error:', err);
      return res.status(500).json({ error: 'Failed to upload media file: ' + (err?.message || 'Server error') });
    }
  });

  // ==========================================
  // GET /api/media/file/:filename
  // Serves uploaded media with streaming and proper headers
  // ==========================================
  app.get('/api/media/file/:filename', requireAuth, async (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(UPLOADS_DIR, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
      }

      let mediaData: any;
      try {
        const rawMeta = await fs.promises.readFile(mediaMetaPath(filename), 'utf8');
        mediaData = JSON.parse(rawMeta);
      } catch {
        return res.status(404).send('Media metadata not found');
      }
      const session = (req as any).session as { uid: string };
      const participantUids = Array.isArray(mediaData.participantUids)
        ? mediaData.participantUids.map((value: unknown) => String(value))
        : [];
      if (!participantUids.includes(session.uid)) {
        return res.status(403).send('Forbidden');
      }

      const customName = String((req.query.name as string) || mediaData.fileName || filename)
        .replace(/[\\r\\n"]/g, '_')
        .slice(0, 180);
      const download = req.query.download === 'true';

      res.setHeader(
        'Content-Disposition',
        `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(customName)}"`
      );
      if (mediaData.mimeType) res.setHeader('Content-Type', String(mediaData.mimeType));
      res.setHeader('Accept-Ranges', 'bytes');
      // Media is private but can be cached by the current authenticated browser.
      // The URL remains protected by the HttpOnly session cookie.
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.sendFile(filePath, {
        acceptRanges: true,
        lastModified: true,
      });
    } catch (err) {
      console.error('Error streaming file:', err);
      res.status(500).send('Error reading file');
    }
  });

  // ==========================================
  // POST /api/auth/register
  // Generates automatic unique Account Code, hashes password, saves to Firestore
  // ==========================================
  app.post('/api/auth/register', rateLimit(60_000, 5), async (req, res) => {
    try {
      const { displayName, password, avatar } = req.body;
      const trimmedDisplayName = (displayName || '').trim();

      if (!trimmedDisplayName) {
        return res.status(400).json({ error: 'Display Name is required.' });
      }

      const passErr = validatePasswordOrSecret(password, 'Password');
      if (passErr) {
        return res.status(400).json({ error: passErr });
      }

      // Generate a unique unambiguous Account Code with collision safety
      let assignedCode = '';
      for (let i = 0; i < 20; i++) {
        const candidate = generateAccountCode();
        const codeRef = doc(db, 'accountCodes', candidate.toLowerCase());
        const snap = await getDoc(codeRef);
        if (!snap.exists()) {
          assignedCode = candidate;
          break;
        }
      }

      if (!assignedCode) {
        return res.status(500).json({ error: 'Could not generate unique Account Code. Please retry.' });
      }

      const uid = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashAccountPassword(password, salt);

      // Generate Master Recovery Key
      const recoveryKey = generateRecoveryKey();
      const recoverySalt = crypto.randomBytes(16).toString('hex');
      const recoveryKeyHash = hashPasswordWithSalt(recoveryKey, recoverySalt);

      const now = Date.now();
      const normalizedCode = assignedCode.toLowerCase();
      const codeRef = doc(db, 'accountCodes', normalizedCode);
      const userDocRef = doc(db, 'users', uid);

      const userDoc = {
        uid,
        accountCode: assignedCode,
        displayName: trimmedDisplayName,
        avatar: avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow',
        hasConfiguredPins: false,
        recoveryKeyHash,
        recoverySalt,
        createdAt: now,
      };

      // Atomic reservation in Firestore
      await runTransaction(db, async (transaction) => {
        const checkSnap = await transaction.get(codeRef);
        if (checkSnap.exists()) {
          throw new Error('Account Code collision during registration');
        }
        transaction.set(codeRef, {
          accountCode: assignedCode,
          uid,
          salt,
          passwordHash,
          hashAlgorithm: 'scrypt-v1',
          recoveryKeyHash,
          recoverySalt,
          displayName: trimmedDisplayName,
          avatar: userDoc.avatar,
          createdAt: now,
        });
        transaction.set(userDocRef, userDoc);
      });

      const token = signSessionToken({ uid, accountCode: assignedCode });
      res.cookie('calcchat_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        accountCode: assignedCode,
        recoveryKey,
        user: userDoc,
      });
    } catch (err: any) {
      console.error('Server registration error:', err);
      return res.status(500).json({ error: err?.message || 'Registration failed.' });
    }
  });

  // ==========================================
  // POST /api/auth/recover
  // Recovers account using Account Code + Master Recovery Key
  // Validates recoveryKey against salted hash and allows setting new Password
  // ==========================================
  app.post('/api/auth/recover', rateLimit(60_000, 5), async (req, res) => {
    try {
      const { accountCode, recoveryKey, newPassword } = req.body;
      const code = (accountCode || '').trim();
      const recKey = (recoveryKey || '').trim().toUpperCase();
      const newPass = (newPassword || '').trim();

      if (!code || !recKey) {
        return res.status(400).json({ error: 'Invalid Account Code or Recovery Key.' });
      }

      const passErr = validatePasswordOrSecret(newPass, 'New Password');
      if (passErr) {
        return res.status(400).json({ error: passErr });
      }

      const codeRef = doc(db, 'accountCodes', code.toLowerCase());
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        return res.status(400).json({ error: 'Invalid Account Code or Recovery Key.' });
      }

      const codeData = codeSnap.data();
      const storedUid = codeData.uid;
      const storedRecoveryHash = codeData.recoveryKeyHash;
      const storedRecoverySalt = codeData.recoverySalt || storedUid;

      if (!storedRecoveryHash) {
        return res.status(400).json({ error: 'No recovery key registered for this account.' });
      }

      const computedRecHash = hashPasswordWithSalt(recKey, storedRecoverySalt);
      if (computedRecHash !== storedRecoveryHash) {
        return res.status(400).json({ error: 'Invalid Account Code or Recovery Key.' });
      }

      // Valid recovery key! Update password hash with new salt
      const newSalt = crypto.randomBytes(16).toString('hex');
      const newPasswordHash = hashAccountPassword(newPass, newSalt);
      const now = Date.now();

      await runTransaction(db, async (transaction) => {
        transaction.update(codeRef, {
          passwordHash: newPasswordHash,
          hashAlgorithm: 'scrypt-v1',
          salt: newSalt,
          updatedAt: now,
        });
        transaction.update(doc(db, 'users', storedUid), {
          updatedAt: now,
        });
      });

      const token = signSessionToken({ uid: storedUid, accountCode: codeData.accountCode || code });
      res.cookie('calcchat_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: 'Account password recovered and updated successfully.',
      });
    } catch (err: any) {
      console.error('Server recovery error:', err);
      return res.status(500).json({ error: 'Recovery failed. Please check your credentials.' });
    }
  });

  // ==========================================
  // POST /api/auth/change-pin
  // Securely updates First or Second Identity Secret or Account Password
  // ==========================================
  app.post('/api/auth/change-pin', requireAuth, async (req, res) => {
    try {
      const session = (req as any).session;
      const uid = session.uid;
      const { identityType, currentSecret, newSecret } = req.body;

      if (!identityType || !currentSecret || !newSecret) {
        return res.status(400).json({ error: 'Missing required parameters.' });
      }

      const secretErr = validatePasswordOrSecret(newSecret, 'New Secret');
      if (secretErr) return res.status(400).json({ error: secretErr });

      const targetId = `${uid}_${identityType}`;
      const identRef = doc(db, 'identities', targetId);
      const identSnap = await getDoc(identRef);

      if (!identSnap.exists()) {
        return res.status(404).json({ error: 'Identity record not found.' });
      }

      const identData = identSnap.data();
      const currentPinHash = identData.pinHash;
      const computedCurrentHash = hashPasswordWithSalt(currentSecret, uid);

      if (computedCurrentHash !== currentPinHash) {
        return res.status(400).json({ error: 'Current secret is incorrect.' });
      }

      // Check other identity secret to prevent collision
      const otherType = identityType === 'first' ? 'second' : 'first';
      const otherSnap = await getDoc(doc(db, 'identities', `${uid}_${otherType}`));
      if (otherSnap.exists()) {
        const otherHash = otherSnap.data().pinHash;
        const computedNewOnOther = hashPasswordWithSalt(newSecret, uid);
        if (computedNewOnOther === otherHash) {
          return res.status(400).json({ error: 'New secret cannot be identical to your other identity secret.' });
        }
      }

      const newPinHash = hashPasswordWithSalt(newSecret, uid);
      const now = Date.now();

      await updateDoc(identRef, {
        pinHash: newPinHash,
        updatedAt: now,
      });

      return res.json({
        success: true,
        message: 'PIN successfully changed.',
      });
    } catch (err: any) {
      console.error('Server change-pin error:', err);
      return res.status(500).json({ error: 'Failed to update PIN.' });
    }
  });

  // ==========================================
  // POST /api/auth/login
  // Validates Account Code + Password
  // ==========================================
  app.post('/api/auth/login', rateLimit(60_000, 12), async (req, res) => {
    try {
      const { accountCode, password } = req.body;
      const code = (accountCode || '').trim();
      const pass = (password || '').trim();

      if (!code || !pass) {
        return res.status(401).json({ error: 'Invalid Account Code or Password.' });
      }

      // Check account code registry
      const codeRef = doc(db, 'accountCodes', code.toLowerCase());
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        return res.status(401).json({ error: 'Invalid Account Code or Password.' });
      }

      const codeData = codeSnap.data();
      const storedUid = codeData.uid;
      const storedSalt = codeData.salt || storedUid;
      const storedPasswordHash = codeData.passwordHash;

      // Verify hash
      if (storedPasswordHash) {
        let valid = false;
        try { valid = verifyAccountPassword(pass, storedSalt, storedPasswordHash, codeData.hashAlgorithm); } catch { valid = false; }
        if (!valid) return res.status(401).json({ error: 'Invalid Account Code or Password.' });
      }

      // Fetch user doc
      const userRef = doc(db, 'users', storedUid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return res.status(401).json({ error: 'Invalid Account Code or Password.' });
      }

      const userDoc = userSnap.data();
      const token = signSessionToken({ uid: storedUid, accountCode: codeData.accountCode || code });

      res.cookie('calcchat_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        user: userDoc,
      });
    } catch (err: any) {
      console.error('Server login error:', err);
      return res.status(401).json({ error: 'Invalid Account Code or Password.' });
    }
  });

  // ==========================================
  // GET /api/auth/me
  // Validates current session and returns account + identities
  // ==========================================
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const session = (req as any).session;
      const uid = session.uid;

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userSnap.data();

      // Fetch identities
      const firstRef = doc(db, 'identities', `${uid}_first`);
      const secondRef = doc(db, 'identities', `${uid}_second`);
      const [firstSnap, secondSnap] = await Promise.all([getDoc(firstRef), getDoc(secondRef)]);

      return res.json({
        authenticated: true,
        user: userData,
        firstIdentity: firstSnap.exists() ? firstSnap.data() : null,
        secondIdentity: secondSnap.exists() ? secondSnap.data() : null,
      });
    } catch (err: any) {
      console.error('Session check error:', err);
      return res.status(500).json({ error: 'Failed to verify session' });
    }
  });

  // ==========================================
  // POST /api/auth/setup-identities
  // Sets up First and Second identities
  // ==========================================
  app.post('/api/auth/setup-identities', requireAuth, async (req, res) => {
    try {
      const session = (req as any).session;
      const uid = session.uid;
      const {
        firstDisplayName,
        firstSecret,
        secondDisplayName,
        secondSecret,
      } = req.body;

      const firstErr = validatePasswordOrSecret(firstSecret, 'First Identity Secret');
      if (firstErr) return res.status(400).json({ error: firstErr });

      const secondErr = validatePasswordOrSecret(secondSecret, 'Second Identity Secret');
      if (secondErr) return res.status(400).json({ error: secondErr });

      if (firstSecret === secondSecret) {
        return res.status(400).json({ error: 'First and Second secrets cannot be identical.' });
      }

      const now = Date.now();
      const firstPinHash = hashPasswordWithSalt(firstSecret, uid);
      const secondPinHash = hashPasswordWithSalt(secondSecret, uid);

      const firstDoc = {
        identityId: `${uid}_first`,
        id: `${uid}_first`,
        ownerUserId: uid,
        uid,
        type: 'first',
        displayName: (firstDisplayName || 'Primary').trim(),
        username: `${session.accountCode}.1`,
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
        pinHash: firstPinHash,
        createdAt: now,
        updatedAt: now,
      };

      const secondDoc = {
        identityId: `${uid}_second`,
        id: `${uid}_second`,
        ownerUserId: uid,
        uid,
        type: 'second',
        displayName: (secondDisplayName || 'Stealth').trim(),
        username: `${session.accountCode}.2`,
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow',
        pinHash: secondPinHash,
        createdAt: now,
        updatedAt: now,
      };

      await Promise.all([
        setDoc(doc(db, 'identities', `${uid}_first`), firstDoc),
        setDoc(doc(db, 'identities', `${uid}_second`), secondDoc),
        updateDoc(doc(db, 'users', uid), { hasConfiguredPins: true, updatedAt: now }),
      ]);

      return res.json({
        success: true,
        firstIdentity: firstDoc,
        secondIdentity: secondDoc,
      });
    } catch (err: any) {
      console.error('Setup identities error:', err);
      return res.status(500).json({ error: 'Failed to configure identities.' });
    }
  });

  // ==========================================
  // POST /api/auth/logout
  // ==========================================
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('calcchat_token');
    return res.json({ success: true });
  });

  // ==========================================
  // GET /api/contacts/lookup/:accountCode
  // Exact-code lookup only; never returns a global user directory.
  // ==========================================
  app.get('/api/contacts/lookup/:accountCode', requireAuth, rateLimit(60_000, 30), async (req, res) => {
    try {
      const code = String(req.params.accountCode || '').trim().toUpperCase();
      if (!/^[A-Z]{2}[A-Z2-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid Account Code.' });
      }
      const session = (req as any).session as { uid: string };
      const codeSnap = await getDoc(doc(db, 'accountCodes', code.toLowerCase()));
      if (!codeSnap.exists()) return res.status(404).json({ error: 'Account not found.' });
      const codeData = codeSnap.data() as any;
      const uid = String(codeData.uid || '');
      if (!uid || uid === session.uid) return res.status(404).json({ error: 'Account not found.' });
      const [userSnap, firstSnap, secondSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'identities', `${uid}_first`)),
        getDoc(doc(db, 'identities', `${uid}_second`)),
      ]);
      if (!userSnap.exists()) return res.status(404).json({ error: 'Account not found.' });
      const user = userSnap.data() as any;
      const sanitizeIdentity = (snap: any) => {
        if (!snap.exists()) return null;
        const d = snap.data() as any;
        const { pinHash, ...safe } = d;
        return { ...safe, id: `${uid}_${d.type}`, identityId: `${uid}_${d.type}`, uid, ownerUserId: uid };
      };
      return res.json({
        account: { uid, accountCode: user.accountCode, displayName: user.displayName, avatar: user.avatar, createdAt: user.createdAt, updatedAt: user.updatedAt },
        firstIdentity: sanitizeIdentity(firstSnap),
        secondIdentity: sanitizeIdentity(secondSnap),
      });
    } catch (err) {
      console.error('Contact lookup error:', err);
      return res.status(500).json({ error: 'Lookup failed.' });
    }
  });

  // ==========================================
  // PATCH /api/profile/identity
  // Authenticated profile update. PIN hashes can never be updated here.
  // ==========================================
  app.patch('/api/profile/identity', requireAuth, async (req, res) => {
    try {
      const session = (req as any).session as { uid: string };
      const { identityType, displayName, about, statusMessage, avatar } = req.body || {};
      if (identityType !== 'first' && identityType !== 'second') return res.status(400).json({ error: 'Invalid identity.' });
      const cleanName = String(displayName || '').trim();
      const cleanAbout = String(about || '').trim().slice(0, 140);
      const cleanStatus = String(statusMessage || '').trim().slice(0, 140);
      if (!cleanName || cleanName.length > 80) return res.status(400).json({ error: 'Display name must be 1-80 characters.' });
      const allowedAvatars = new Set([
        'https://api.dicebear.com/7.x/bottts/svg?seed=Shadow','https://api.dicebear.com/7.x/bottts/svg?seed=Felix','https://api.dicebear.com/7.x/bottts/svg?seed=Nova','https://api.dicebear.com/7.x/bottts/svg?seed=Cipher','https://api.dicebear.com/7.x/bottts/svg?seed=Phantom','https://api.dicebear.com/7.x/bottts/svg?seed=Vortex','https://api.dicebear.com/7.x/bottts/svg?seed=Titan','https://api.dicebear.com/7.x/bottts/svg?seed=Echo'
      ]);
      if (avatar && !allowedAvatars.has(String(avatar))) return res.status(400).json({ error: 'Invalid profile avatar.' });
      const ref = doc(db, 'identities', `${session.uid}_${identityType}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return res.status(404).json({ error: 'Identity not found.' });
      const updates: any = { displayName: cleanName, about: cleanAbout, statusMessage: cleanStatus, updatedAt: Date.now() };
      if (avatar) updates.avatar = String(avatar);
      await updateDoc(ref, updates);
      return res.json({ success: true, identity: { ...snap.data(), ...updates, pinHash: undefined } });
    } catch (err) {
      console.error('Profile update error:', err);
      return res.status(500).json({ error: 'Profile update failed.' });
    }
  });

  app.patch('/api/profile/account', requireAuth, async (req, res) => {
    try {
      const session = (req as any).session as { uid: string };
      const { displayName, avatar } = req.body || {};
      const cleanName = String(displayName || '').trim();
      if (!cleanName || cleanName.length > 80) return res.status(400).json({ error: 'Display name must be 1-80 characters.' });
      const updates: any = { displayName: cleanName, updatedAt: Date.now() };
      if (avatar) updates.avatar = String(avatar);
      await updateDoc(doc(db, 'users', session.uid), updates);
      return res.json({ success: true });
    } catch (err) {
      console.error('Account profile update error:', err);
      return res.status(500).json({ error: 'Account profile update failed.' });
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CalcChat full-stack server running on http://localhost:${PORT}`);
    console.log(`LAN access (if needed): http://<this-PC-IP>:${PORT}`);
  });
}

startServer();
