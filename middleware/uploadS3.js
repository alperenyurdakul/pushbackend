const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');

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
      const key = `uploads/logos/${Date.now()}-${Math.random().toString().slice(2)}.${ext}`;
      cb(null, key);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = uploadS3;



