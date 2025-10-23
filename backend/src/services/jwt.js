const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET || 'secretkey';

const sign = (payload, opts = {}) => jwt.sign(payload, jwtSecret, { expiresIn: '8h', ...opts });

const verify = (token) => jwt.verify(token, jwtSecret);

module.exports = { sign, verify };
