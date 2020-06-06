const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const router = express.Router();
// const fractionalStill = require('./unitOperations/fractionalStill');
const fractionalStill = require('./secondTry');
// import { startFractionalRun } from './secondTry';

// pot still variables
let serverPotStatus = false;
let serverGraphData = [];

// fractional still variables
let serverFractionalStatus = false;
let fractionalGraphData = [];
let serverRunOverview = {
  currentBeaker:'',
  currentClickCountInBeaker:'',
  totalClickCountInBeaker:'',
  timeToCompleteBeaker:'',
  timeToCompleteRun: '',
  startAlcohol: 0,
  startVolume: 0,
  currentMessage:'not running'
}




const PORT = 3001;
const app = express();

app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(router);

//     ----------
//     | ROUTES |
//     ----------

// POT STILL
router.route('/setpot')
  .post((req,res) => {
    serverPotStatus = req.body.desiredPotState
    flashingLights.runDemo();
    res.json({
      serverPotStatus:serverPotStatus
    });
  })

router.route('/potstatus')
  .get((req,res) => {
    console.log('front end asked what is the pot status')
    console.log(`server status is ${serverPotStatus}`);
    res.json({
      serverPotStatus:serverPotStatus
    });
  })

router.route('/potgraphdata')
  .get((req,res) => {
    console.log('front end asked for graph data')
    res.json({
      serverGraphData:serverGraphData
    });
  })

// FRACTIONAL STILL
router.route('/setfractional')
  .post((req,res) => {
    serverRunOverview.startAlcohol=parseInt(req.body.startAlcohol);
    serverRunOverview.startVolume=parseInt(req.body.startVolume);
    serverFractionalStatus=req.body.desiredFractionalState;
    fractionalGraphData=[];
    console.log('starting frac');
    fractionalStill.startFractionalRun(fractionalGraphData, serverFractionalStatus, serverRunOverview);
    res.json({
      serverFractionalStatus:serverFractionalStatus
    })
  })

router.route('/fractionalstatus')
  .get((req,res) => {
    console.log('front end asked what is the pot status')
    console.log(`server status is ${serverFractionalStatus}`);
    res.json({
      serverFractionalStatus:serverFractionalStatus
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



// Start the API server
app.listen(PORT, function() {
  console.log(`🌎  ==> API Server now listening on PORT ${PORT}!`);
});


