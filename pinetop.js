// ***********************************************   Package Imports   ************************************************
const express = require("express");
const bodyParser = require("body-parser");
const morgan = require('morgan');
const winston = require('./config/winston');
const propertiesReader = require('properties-reader');
const fs = require('fs');
// const log = require('./logging/Logger').customLogger;
const router = express.Router();
const phidget22 = require('phidget22');
const Data = require('./config/sqlite');
const PotStill = require('./classes/potStill.js');
const FractionalStill = require('./classes/fractionalStill.js');
const FractionalStillRun = require('./classes/fractionalStillRun.js');
const Email = require('./config/email');

// ***********************************************   Unit Ops Module Imports   ****************************************
// const fractionalStill = require('./secondTry');
const fractionalStillSingleInteraction = require('./fractionalstillinteractions');
// const potStill = require('./unitOperations/potStill');
// ***********************************************   Express Server Setup   *******************************************
let propertiesFile = '.env.development.properties';
try {
  fs.accessSync(propertiesFile, fs.constants.R_OK | fs.constants.F_OK);
} catch (err) {
  console.log(err.message);
  propertiesFile = '.env.properties';
}
const properties = propertiesReader(propertiesFile);

const PORT = properties.get('server.port') | 3001;
const app = express();

//ADDED
var allowCrossDomain = function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

  // intercept OPTIONS method
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  }
  else {
    next();
  }
};

// app.use(logger.logRequest);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(allowCrossDomain);  //ADDED
app.use(router);
app.use(morgan('combined', { stream: winston.stream }));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


// ***********************************************   Pot Still Variables   *******************************************
// let serverPotStatus = false;
let potGraphData = [];
let serverPotOverview = {
  isGinRun:false,
  running:false,
  runStartTime:'',
  forcedTerminationTime:'',
  requiresStrippingRun:false,
  runEndTime:'',
  columnTemperature:'',
  message:''
}

let potControlSystem = {
  potHeatingElement:'',
  potHeatingElementHighVoltage:'',
  columnTemperature:'',
  chillerReturnWaterTemperature:''
}

let potTemperatureLoggingInterval = {};
let potLoggingStartTime = {};

// ***********************************************   Fractional Still Variables   ************************************
let fractionalGraphData = [];
let serverRunOverview = {
  currentBeaker:'',
  currentClickCountInBeaker:'',
  totalClickCountInBeaker:'',
  timeToCompleteBeaker:'',
  timeToCompleteRun: '',
  timeStarted:'',
  timePreHeatComplete:'',
  startAlcohol: 0,
  startVolume: 0,
  running:false,
  currentTemperature:0,
  // running:false,
  // startingBeaker:0,
  message:''
};
let fractionalControlSystem = {
  heatingElement:'',
  solenoid:'',
  retractArm:'',
  extendArm:'',
  tempProbe:''
};

let fractionalStillRun = undefined;

// ***********************************************   Phidget Board Initialization ************************************
var SERVER_PORT = 5661;
var hostName = '127.0.0.1';

let db_location = properties.get('server.db');
let sim_mode = properties.get('dev.sim') | false;
// let db_location ='./data/pinetop.db';
// if (process.argv.length > 2 && process.argv[2] == 'sim') {
//   sim_mode = true;
//   db_location = './data/sample.db';
// }

let data = new Data({
  location: db_location,
  logger: winston
});

const potStill = new PotStill({
  db: data,
  logger: winston
});

const email = new Email({
  logger: winston,
  user: properties.get('smtp.user'),
  password: properties.get('smtp.password'),
  server: properties.get('smtp.server'),
  ssl: properties.get('smtp.ssl') | false
});

const fractionalStill = new FractionalStill({
  db: data,
  logger: winston,
  email: email
});

if(sim_mode) {
  winston.debug('Skipping connection to phidget server');
  const MockPhidget = require('./classes/MockPhidget.js');
  fractionalControlSystem.heatingElement = new MockPhidget({name: 'fractional_heat', logger: winston, isTempSensor: true});
  fractionalControlSystem.solenoid = new MockPhidget({name: 'fractional_solenoid', logger: winston, isTempSensor: false});
  fractionalControlSystem.retractArm = new MockPhidget({name: 'fractional_arm_retract',logger: winston, isTempSensor: false});
  fractionalControlSystem.extendArm = new MockPhidget({name: 'fractional_arm_extend', logger: winston, isTempSensor: false});
  fractionalControlSystem.tempProbe = fractionalControlSystem.heatingElement;

  fractionalStill.setStillComponents({
    heatingElement: fractionalControlSystem.heatingElement,
    solenoid: fractionalControlSystem.solenoid,
    tempProbe: fractionalControlSystem.tempProbe,
    extendArm: fractionalControlSystem.extendArm,
    retractArm: fractionalControlSystem.retractArm
  });

  potControlSystem.potHeatingElement = new MockPhidget({name: 'pot_heat', logger: winston, isTempSensor: true});
  potControlSystem.potHeatingElementHighVoltage = new MockPhidget({name: 'pot_heat_high_voltage', logger: winston, isTempSensor: false});
  potControlSystem.columnTemperature = potControlSystem.potHeatingElement;
  potControlSystem.chillerReturnWaterTemperature = new MockPhidget({name: 'pot_chiller', logger: winston, isTempSensor: true});
} else {
  winston.info('Phidget connecting');
  var conn = new phidget22.Connection(SERVER_PORT, hostName, { name: 'Server Connection', passwd: '' });
  conn.connect(fractionalControlSystem, potControlSystem, fractionalStill)
    .then(initializePhidgetBoards(fractionalControlSystem, potControlSystem, fractionalStill))
    .catch(function (err) {
      winston.error('Error connecting to phidget:', err.message);
      process.exit(1);
    });
}

async function initializePhidgetBoards(fractionalControlSystem, potControlSystem, fractionalStill) {
  let heatingElement = new phidget22.DigitalOutput();
  heatingElement.setHubPort(0);
  heatingElement.setChannel(0);
  await heatingElement.open();
  fractionalControlSystem.heatingElement = heatingElement;
  winston.info('heating element attached');

  let solenoid = new phidget22.DigitalOutput();
  solenoid.setHubPort(0);
  solenoid.setChannel(1);
  await solenoid.open();
  fractionalControlSystem.solenoid = solenoid;
  winston.info('solenoid attached');

  let extendArm = new phidget22.DigitalOutput();
  extendArm.setHubPort(0);
  extendArm.setChannel(2);
  await extendArm.open();
  fractionalControlSystem.extendArm = extendArm;
  winston.info('arm extender attached');

  let retractArm = new phidget22.DigitalOutput();
  retractArm.setHubPort(0);
  retractArm.setChannel(3);
  await retractArm.open();
  fractionalControlSystem.retractArm = retractArm;
  winston.info('arm retractor attached');

  var tempProbe = new phidget22.TemperatureSensor();
  tempProbe.setHubPort(1);
  tempProbe.setChannel(1);
  await tempProbe.open();
  tempProbe.setDataInterval(500);
  fractionalControlSystem.tempProbe = tempProbe;
  winston.info('temp probe attached');

  var columnTemperature = new phidget22.TemperatureSensor();
  columnTemperature.setHubPort(1);
  columnTemperature.setChannel(0);
  await columnTemperature.open();
  columnTemperature.setDataInterval(500);
  potControlSystem.columnTemperature = columnTemperature;
  winston.info('pot temp probe attached');

  let potHeatingElement = new phidget22.DigitalOutput();
  potHeatingElement.setHubPort(2);
  potHeatingElement.setChannel(0);
  await potHeatingElement.open();
  potControlSystem.potHeatingElement = potHeatingElement;
  winston.info('pot heating element attached');

  let potHeatingElementHighVoltage = new phidget22.DigitalOutput();
  potHeatingElementHighVoltage.setHubPort(2);
  potHeatingElementHighVoltage.setChannel(1);
  await potHeatingElementHighVoltage.open();
  potControlSystem.potHeatingElementHighVoltage = potHeatingElementHighVoltage;
  winston.info('pot heating element attached');

  winston.info(`Fractional still control system established`);

  fractionalStill.setStillComponents({
    heatingElement: fractionalControlSystem.heatingElement,
    solenoid: fractionalControlSystem.solenoid,
    tempProbe: fractionalControlSystem.tempProbe,
    extendArm: fractionalControlSystem.extendArm,
    retractArm: fractionalControlSystem.retractArm
  });

  return true;
}

// ***********************************************   Routes   ********************************************************

// ***********************************************   Pot Still Routes   **********************************************
router.param('batch_id', function (req, res, next, id) {
  req.batch = {
    id: id
  }
  next()
})

router.route('/potsummary')
  .get((req,res) => {
    winston.info('front end asked what is the pot status')
    winston.info(`server status is ${JSON.stringify(serverPotOverview)}`);
    res.json({
      serverPotOverview:serverPotOverview
    });
  })

router.route('/potgraphdata')
  .get((req,res) => {
    //winston.info('front end asked for graph data')
    res.json({
      potGraphData:potGraphData
    });
  })

router.route('/historicaldata')
  .get((req,res) => {
    winston.info('front end asked for historical data')
    let history = undefined;
    data.getTimePoints(undefined, (data) => {
      history = data;
      res.json({
        data: history
      })
    })
  })

router.route('/historicaldata/:batch_id')
  .get((req,res) => {
    winston.info('front end asked for historical data for ' + req.batch.id)
    let history = undefined;
    data.getTimePoints(req.batch.id, (data) => {
      history = data;
      res.json({
        data: history
      })
    })
  })

router.route('/rundata')
  .get((req,res) => {
    winston.info('front end asked for run data')
    let runs = undefined;
    data.getRun(undefined, (data) => {
      runs = data;
      res.json({
        data: runs
      })
    })
  })

router.route('/rundata/:batch_id')
  .get((req,res) => {
    winston.info('front end asked for run data for ' + req.batch.id)
    let runs = undefined;
    data.getRun(req.batch.id, (data) => {
      runs = data;
      res.json({
        data: runs
      })
    })
  })

router.route('/rundata/:batch_id')
  .post((req,res) => {
    let body = req.body;
    winston.info(`Run update: ${JSON.stringify(body)}`);
    data.finishRun({
      batchID: req.batch.id,
      result: body.result
    })
    res.json({
      message:'Updated run data'
    });
  });

router.route('/getpotcolumntemperature')
  .get((req,res) => {
    let confirmationMessage = potControlSystem.columnTemperature.getTemperature();
    winston.info(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/startpottemperaturelogging')
  .get((req,res) => {
    potLoggingStartTime = Date.now();
    potTemperatureLoggingInterval = setInterval(() => {
      let dataPoint = {}
      dataPoint.y = potControlSystem.columnTemperature.getTemperature();
      dataPoint.x = (Date.now() - potLoggingStartTime)/(1000*60);
      dataPoint.id = Date.now();
      potGraphData.push(dataPoint);
      serverPotOverview.columnTemperature = dataPoint.y;
    },60000)
    let confirmationMessage = `logging started`;
    serverPotOverview.columnTemperature = potControlSystem.columnTemperature.getTemperature();
    res.json({
      message:confirmationMessage
    })
  })

router.route('/stoppottemperaturelogging')
  .get((req,res) => {
    clearInterval(potTemperatureLoggingInterval);
    let confirmationMessage = `logging terminated`;
    res.json({
      message:confirmationMessage
    })
  })

router.route('/potheaton')
  .get((req,res) => {
    let confirmationMessage = `pot heat on`;
    winston.info(`turning on pot heat`);
    potControlSystem.potHeatingElement.setState(true);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/pothighvoltageheaton')
  .get((req,res) => {
    let confirmationMessage = `pot heat on`;
    winston.info(`turning on pot heat`);
    potControlSystem.potHeatingElementHighVoltage.setState(true);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/potheatoff')
  .get((req,res) => {
    let confirmationMessage = `pot heat off`;
    winston.info(`turning off pot heat`);
    potControlSystem.potHeatingElement.setState(false);
    potControlSystem.potHeatingElementHighVoltage.setState(false);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/resetpotafterginrun')
  .get((req,res) => {
    let confirmationMessage = `pot is reset`;
    serverPotOverview.requiresStrippingRun = false;
    res.json({
      message:confirmationMessage
    });
  })

router.route('/setpot')
  .post((req,res) => {
    let potStillInitiatingValues = JSON.parse(req.body.potStillInitiatingValues);
    winston.info(JSON.stringify(potStillInitiatingValues));
    serverPotOverview.forcedTerminationTime = potStillInitiatingValues.forcedTerminationTime;
    potGraphData = [];
    serverPotOverview.potStillInitiatingValues = potStillInitiatingValues;
    potStill.startPotRun(potGraphData,serverPotOverview,potControlSystem);
    res.json({
      message:'Started Pot Run'
    });
  });

// ***********************************************   Fractional Still Routes   ****************************************
router.route('/setfractional')
  .post((req,res) => {
    let fractionalStillInitiatingValues = JSON.parse(req.body.fractionalStillInitiatingValues);
    winston.info(JSON.stringify(fractionalStillInitiatingValues));
    const startAlcohol = parseFloat(fractionalStillInitiatingValues.startAlcohol);
    if (startAlcohol > 1) {
      serverRunOverview.startAlcohol=startAlcohol/100;
    } else {
      serverRunOverview.startAlcohol=startAlcohol;
    }

    serverRunOverview.startVolume=parseFloat(fractionalStillInitiatingValues.startVolume);
    serverRunOverview.collectionCoefficient=parseFloat(fractionalStillInitiatingValues.collectionCoefficient);
    serverRunOverview.lastFractionForHeads=parseFloat(fractionalStillInitiatingValues.lastFractionForHeads);
    serverRunOverview.lastFractionForHearts=parseFloat(fractionalStillInitiatingValues.lastFractionForHearts);
    serverRunOverview.preHeatEndTemperature=parseFloat(fractionalStillInitiatingValues.preHeatEndTemperature);
    serverRunOverview.preHeatTime=fractionalStillInitiatingValues.preHeatTime;

    const methanolPercent = parseFloat(fractionalStillInitiatingValues.methanolPercent);
    if (methanolPercent > 1) {
      serverRunOverview.methanolPercent=methanolPercent/100;
    } else {
      serverRunOverview.methanolPercent=methanolPercent;
    }

    const volumeHeadsPercent = parseFloat(fractionalStillInitiatingValues.volumeHeadsPercent);
    if (volumeHeadsPercent > 1) {
      serverRunOverview.volumeHeadsPercent=volumeHeadsPercent/100;
    } else {
      serverRunOverview.volumeHeadsPercent=volumeHeadsPercent;
    }

    const volumeTailsPercent = parseFloat(fractionalStillInitiatingValues.volumeTailsPercent);
    if (volumeTailsPercent > 1) {
      serverRunOverview.volumeTailsPercent=volumeTailsPercent/100;
    } else {
      serverRunOverview.volumeTailsPercent=volumeTailsPercent;
    }

    fractionalGraphData=[];
    winston.info(JSON.stringify(serverRunOverview));
    serverRunOverview.notifyEmail = properties.get('smtp.notify')
    fractionalStill.startFractionalRun(fractionalGraphData,serverRunOverview,fractionalControlSystem);
    // serverRunOverview.fractionalStillRun = new FractionalStillRun({
    //   db: data,
    //   logger: winston,
    //   still: fractionalStill,
    //   input: serverRunOverview
    // });
    res.json({
      message:'started fractional run'
    });
  })

// router.route('/fractionalstatus')
//   .get((req,res) => {
//     winston.debug('front end asked what is the fractional still status')
//     // winston.debug(`server status is ${serverRunOverview.fractionalStillRun.running}`);
//     winston.debug(`server status is ${fractionalStill.busy}`);
//     res.json({
//       serverFractionalStatus:fractionalStill.busy
//     });
//   })

router.route('/fractionalgraphdata')
  .get((req,res) => {
    //winston.info('front end asked for graph data')
    res.json({
      fractionalGraphData:fractionalGraphData
    });
  })

router.route('/fractionalsummary')
  .get((req,res) => {
    //winston.debug('front end asked for fractional summary')
    if (fractionalStill.busy) {
      res.json({
        serverRunOverview: fractionalStillRun.getRunStatus()
      });
    } else if (serverRunOverview.running) {
      res.json({
        serverRunOverview:serverRunOverview
      });
    } else {
      res.json({
        serverRunOverview:serverRunOverview
      });
    }
  })

router.route('/startFractionalRun').post((req,res) => {
  let fractionalStillInitiatingValues = JSON.parse(req.body.fractionalStillInitiatingValues, (key, value) =>
    isNaN(value)
    ? value
    : parseFloat(value)
  );
  winston.info(JSON.stringify(fractionalStillInitiatingValues));
  if (fractionalStill.busy) {
    res.json({
      message:'fraction still already busy'
    });
  } else {
    fractionalStillRun = new FractionalStillRun({
      db: data,
      logger: winston,
      still: fractionalStill,
      input: fractionalStillInitiatingValues,
      email: email,
      notify: properties.get('smtp.notify')
    });
    res.json({
      message:'started fractional still run'
    });
  }
})

router.route('/fractionalStillSummary').get((req, res) => {
  //winston.debug('front end asked for fractional still summary');
  let respData = {
    running: false,
    currentTemperature: 0,
    message:''
  };
  if (fractionalStill.busy) {
    respData = fractionalStill.run.getRunStatus();
  }
  //winston.debug(JSON.stringify(respData));
  res.json({
    serverRunOverview:respData
  });
})

router.route('/fractionalStillGraphData').get((req,res) => {
  winston.info('front end asked for fractional still graph data')
  if (fractionalStill.busy && fractionalStill.run) {
    data.getTimePoints(fractionalStill.run.id, (data) => {
      history = data;
      const newDataPoints = [];
      history.forEach((datapoint) => {
        newDataPoints.push({
          x: (new Date(datapoint.timestamp)).toLocaleTimeString(),
          y: datapoint.temperature,
          id: datapoint.timestamp
        });
      });
      res.json({
        fractionalGraphData: newDataPoints
      })
    });
  }
})

router.route('/extendarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'extendArm');
    winston.info(`extending arm`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/retractarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'retractArm');
    winston.info(`retracting arm`);
    res.json({
      message:confirmationMessage
    });
  })
router.route('/turnonheat')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'heatOn');
    winston.info(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/turnoffheat')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'heatOff');
    winston.info(`turning off heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/fracchecktemp')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'checkTemp');
    winston.info(`returned temperature`);
    res.json({
      message:confirmationMessage
    });
  })
router.route('/openvalve')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'openValve');
    winston.info(`opening valve`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/closevalve')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'closeValve');
    winston.info(`closing valve`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/fractionalstill/movearm').post((req, res) => {
  (async () => {
    winston.info(JSON.stringify(req.body));
    let result = 'failed to move arm';
    switch(req.body.position) {
      case 'heads':
        await fractionalStill.resetArm()
        result = 'set arm to heads position'
        break
      case 'hearts':
        await fractionalStill.moveArmForHearts()
        result = 'set arm to hearts position'
        break
      case 'tails':
        await fractionalStill.moveArmForTails()
        result = 'set arm to tails position'
        break
      default:
        await fractionalStill.resetArm()
        result = 'set arm to heads position'
    }
    res.json({
      message: result
    });
  })()
})

router.route('/fractionalstill/heat').post((req, res) => {
  (async () => {
    winston.info(JSON.stringify(req.body));
    switch (req.body.state) {
      case 'on':
        await fractionalStill.turnHeatOn()
        break
      case 'off':
        await fractionalStill.turnHeatOff()
        break
      default:
        await fractionalStill.turnHeatOff()
    }
    res.json({
      state: fractionalStill.heatStatus
    });
  })()
})
.get((req, res) => {
  winston.info('checking temperature');
  res.json({
    temperature: fractionalStill.temperature,
    state: fractionalStill.heatStatus
  });
})

router.route('/fractionalstill/solenoid').post((req, res) => {
  (async () => {
    winston.info(JSON.stringify(req.body))
    switch (req.body.state) {
      case 'open':
        await fractionalStill.openSolenoid()
        break
      case 'close':
        await fractionalStill.closeSolenoid()
        break
      default:
        await fractionalStill.closeSolenoid()
    }
    res.json({
      state: fractionalStill.solenoidStatus
    });
  })()
})
.get((req, res) => {
  winston.info('checking solenoid state')
  res.json({
    state: fractionalStill.solenoidStatus
  });
})

// ***********************************************   Phidget Test Routes   ****************************************
// router.route('/simplifiedprogram')
//   .get((req,res) => {
//     serverRunOverview.startAlcohol=.3;
//     serverRunOverview.startVolume=38.8;
//     serverFractionalStatus=req.body.desiredFractionalState;
//     fractionalGraphData=[];
//     fractionalStill.startFractionalRun(fractionalGraphData,serverRunOverview,fractionalControlSystem);
//     res.json({
//       message:'started simple program'
//     });
//   })

router.route('*')
  .get((req,res) => {
    var userIP = req.socket.remoteAddress;
    winston.info(`user from ${userIP} just pinged the server`);
    res.status(404);
  })
// ***********************************************   Start API server   ****************************************
var server = app.listen(PORT, function() {
  winston.info(`🌎  ==> API Server now listening on PORT ${PORT}!`);
});

process.on('SIGINT', () => {
  data.close();
  winston.info('SIGTERM signal received.');
  winston.info('Closing http server.');
  server.close(() => { winston.info('Server shutdown.'); });
  process.exit(0);
});
