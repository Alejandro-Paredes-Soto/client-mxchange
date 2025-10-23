require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Ajustar según el puerto del frontend
    methods: ["GET", "POST"]
  }
});

// Hacer io disponible globalmente o pasarlo a los controladores
global.io = io;

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
