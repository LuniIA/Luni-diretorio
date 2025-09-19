// config/twilio.js - Módulo para integração com Twilio
import twilio from 'twilio';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
});

class TwilioManager {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!this.accountSid || !this.authToken || !this.phoneNumber) {
      throw new Error('Credenciais do Twilio não configuradas no .env');
    }
    
    this.client = twilio(this.accountSid, this.authToken);
    logger.info('TwilioManager inicializado', { 
      accountSid: this.accountSid.substring(0, 8) + '...',
      phoneNumber: this.phoneNumber 
    });
  }

  async enviarMensagem(para, mensagem, messageSid = null) {
    try {
      const response = await this.client.messages.create({
        body: mensagem,
        from: this.phoneNumber,
        to: para
      });

      logger.info('Mensagem enviada via Twilio', {
        to: para,
        messageSid: response.sid,
        originalMessageSid: messageSid,
        messageLength: mensagem.length
      });

      return {
        success: true,
        messageSid: response.sid,
        status: response.status
      };
    } catch (error) {
      logger.error('Erro ao enviar mensagem via Twilio', {
        error: error.message,
        to: para,
        originalMessageSid: messageSid
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async enviarMensagemComMidia(para, mensagem, mediaUrl, messageSid = null) {
    try {
      const response = await this.client.messages.create({
        body: mensagem,
        from: this.phoneNumber,
        to: para,
        mediaUrl: [mediaUrl]
      });

      logger.info('Mensagem com mídia enviada via Twilio', {
        to: para,
        messageSid: response.sid,
        mediaUrl,
        originalMessageSid: messageSid
      });

      return {
        success: true,
        messageSid: response.sid,
        status: response.status
      };
    } catch (error) {
      logger.error('Erro ao enviar mensagem com mídia via Twilio', {
        error: error.message,
        to: para,
        mediaUrl,
        originalMessageSid: messageSid
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  validarWebhook(req) {
    try {
      const twilioSignature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      if (!twilioSignature) {
        logger.warn('Webhook sem assinatura Twilio');
        return false;
      }

      const isValid = twilio.validateRequest(
        this.authToken,
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('Webhook com assinatura inválida');
        return false;
      }

      logger.info('Webhook validado com sucesso');
      return true;
    } catch (error) {
      logger.error('Erro ao validar webhook', { error: error.message });
      return false;
    }
  }

  obterEstatisticas() {
    return {
      accountSid: this.accountSid ? this.accountSid.substring(0, 8) + '...' : 'não configurado',
      phoneNumber: this.phoneNumber || 'não configurado',
      status: 'ativo'
    };
  }
}

// Instância singleton
const twilioManager = new TwilioManager();

export default twilioManager;

