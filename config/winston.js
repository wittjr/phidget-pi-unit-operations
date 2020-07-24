'use strict'
// const appRoot = require('app-root-path');
const winston = require('winston');
require('winston-daily-rotate-file');

// var options = {
//   file: {
//     level: 'info',
//     filename: `${appRoot}/logs/app.log`,
//     handleExceptions: true,
//     json: true,
//     maxsize: 5242880, // 5MB
//     maxFiles: 5,
//     colorize: false,
//   },
//   console: {
//     level: 'debug',
//     handleExceptions: true,
//     json: false,
//     colorize: true,
//   },
// };

// const logger = new winston.createLogger({
//   transports: [
//     new winston.transports.File(options.file),
//     new winston.transports.Console(options.console)
//   ],
//
// });

const debug_log = new winston.transports.DailyRotateFile({
  filename: 'app-debug_%DATE%.log',
  dirname: 'logs',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '2m',
  level: 'debug',
  maxFiles: '5',
  handleExceptions: true
});

// const error_log = new winston.transports.DailyRotateFile({
//   filename: 'app-error_%DATE%.log',
//   dirname: 'logs',
//   datePattern: 'YYYY-MM-DD-HH',
//   zippedArchive: true,
//   maxSize: '1m',
//   level: 'error',
//   maxFiles: '2',
//   handleExceptions: true
// });

const app_log = new winston.transports.DailyRotateFile({
  filename: 'app_%DATE%.log',
  dirname: 'logs',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '2m',
  maxFiles: '5',
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  //defaultMeta: { service: 'phidget-pi-unit-operations' },
  transports: [
    //
    // - Write to all logs with level `info` and below to `quick-start-combined.log`.
    // - Write all logs error (and below) to `quick-start-error.log`.
    //
    // new winston.transports.File({ filename: `${appRoot}/logs/app-debug.log`, level: 'debug' }),
    debug_log,
    // error_log,
    app_log
  ],
    // exceptionHandlers: [
  //   debug_log,
  //   error_log
  // ],
  // handleExceptions: true,
  // maxsize: 5242880, // 5MB
  // maxFiles: 5,
  // maxSize: 5120, // 5MB
  // maxFiles: 2,
  exitOnError: false, // do not exit on handled exceptions
})

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: 'debug'
  }));
}

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  },
};

module.exports = logger;
