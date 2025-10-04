const SMSVerification = require('../models/SMSVerification');
const twilio = require('twilio');

// Twilio SMS service
class SMSService {
  // Twilio client'ı initialize et
  static getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      console.log('⚠️ Twilio credentials not set, using mock SMS');
      return null;
    }
    
    return twilio(accountSid, authToken);
  }
  // 6 haneli rastgele kod üret
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // SMS gönderme (Twilio Verify API ile)
  static async sendSMS(phone, code) {
    try {
      const client = this.getTwilioClient();
      
      if (!client) {
        // Mock SMS (Twilio credentials yoksa)
        console.log(`📱 SMS Gönderildi (Mock) - Telefon: ${phone}, Kod: ${code}`);
        return { success: true, message: 'SMS başarıyla gönderildi (Mock)' };
      }

      // Türkiye telefon numarası formatını düzelt
      const formattedPhone = phone.startsWith('+') ? phone : `+90${phone}`;
      
      // Twilio Verify API kullan (trial hesaplarda çalışır)
      let serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
      
      if (!serviceSid) {
        // Service yoksa oluştur
        console.log('🔧 Twilio Verify Service oluşturuluyor...');
        const service = await client.verify.v2.services.create({
          friendlyName: 'SMS Verification Service',
          codeLength: 6,
          lookupEnabled: true,
          skipSmsToLandlines: false,
          dtmfInputRequired: false,
          ttsName: 'SMS Verification'
        });
        serviceSid = service.sid;
        console.log(`✅ Verify Service oluşturuldu: ${serviceSid}`);
        console.log(`🔧 .env dosyasına şunu ekleyin: TWILIO_VERIFY_SERVICE_SID=${serviceSid}`);
      }
      
      // Service ayarlarını güncelle (International SMS için)
      try {
        await client.verify.v2.services(serviceSid).update({
          codeLength: 6,
          lookupEnabled: true,
          skipSmsToLandlines: false,
          dtmfInputRequired: false
        });
        console.log('✅ Verify Service ayarları güncellendi');
      } catch (updateError) {
        console.log('⚠️ Service ayarları güncellenemedi:', updateError.message);
      }
      
      const verification = await client.verify.v2
        .services(serviceSid)
        .verifications
        .create({
          to: formattedPhone,
          channel: 'sms'
        });

      console.log(`📱 SMS Gönderildi (Twilio Verify) - SID: ${verification.sid}`);
      console.log(`📱 Verification Status: ${verification.status}`);
      
      // Verification detaylarını kontrol et
      if (verification.status === 'pending') {
        console.log('✅ SMS başarıyla gönderildi (Status: pending)');
      } else {
        console.log(`⚠️ SMS durumu: ${verification.status}`);
      }
      
      return { success: true, message: 'SMS başarıyla gönderildi', verificationSid: verification.sid };
    } catch (error) {
      console.error('SMS gönderme hatası:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        status: error.status,
        moreInfo: error.moreInfo
      });
      
      // Twilio hatası varsa mock SMS'e fallback
      if (error.code === 21211 || error.code === 21408 || error.code === 21608) {
        console.log(`📱 SMS Gönderildi (Mock Fallback) - Telefon: ${phone}, Kod: ${code}`);
        return { success: true, message: 'SMS başarıyla gönderildi (Mock Fallback)' };
      }
      
      return { success: false, message: `SMS gönderilemedi: ${error.message}` };
    }
  }

  // Doğrulama kodu oluştur ve kaydet
  static async createVerificationCode(phone) {
    try {
      // Mevcut doğrulama kodunu sil
      await SMSVerification.deleteMany({ phone });

      // Yeni kod üret
      const code = this.generateVerificationCode();

      // SMS gönder
      const smsResult = await this.sendSMS(phone, code);
      if (!smsResult.success) {
        throw new Error(smsResult.message);
      }

      // Veritabanına kaydet
      const verification = new SMSVerification({
        phone,
        code
      });

      await verification.save();

      return {
        success: true,
        message: 'Doğrulama kodu gönderildi',
        code // Test için kod döndürülüyor (production'da kaldırılmalı)
      };
    } catch (error) {
      console.error('Doğrulama kodu oluşturma hatası:', error);
      return {
        success: false,
        message: error.message || 'Doğrulama kodu oluşturulamadı'
      };
    }
  }

  // Doğrulama kodunu kontrol et (Twilio Verify API ile)
  static async verifyCode(phone, inputCode) {
    try {
      const client = this.getTwilioClient();
      
      if (!client) {
        // Mock doğrulama
        const verification = await SMSVerification.findOne({ phone });
        if (verification && verification.code === inputCode) {
          await SMSVerification.deleteOne({ phone });
          return { success: true, message: 'Kod doğrulandı' };
        }
        return { success: false, message: 'Doğrulama kodu hatalı', attemptsLeft: 2 };
      }

      // Türkiye telefon numarası formatını düzelt
      const formattedPhone = phone.startsWith('+') ? phone : `+90${phone}`;
      
      // Twilio Verify API ile doğrulama
      let serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
      
      if (!serviceSid) {
        return {
          success: false,
          message: 'Verify Service SID bulunamadı'
        };
      }

      const verificationCheck = await client.verify.v2
        .services(serviceSid)
        .verificationChecks
        .create({
          to: formattedPhone,
          code: inputCode
        });

      console.log(`🔍 Twilio Verify Check - Status: ${verificationCheck.status}`);
      
      if (verificationCheck.status === 'approved') {
        return {
          success: true,
          message: 'Kod doğrulandı'
        };
      } else {
        return {
          success: false,
          message: 'Doğrulama kodu hatalı',
          attemptsLeft: 2
        };
      }

      // Başarılı doğrulama
      verification.isVerified = true;
      await verification.save();

      return {
        success: true,
        message: 'Telefon numarası doğrulandı'
      };
    } catch (error) {
      console.error('Doğrulama kodu kontrol hatası:', error);
      return {
        success: false,
        message: 'Doğrulama işlemi başarısız'
      };
    }
  }
}

module.exports = SMSService;
