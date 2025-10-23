const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const healthRoutes = require('./routes/healthRoutes');
const transactionsRoutes = require('./routes/transactionsRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cors());

app.use('/auth', authRoutes);
app.use('/health', healthRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/public', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/payments', paymentsRoutes);

app.use(errorHandler);

module.exports = app;
