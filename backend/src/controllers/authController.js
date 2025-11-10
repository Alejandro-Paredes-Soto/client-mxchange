const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
console.log('🔧 JWT Secret configurado:', jwtSecret ? 'Sí' : 'No', '- Longitud:', jwtSecret?.length || 0);

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await userModel.findByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    console.log('🔍 Usuario encontrado:', { id: user.idUser || user.id, email: user.email, active: user.active });
    // Verificar si el usuario está activo
    if (!user.active) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // userModel returns `idUser` from the DB; normalize to `id` in the token and response
    const userId = user.idUser || user.id;
    const branchId = user.branch_id || null;
    const token = jwt.sign({ id: userId, email: user.email, role: user.role, branch_id: branchId }, jwtSecret, { expiresIn: '8h' });
    console.log('✅ Token generado:', token.substring(0, 50) + '...');
    console.log('✅ Secret usado:', jwtSecret.substring(0, 10) + '...');
    return res.json({ token, user: { id: userId, email: user.email, name: user.name, role: user.role, branch_id: branchId } });
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password required' });

    const existing = await userModel.findByEmail(email);
    if (existing) {
      // Verificar el método de autenticación usado
      const authMethod = existing.auth_provider || 'email';
      if (authMethod === 'google') {
        return res.status(409).json({ 
          message: 'Este correo ya está registrado con Google. Por favor, inicia sesión con Google.',
          authProvider: 'google'
        });
      } else {
        return res.status(409).json({ 
          message: 'Este correo ya está registrado. Por favor, inicia sesión con tu correo y contraseña.',
          authProvider: 'email'
        });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await userModel.createUser({ name, email, password: hashed, auth_provider: 'email' });

    const userId = user.idUser || user.id;
    const branchId = user.branch_id || null;
    const token = jwt.sign({ id: userId, email: user.email, role: user.role, branch_id: branchId }, jwtSecret, { expiresIn: '8h' });
    // normalize returned user to include `id`
    const returnedUser = { id: userId, name: user.name, email: user.email, role: user.role, branch_id: branchId };
    return res.status(201).json({ token, user: returnedUser });
  } catch (err) {
    next(err);
  }
};

const loginGoogle = async (req, res, next) => {
  try {
    const { email, name } = req.body;
    console.log('🔍 Google Login attempt:', { email, name });
    
    if (!email || !name) return res.status(400).json({ message: 'Email and name required' });

    let user = await userModel.findByEmail(email);
    console.log('🔍 Usuario encontrado en Google Login:', user ? { id: user.idUser || user.id, email: user.email, active: user.active, auth_provider: user.auth_provider } : 'No encontrado');
    
    // Si el usuario no existe, lo creamos
    if (!user) {
      console.log('📝 Creando nuevo usuario para Google Login...');
      // Generar una contraseña temporal para usuarios de Google
      const tempPassword = Math.random().toString(36).substring(2, 15);
      const hashed = await bcrypt.hash(tempPassword, 10);
      user = await userModel.createUser({ name, email, password: hashed, auth_provider: 'google' });
      console.log('✅ Usuario creado:', { id: user.idUser || user.id, email: user.email });
    } else {
      // Si el usuario existe pero se registró con email/password
      const authMethod = user.auth_provider || 'email';
      if (authMethod === 'email') {
        console.log('❌ Usuario intentó login con Google pero se registró con email/password');
        return res.status(409).json({ 
          message: 'Este correo está registrado con email y contraseña. Por favor, inicia sesión con tu correo y contraseña.',
          authProvider: 'email'
        });
      }
    }

    // Verificar si el usuario existe después de la creación
    if (!user) {
      console.log('❌ Error: Usuario sigue siendo null después de creación');
      return res.status(500).json({ message: 'Failed to create or find user' });
    }

    // Verificar si el usuario está activo (solo si la propiedad existe)
    if (user.hasOwnProperty('active') && !user.active) {
      console.log('❌ Usuario desactivado:', user.email);
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }

    const userId = user.idUser || user.id;
    const branchId = user.branch_id || null;
    
    // Validar que tenemos un JWT secret válido
    if (!jwtSecret || jwtSecret.trim() === '') {
      console.log('❌ Error: JWT_SECRET no está configurado correctamente');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    console.log('🔧 Intentando crear token con secret:', jwtSecret);
    console.log('🔧 Payload del token:', { id: userId, email: user.email, role: user.role, branch_id: branchId });
    
    const token = jwt.sign({ id: userId, email: user.email, role: user.role, branch_id: branchId }, jwtSecret, { expiresIn: '8h' });
    
    console.log('✅ Google Login Token generado:', token.substring(0, 50) + '...');
    
    return res.json({ 
      data: {
        token,
        idUser: userId,
        email: user.email,
        name: user.name,
        role: user.role,
        branch_id: branchId
      }
    });
  } catch (err) {
    console.log('❌ Error en loginGoogle:', err.message);
    next(err);
  }
};

module.exports = { login, register, loginGoogle };
