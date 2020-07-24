const { SMTPClient } = require('emailjs');

class EmailClient {
  constructor(options) {
    this.logger = options.logger;
    this.emailUser = 'hhgsmtp@gmail.com';
    this.emailClient = new SMTPClient({
      user: this.emailUser,
    	password: 'smtpP@ssw0rd',
    	host: 'smtp.gmail.com',
    	ssl: true,
    });
  }

  sendMail(recipient, subject, message) {
    this.emailClient.send(
    	{
    		text: message,
    		from: this.emailUser,
    		to: recipient,
    		subject: subject,
    	},
    	(err, message) => {
    		logger.error(err || message);
    	}
    );

  }
}

module.exports = EmailClient
