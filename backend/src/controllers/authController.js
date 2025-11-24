const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { sendPasswordResetEmail } = require('../services/emailService');

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
    
    // Si el usuario no existe, NO lo creamos - debe registrarse primero
    if (!user) {
      console.log('❌ Usuario no encontrado - debe registrarse');
      return res.status(404).json({ 
        message: 'No tienes una cuenta registrada. Por favor regístrate primero.',
        requiresRegistration: true
      });
    }
    
    // Si el usuario existe pero se registró con email/password
    const authMethod = user.auth_provider || 'email';
    if (authMethod === 'email') {
      console.log('❌ Usuario intentó login con Google pero se registró con email/password');
      return res.status(409).json({ 
        message: 'Este correo está registrado con email y contraseña. Por favor, inicia sesión con tu correo y contraseña.',
        authProvider: 'email'
      });
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

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email es requerido' });
    }

    const user = await userModel.findByEmail(email);
    
    // Por seguridad, siempre respondemos con éxito aunque el email no exista
    // Esto previene que atacantes identifiquen emails válidos
    if (!user) {
      console.log('⚠️ Intento de reset para email no registrado:', email);
      return res.json({ message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña' });
    }

    // Verificar que el usuario se registró con email/password
    const authMethod = user.auth_provider || 'email';
    if (authMethod !== 'email') {
      console.log('⚠️ Intento de reset para cuenta de Google:', email);
      return res.status(400).json({ 
        message: 'Esta cuenta fue registrada con Google. No es posible restablecer la contraseña.',
        authProvider: 'google'
      });
    }

    // Verificar si el usuario está activo
    if (user.hasOwnProperty('active') && !user.active) {
      console.log('❌ Usuario desactivado intentó restablecer contraseña:', email);
      return res.status(403).json({ message: 'Tu cuenta ha sido desactivada. Contacta a soporte.' });
    }

    // Crear token JWT válido por 1 hora
    const resetToken = jwt.sign(
      { email: user.email, purpose: 'password-reset' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    console.log('🔑 Token de reset generado para:', email);

    // Enviar email con el token
    const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.name);
    
    if (!emailSent) {
      console.error('❌ Error enviando email de reset a:', email);
      return res.status(500).json({ message: 'Error enviando el correo. Por favor intenta más tarde.' });
    }

    console.log('✅ Email de reset enviado a:', email);
    return res.json({ message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña' });
  } catch (err) {
    console.error('❌ Error en forgotPassword:', err);
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Verificar el token
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      console.log('❌ Token inválido o expirado:', err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'El enlace ha expirado. Por favor solicita uno nuevo.' });
      }
      return res.status(401).json({ message: 'Enlace inválido' });
    }

    // Verificar que sea un token de reset de contraseña
    if (decoded.purpose !== 'password-reset') {
      console.log('❌ Token no es de reset de contraseña');
      return res.status(401).json({ message: 'Enlace inválido' });
    }

    const { email } = decoded;

    // Verificar que el usuario existe
    const user = await userModel.findByEmail(email);
    if (!user) {
      console.log('❌ Usuario no encontrado para email:', email);
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar la contraseña
    const updated = await userModel.updatePassword(email, hashedPassword);
    
    if (!updated) {
      console.error('❌ Error actualizando contraseña para:', email);
      return res.status(500).json({ message: 'Error actualizando la contraseña' });
    }

    console.log('✅ Contraseña actualizada exitosamente para:', email);
    return res.json({ message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('❌ Error en resetPassword:', err);
    next(err);
  }
};

module.exports = { login, register, loginGoogle, forgotPassword, resetPassword };
