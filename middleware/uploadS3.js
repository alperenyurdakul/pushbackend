const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config(); // .env değişkenlerini yükle

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadS3 = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    // ACL kullanmıyoruz; bucket ObjectOwnership: BucketOwnerEnforced
    // Erişimi bucket policy veya CloudFront üzerinden verin
    key: (req, file, cb) => {
      const original = file.originalname || 'file';
      const ext = original.includes('.') ? original.split('.').pop() : 'png';
      // Field name'e göre farklı klasörler
      const folder = file.fieldname === 'menuImage' ? 'menus' : 'logos';
      const key = `uploads/${folder}/${Date.now()}-${Math.random().toString().slice(2)}.${ext}`;
      cb(null, key);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Profil fotoğrafı için ayrı middleware
const uploadProfilePhoto = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const original = file.originalname || 'file';
      const ext = original.includes('.') ? original.split('.').pop() : 'png';
      const key = `uploads/profile-photos/${Date.now()}-${Math.random().toString().slice(2)}.${ext}`;
      cb(null, key);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Base64'ü S3'e yükleme fonksiyonu
const uploadBase64ToS3 = async (base64Data, folder = 'banners') => {
  try {
    // Base64 string'i parse et
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Geçersiz base64 format');
    }

    const fileType = matches[1]; // image/jpeg, image/png, etc.
    const base64String = matches[2];
    const buffer = Buffer.from(base64String, 'base64');

    // Dosya uzantısını belirle
    const extension = fileType.includes('png') ? 'png' : 
                     fileType.includes('jpeg') || fileType.includes('jpg') ? 'jpg' : 
                     'png';

    // Benzersiz dosya adı oluştur
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(16).toString('hex').slice(0, 8);
    const key = `uploads/${folder}/${timestamp}-${randomId}.${extension}`;

    // S3'e yükle
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: fileType,
    });

    await s3.send(command);

    // Public URL oluştur
    const publicUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    console.log(`✅ Base64 görsel S3e yüklendi: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('❌ Base64 S3 upload hatası:', error);
    throw error;
  }
};

module.exports = uploadS3;
module.exports.uploadBase64ToS3 = uploadBase64ToS3;
module.exports.uploadProfilePhoto = uploadProfilePhoto;



