const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'secretkey';

function authenticate(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth) {
    console.warn('authenticate: Missing Authorization header');
    return res.status(401).json({ message: 'Missing Authorization header' });
  }
  const parts = auth.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];
  console.log('authenticate: token received:', token ? `${token.slice(0,10)}...` : '<<empty>>');
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (err) {
    console.warn('authenticate: token verification failed:', err && err.name ? err.name : err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { authenticate };
