// ***********************************************   Package Imports   ************************************************
const express = require("express");
const bodyParser = require("body-parser");
const morgan = require('morgan');
const winston = require('./config/winston');
// const log = require('./logging/Logger').customLogger;
const router = express.Router();
const phidget22 = require('phidget22');
const Data = require('./config/sqlite');
const PotStill = require('./classes/potstill.js');
const FractionalStill = require('./classes/fractionalstill.js');

// ***********************************************   Unit Ops Module Imports   ****************************************
// const fractionalStill = require('./secondTry');
const fractionalStillSingleInteraction = require('./fractionalstillinteractions');
// const potStill = require('./unitOperations/potStill');
// ***********************************************   Express Server Setup   *******************************************
const PORT = 3001;
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
  running:false,
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

// ***********************************************   Phidget Board Initialization ************************************
var SERVER_PORT = 5661;
var hostName = '127.0.0.1';

let sim_mode = false;
let db_location ='./data/pinetop.db';
if (process.argv.length > 2 && process.argv[2] == 'sim') {
  sim_mode = true;
  db_location = './data/sample.db';
}

let data = new Data({
  location: db_location,
  logger: winston
});

const potStill = new PotStill({
  db: data,
  logger: winston
});

const fractionalStill = new FractionalStill({
  db: data,
  logger: winston
});

if(sim_mode) {
  winston.debug('Skipping connection to phidget server');
  const MockPhidget = require('./classes/MockPhidget.js');
  fractionalControlSystem.heatingElement = new MockPhidget({name: 'fractional_heat', logger: winston, isTempSensor: true});
  fractionalControlSystem.solenoid = new MockPhidget({name: 'fractional_solenoid', logger: winston, isTempSensor: false});
  fractionalControlSystem.retractArm = new MockPhidget({name: 'fractional_arm_retract',logger: winston, isTempSensor: false});
  fractionalControlSystem.extendArm = new MockPhidget({name: 'fractional_arm_extend', logger: winston, isTempSensor: false});
  fractionalControlSystem.tempProbe = fractionalControlSystem.heatingElement;
  potControlSystem.potHeatingElement = new MockPhidget({name: 'pot_heat', logger: winston, isTempSensor: true});
  potControlSystem.potHeatingElementHighVoltage = new MockPhidget({name: 'pot_heat_high_voltage', logger: winston, isTempSensor: false});
  potControlSystem.columnTemperature = potControlSystem.potHeatingElement;
  potControlSystem.chillerReturnWaterTemperature = new MockPhidget({name: 'pot_chiller', logger: winston, isTempSensor: true});
} else {
  winston.info('Phidget connecting');
  var conn = new phidget22.Connection(SERVER_PORT, hostName, { name: 'Server Connection', passwd: '' });
  conn.connect(fractionalControlSystem, potControlSystem)
    .then(initializePhidgetBoards(fractionalControlSystem, potControlSystem))
    .catch(function (err) {
      winston.error('Error connecting to phidget:', err.message);
      process.exit(1);
    });
}

async function initializePhidgetBoards( fractionalControlSystem, potControlSystem) {
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
  tempProbe.setDataInterval(500);
  await tempProbe.open();
  fractionalControlSystem.tempProbe = tempProbe;
  winston.info('temp probe attached');

  var columnTemperature = new phidget22.TemperatureSensor();
  columnTemperature.setHubPort(1);
  columnTemperature.setChannel(0);
  columnTemperature.setDataInterval(500);
  await columnTemperature.open();
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
    winston.info('front end asked for graph data')
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
    fractionalStill.startFractionalRun(fractionalGraphData,serverRunOverview,fractionalControlSystem);
    res.json({
      message:'started simple program'
    });
  })

router.route('/fractionalstatus')
  .get((req,res) => {
    winston.info('front end asked what is the pot status')
    winston.info(`server status is ${serverRunOverview.running}`);
    res.json({
      serverFractionalStatus:serverRunOverview.running
    });
  })

router.route('/fractionalgraphdata')
  .get((req,res) => {
    winston.info('front end asked for graph data')
    res.json({
      fractionalGraphData:fractionalGraphData
    });
  })

router.route('/fractionalsummary')
  .get((req,res) => {
    winston.info('front end asked for fractional summary')
    res.json({
      serverRunOverview:serverRunOverview
    });
  })

router.route('/extendarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'extendArm');
    winston.info(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/retractarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'retractArm');
    winston.info(`turning on heat`);
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
    winston.info(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/closevalve')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'closeValve');
    winston.info(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })


// ***********************************************   Phidget Test Routes   ****************************************
router.route('/simplifiedprogram')
  .get((req,res) => {
    serverRunOverview.startAlcohol=.3;
    serverRunOverview.startVolume=38.8;
    serverFractionalStatus=req.body.desiredFractionalState;
    fractionalGraphData=[];
    fractionalStill.startFractionalRun(fractionalGraphData,serverRunOverview,fractionalControlSystem);
    res.json({
      message:'started simple program'
    });
  })

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
