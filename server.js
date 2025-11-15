const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path'); // Added for static files
const https = require('https');
const fs = require('fs');

// Environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
// JSON ve URL-encoded body parser'lar için limit artırıldı (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files - uploads klasörü
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard/build')));

// Database connection - MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB bağlantısı başarılı!'))
.catch(err => {
  console.error('❌ MongoDB bağlantı hatası:', err);
  console.log('💡 MongoDB\'yi başlatmayı deneyin: mongod');
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'AI Banner Generator API çalışıyor!',
    version: '1.0.0',
    status: 'MongoDB connected',
    endpoints: {
      auth: '/api/auth',
      restaurants: '/api/restaurants',
      banners: '/api/banners',
      ai: '/api/ai/generate-banner'
    }
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/restaurants', require('./routes/restaurants'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/events', require('./routes/events'));
app.use('/api/event', require('./routes/eventNew'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));

console.log('📋 Kayıtlı route\'lar:');
console.log('  - /api/auth');
console.log('  - /api/restaurants');
console.log('  - /api/banners');
console.log('  - /api/ai');
console.log('  - /api/events');
console.log('  - /api/event (new)');
console.log('  - /api/users');
console.log('  - /api/admin');
console.log('  - /api/analytics');



// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Sunucu hatası!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Dashboard fallback route - React Router için
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/build', 'index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route bulunamadı!' });
});

// Batch Notification Job'ı başlat (15 dakika batch için)
try {
  const { startBatchJob } = require('./services/notificationQueueService');
  startBatchJob();
  console.log('✅ Batch notification job başlatıldı (15 dakika)');
} catch (error) {
  console.log('⚠️ Batch notification job başlatılamadı (Redis yoksa normal):', error.message);
}

// Push Notification Setup Test (Firebase/APNs)
try {
  const { testPushNotificationSetup } = require('./services/pushNotificationService');
  testPushNotificationSetup();
} catch (error) {
  console.log('⚠️ Push notification setup test hatası:', error.message);
}

// HTTP Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP Server ${PORT} portunda çalışıyor`);
  console.log(`📱 API: http://localhost:${PORT}`);
  console.log(`🌐 Network API: http://13.48.132.212:${PORT}`);
  console.log(`🗄️  MongoDB bağlantısı aktif`);
});

// HTTPS Server
/*
try {
  const httpsOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
  };
  
  https.createServer(httpsOptions, app).listen(8443, '0.0.0.0', () => {
    console.log(`🔒 HTTPS Server 8443 portunda çalışıyor`);
    console.log(`🌐 HTTPS API: https://13.48.132.212:8443`);
  });
} catch (error) {
  console.log('⚠️  HTTPS server başlatılamadı:', error.message);
  console.log('📝 SSL sertifikası bulunamadı, sadece HTTP çalışıyor');
}
  */