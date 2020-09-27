const { SMTPClient } = require('emailjs');

class EmailClient {
  constructor(options) {
    this.logger = options.logger;
    this.emailUser = options.user;
    this.emailClient = new SMTPClient({
      user: this.emailUser,
    	password: options.password,
    	host: options.server,
    	ssl: options.ssl,
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
