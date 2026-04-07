const { S3Client } = require('@aws-sdk/client-s3')

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  },
  forcePathStyle: true // Diperlukan untuk MinIO agar tidak menggunakan subdomain bucket
})

module.exports = s3
