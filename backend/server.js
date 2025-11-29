require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');
const expirationService = require('./src/services/expirationService');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Ajustar según el puerto del frontend
    methods: ["GET", "POST"]
  },
  // Configuración para evitar memory leaks
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Hacer io disponible globalmente o pasarlo a los controladores
global.io = io;

// Tracking de sockets por usuario para evitar memory leaks y limitar conexiones
const userSockets = new Map(); // userId -> Set<socketId>
const MAX_SOCKETS_PER_USER = 5;

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Registro de salas por rol/usuario
  socket.on('register', (payload) => {
    try {
      const { userId, role, branchId } = payload || {};
      
      // Tracking de sockets por usuario
      if (userId) {
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set());
        }
        const userSet = userSockets.get(userId);
        
        // Advertir si el usuario excede el límite de conexiones
        if (userSet.size >= MAX_SOCKETS_PER_USER) {
          console.warn(`[SOCKET] Usuario ${userId} tiene ${userSet.size} conexiones (límite: ${MAX_SOCKETS_PER_USER})`);
        }
        
        userSet.add(socket.id);
        socket.userId = userId; // Guardar referencia para limpieza en disconnect
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined room: user:${userId} (total: ${userSet.size})`);
      }
      
      // Sala para admins (reciben todas las notificaciones)
      if (role === 'admin') {
        socket.join('admins');
        console.log(`Socket ${socket.id} joined room: admins`);
      }
      
      // Sala para usuarios de sucursal (reciben notificaciones de su sucursal)
      if (role === 'sucursal' && branchId) {
        socket.join(`branch:${branchId}`);
        console.log(`Socket ${socket.id} joined room: branch:${branchId}`);
      }
    } catch (e) {
      console.warn('Error registrando socket en salas:', e && e.message ? e.message : e);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    
    // Limpiar tracking de usuario
    if (socket.userId) {
      const userSet = userSockets.get(socket.userId);
      if (userSet) {
        userSet.delete(socket.id);
        if (userSet.size === 0) {
          userSockets.delete(socket.userId);
          console.log(`[SOCKET] Usuario ${socket.userId} ya no tiene conexiones activas`);
        }
      }
    }
  });
});

// Iniciar el servicio de expiración automática
console.log('🚀 Iniciando servicio de expiración de transacciones...');
expirationService.start();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`✅ Expiration service active - checking every 5 minutes`);
});

// Manejar cierre graceful del servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo servidor...');
  expirationService.stop();
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Deteniendo servidor...');
  expirationService.stop();
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});
