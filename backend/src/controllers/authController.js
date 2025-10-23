const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const jwtSecret = process.env.JWT_SECRET || 'secretkey';

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await userModel.findByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  // userModel returns `idUser` from the DB; normalize to `id` in the token and response
  const userId = user.idUser || user.id;
  const token = jwt.sign({ id: userId, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
  return res.json({ token, user: { id: userId, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password required' });

    const existing = await userModel.findByEmail(email);
    if (existing) return res.status(409).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await userModel.createUser({ name, email, password: hashed });

  const userId = user.idUser || user.id;
  const token = jwt.sign({ id: userId, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
  // normalize returned user to include `id`
  const returnedUser = { id: userId, name: user.name, email: user.email, role: user.role };
  return res.status(201).json({ token, user: returnedUser });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, register };
