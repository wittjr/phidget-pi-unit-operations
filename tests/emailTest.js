const Email = require('../config/email');
const util = require('util');
const winston = require('../config/winston');

const email = new Email({
  logger: winston,

});

email.sendMail('wittjr@gmail.com', 'Test', 'Test email');
