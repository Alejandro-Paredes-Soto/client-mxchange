const pool = require('../config/db');


const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT idUser, email, password, name, role, createdAt FROM users WHERE email = ?', [email]);
  return rows[0];
};

const createUser = async ({ name, email, password }) => {
  const [result] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password]);
  return { idUser: result.insertId, name, email, role: 'client' };
};

module.exports = { findByEmail, createUser };
