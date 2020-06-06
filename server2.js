// ***********************************************   Package Imports   ************************************************
const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const router = express.Router();
const phidget22 = require('phidget22');

// ***********************************************   Unit Ops Module Imports   ****************************************
const fractionalStill = require('./secondTry');
const fractionalStillSingleInteraction = require('./fractionalstillinteractions');
const potStill = require('./unitOperations/potStill');

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
    res.send(200);
  }
  else {
    next();
  }
};

app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(allowCrossDomain);  //ADDED
app.use(router);

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
console.log('Phidget connecting');
var SERVER_PORT = 5661;
var hostName = '127.0.0.1';
var conn = new phidget22.Connection(SERVER_PORT, hostName, { name: 'Server Connection', passwd: '' });
conn.connect(fractionalControlSystem, potControlSystem)
  .then(initializePhidgetBoards(fractionalControlSystem, potControlSystem))
  .catch(function (err) {
    console.error('Error connecting to phidget:', err.message);
    process.exit(1);
  });

async function initializePhidgetBoards( fractionalControlSystem, potControlSystem) {
  let heatingElement = new phidget22.DigitalOutput();
  heatingElement.setHubPort(0);
  heatingElement.setChannel(0);
  await heatingElement.open();
  fractionalControlSystem.heatingElement = heatingElement;
  console.log('heating element attached');

  let solenoid = new phidget22.DigitalOutput();
  solenoid.setHubPort(0);
  solenoid.setChannel(1);
  await solenoid.open();
  fractionalControlSystem.solenoid = solenoid;
  console.log('solenoid attached');

  let extendArm = new phidget22.DigitalOutput();
  extendArm.setHubPort(0);
  extendArm.setChannel(2);
  await extendArm.open();
  fractionalControlSystem.extendArm = extendArm;
  console.log('arm extender attached');

  let retractArm = new phidget22.DigitalOutput();
  retractArm.setHubPort(0);
  retractArm.setChannel(3);
  await retractArm.open();
  fractionalControlSystem.retractArm = retractArm;
  console.log('arm retractor attached');

  var tempProbe = new phidget22.TemperatureSensor();
  tempProbe.setHubPort(1);
  tempProbe.setChannel(1);
  tempProbe.setDataInterval(500);
  await tempProbe.open();
  fractionalControlSystem.tempProbe = tempProbe;
  console.log('temp probe attached');
  
  var columnTemperature = new phidget22.TemperatureSensor();
  columnTemperature.setHubPort(1);
  columnTemperature.setChannel(0);
  columnTemperature.setDataInterval(500);
  await columnTemperature.open();
  potControlSystem.columnTemperature = columnTemperature;
  console.log('pot temp probe attached');
  
  let potHeatingElement = new phidget22.DigitalOutput();
  potHeatingElement.setHubPort(2);
  potHeatingElement.setChannel(0);
  await potHeatingElement.open();
  potControlSystem.potHeatingElement = potHeatingElement;
  console.log('pot heating element attached');

  let potHeatingElementHighVoltage = new phidget22.DigitalOutput();
  potHeatingElementHighVoltage.setHubPort(2);
  potHeatingElementHighVoltage.setChannel(1);
  await potHeatingElementHighVoltage.open();
  potControlSystem.potHeatingElementHighVoltage = potHeatingElementHighVoltage;
  console.log('pot heating element attached');
  
  console.log(`Fractional still control system established`);
  return true;
}

// ***********************************************   Routes   ********************************************************

// ***********************************************   Pot Still Routes   **********************************************
router.route('/potsummary')
  .get((req,res) => {
    console.log('front end asked what is the pot status')
    console.log(`server status is ${serverPotOverview}`);
    res.json({
      serverPotOverview:serverPotOverview
    });
  })

router.route('/potgraphdata')
  .get((req,res) => {
    console.log('front end asked for graph data')
    res.json({
      potGraphData:potGraphData
    });
  })

router.route('/getpotcolumntemperature')
  .get((req,res) => {
    let confirmationMessage = potControlSystem.columnTemperature.getTemperature();
    console.log(`turning on heat`);
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
    console.log(`turning on pot heat`);
    potControlSystem.potHeatingElement.setState(true);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/pothighvoltageheaton')
  .get((req,res) => {
    let confirmationMessage = `pot heat on`;
    console.log(`turning on pot heat`);
    potControlSystem.potHeatingElementHighVoltage.setState(true);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/potheatoff')
  .get((req,res) => {
    let confirmationMessage = `pot heat off`;
    console.log(`turning off pot heat`);
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
    console.log(potStillInitiatingValues);
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
    console.log(fractionalStillInitiatingValues);
    if (parseFloat(fractionalStillInitiatingValues.startAlcohol) >1) {
      serverRunOverview.startAlcohol=parseFloat(fractionalStillInitiatingValues.startAlcohol/100);
    } else {
      serverRunOverview.startAlcohol=parseFloat(fractionalStillInitiatingValues.startAlcohol);
    }
    serverRunOverview.startVolume=parseFloat(fractionalStillInitiatingValues.startVolume);
    fractionalGraphData=[];
    console.log(serverRunOverview);
    fractionalStill.startFractionalRun(fractionalGraphData,serverRunOverview,fractionalControlSystem);
    res.json({
      message:'started simple program'
    });
  })

router.route('/fractionalstatus')
  .get((req,res) => {
    console.log('front end asked what is the pot status')
    console.log(`server status is ${serverRunOverview.running}`);
    res.json({
      serverFractionalStatus:serverRunOverview.running
    });
  })

router.route('/fractionalgraphdata')
  .get((req,res) => {
    console.log('front end asked for graph data')
    res.json({
      fractionalGraphData:fractionalGraphData
    });
  })

router.route('/fractionalsummary')
  .get((req,res) => {
    console.log('front end asked for fractional summary')
    res.json({
      serverRunOverview:serverRunOverview
    });
  })

router.route('/extendarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'extendArm');
    console.log(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/retractarm')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'retractArm');
    console.log(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })
router.route('/turnonheat')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'heatOn');
    console.log(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/turnoffheat')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'heatOff');
    console.log(`turning off heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/fracchecktemp')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'checkTemp');
    console.log(`returned temperature`);
    res.json({
      message:confirmationMessage
    });
  })
router.route('/openvalve')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'openValve');
    console.log(`turning on heat`);
    res.json({
      message:confirmationMessage
    });
  })

router.route('/closevalve')
  .get((req,res) => {
    let confirmationMessage = fractionalStillSingleInteraction.handleIndividualFractionalInteraction(fractionalControlSystem, 'closeValve');
    console.log(`turning on heat`);
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
    console.log(`user from ${userIP} just pinged the server`);
    res.status(404);
  })
// ***********************************************   Start API server   ****************************************
app.listen(PORT, function() {
  console.log(`🌎  ==> API Server now listening on PORT ${PORT}!`);
});


