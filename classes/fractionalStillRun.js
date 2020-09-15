'use strict';
const { v4: uuidv4 } = require('uuid');

class FractionalStillRun {
  _logger;
  _db;
  _still;
  _input;
  _preHeatTime;
  _runArray;
  _batchID;
  _startTime;
  _currentBeaker = '';
  _currentClickCountInBeaker = '';
  _totalClickCountInBeaker = '';
  _timeToCompleteBeaker = '';
  _timeToCompleteRun = '';
  _timePreHeatComplete = '';
  _startAlcohol = 0;
  _startVolume = 0;
  _running = false;
  _currentTemperature = 0;
  _message = 'new Fractional Still Run created';

  constructor(options) {
    this._logger = options.logger;
    this._db = options.db;
    this._still = options.still;
    this._input = options.input;
    this._batchID = uuidv4();
    this.startRun();
  }

  getRunStatus() {
    return {
      running: this._running,
      currentTemperature: this._currentTemperature
    }
  }

  get timeStarted() {
    return this._timeStarted;
  }

  get message() {
    return this._message;
  }

  get running() {
    return this._running;
  }

  get _currentTemperature() {
    return this._currentTemperature;
  }

  _setMessage(message) {
    this._logger.info(message);
    this._message = message;
  }

  _logTemperature() {
    const fractionalTemp = this._still.temperature;
    const now = Date.now();
    this._currentTemperature = fractionalTemp;
    let timePointData = {
        batchID:this._batchID,
        epochtime:now,
        temperature:fractionalTemp,
        elapsedtime:((now - this._startTime)/(1000*60)),
        messageID:''
    };
    this._db.writeStillTimepoint(timePointData, 'fractional');
  }

  _endFractionalRun() {
    this._still.turnHeatOff();
    this._message = `Heating element is turned off.  Waiting five minutes to drain still`;
    this._still.openSolenoid();
    this._logger.info(`Heating element off, solenoid open`)
    setTimeout(() => {
      const now = (new Date()).toLocaleString();
      this._still.closeSolenoid();
      this._logger.info(`Completed at ${now}. Solenoid is now closed`)
      this._message = `Run completed at ${now}`;
      this._db.finishRun({
        result: {
          endTime: Date.now(),
          timePreHeatComplete: this._timePreHeatComplete,
          message: this._message
        }
      }, 'factional');
    }, 5*60*1000);
  }

  _sleep(seconds) {
    const date = Date.now();
    let currentDate = null;
    do {
      currentDate = Date.now();
    } while (currentDate - date < seconds*1000);
  }

  _controlHeat(temp, time) {
    this._setMessage(`Heating to ${temp} and holding for ${time}`);
    if (this._still.temperature < (temp - 1) && !this._still.heatStatus) {
      this._still.turnHeatOn();
    }
    while (true) {
      const currentTemp = this._still.temperature;
      if (currentTemp > (temp - 1)) {
        this._setMessage(`Temp, ${currentTemp}, within 1 degree of target ${temp}`);
        break;
      }
      this._sleep(5);
    }

    this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    const endTime = Date.now() + time*60*1000;
    while (Date.now() < endTime) {
      const currentTemp = this._still.temperature;
      this._setMessage(`Temperature check ${currentTemp}`);
      if (currentTemp > (temp + 1) && this._still.heatStatus) {
        this._setMessage(`Turning off heat`);
        this._still.turnHeatOff();
      } else if (currentTemp < (temp - 1) && !this._still.heatStatus) {
        this._setMessage(`Turning on heat`);
        this._still.turnHeatOn();
      }
      this._sleep(5);
    }
  }

  _collectHeads() {
    this._setMessage('Begin collecting heads');
    this._still.openSolenoid();
    this._controlHeat(this._input.headsTemp, this._input.headsTime);
    this._still.closeSolenoid();
  }

  _collectHearts() {
    this._setMessage('Begin collecting hearts');
    this._still.moveArmForHearts();
    this._still.openSolenoid();
    this._controlHeat(this._input.heartsTemp, this._input.heartsTime);
    this._still.closeSolenoid();
  }

  _collectTails() {
    this._setMessage('Begin collecting tails');
    this._still.moveArmForTails();
    this._still.openSolenoid();
    this._controlHeat(98, 0);
    this._still.closeSolenoid();
  }

  startRun() {
    this._still.busy = true;
    this._still.run = this;
    this._startTime = Date.now();
    this._logger.info('Starting run with input: ' + JSON.stringify(this._input));
    const preHeatTimeLimit = (this._input.preHeatTime * 60 * 60 * 1000) + this._startTime;

    this._running=true;

    const runData = {
      batchID: this._batchID,
      startTime: this._startTime,
      input: this._input
    };
    this._db.createRun(runData, 'fractional');

    this._logger.info('Fractional run started: ' + (new Date(this._startTime)).toLocaleString());
    this._logger.info('Fractional still preheat limit: ' + (new Date(preHeatTimeLimit)).toLocaleString());

    // Retract arm
    this._logger.info('Retracting arm for 30 seconds');
    this._still.resetArm();

    // Turn on temperature logging
    this._logger.info('Initiating Temperature logging');
    const startingTemperature = this._still.temperature;
    this._logger.info(`Starting Temperature is ${startingTemperature}`)
    // const temperatureLogInterval = setInterval(() => {this._logTemperature()}, 60*1000);
    const temperatureLogInterval = setInterval(this._logTemperature.bind(this), 60*1000);

    // Turn on heating element
    this._still.turnHeatOn();
    this._logger.info('Heating element turned on');
    this._setMessage('Pre-heating System');

    // Monitor temperature until target pre-heat temperature is hit
    this._logger.info(`pre-heating system until temperature reaches ${this._input.preHeatEndTemperature}`);
    const preheatCheck = setInterval( () => {
      const currentTemperature = this._still.temperature;
      if (currentTemperature > this._input.preHeatEndTemperature) {
        this._timePreHeatComplete = Date.now();
        clearInterval(preheatCheck);

        // This starts the core fractional program.  Passes in first beaker's paramaters
        // runEnclosingArrayCycle(overallRunArray[0]);
        this._collectHeads();
        this._collectHearts();
        this._collectTails();
        this._endFractionalRun();
        clearInterval(temperatureLogInterval);
      } else if (Date.now() > preHeatTimeLimit) {
        // Took to long to preheat, shut it down
        this._setMessage('Took to long to preheat, shutting down');
        this._email.sendMail('wittjr@gmail.com', 'Fractional still error', serverRunOverview.message);
        clearInterval(preheatCheck);
        this._still.run = undefined;
        this._still.busy = false;
        this._endFractionalRun();
        clearInterval(temperatureLogInterval);
      }
    }, 1*60*1000);
  }

  startFractionalRun(fractionalGraphData, serverRunOverview, fractionalControlSystem) {
      // physical parameters and relay mapping
      // const collectionCoefficient = 1.75;
      // const lastFractionForHeads = 5;
      // const lastFractionForHearts = 16;
      // const preHeatEndTemperature = 45;
      const batchID = uuidv4();

      const startTime = Date.now();
      let fractionalGraphDataLocal = fractionalGraphData;
      let serverRunOverviewLocal = serverRunOverview;
      let fractionalControlSystemLocal = fractionalControlSystem;
      let overallRunArray = [];
      let positionInOverallArray=0;
      const logger = this.logger;
      const db = this.db;
      const email = this.email;

      const collectionCoefficient = serverRunOverviewLocal.collectionCoefficient;
      const lastFractionForHeads = serverRunOverviewLocal.lastFractionForHeads;
      const lastFractionForHearts = serverRunOverviewLocal.lastFractionForHearts;
      const preHeatEndTemperature = serverRunOverviewLocal.preHeatEndTemperature;
      const preHeatTime = serverRunOverviewLocal.preHeatTime;
      const preHeatTimeLimit = (preHeatTime * 60 * 60 * 1000) + startTime;
      this.logger.debug('Fractional run started: ' + (new Date(startTime)).toLocaleString());
      this.logger.debug('Fractional still preheat limit: ' + (new Date(preHeatTimeLimit)).toLocaleString());

      const runData = {
        batchID: batchID,
        startTime: startTime,
        input: serverRunOverviewLocal
      };
      this.db.createRun(runData, 'fractional');

      const moveArmForTime = (moveTimeInMilliseconds, direction) => {
          if (direction == 'extend') {
              fractionalControlSystemLocal.retractArm.setState(false).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              fractionalControlSystemLocal.extendArm.setState(true).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              setTimeout( () => {
                  fractionalControlSystemLocal.extendArm.setState(false).catch(function (err) {
    			          logger.error('setState failed: ' +  JSON.stringify(err));
    		          });
              }, moveTimeInMilliseconds);
          } else {
              fractionalControlSystemLocal.extendArm.setState(false).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              fractionalControlSystemLocal.retractArm.setState(true).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              setTimeout( () => {
                  fractionalControlSystemLocal.retractArm.setState(false).catch(function (err) {
    			          logger.error('setState failed: ' +  JSON.stringify(err));
    		          });
              }, moveTimeInMilliseconds);
          }
      };

      function buildOverallRunArray(serverRunOverviewLocal) {
          logger.info(`Line 55: Starting alcohol is ${serverRunOverviewLocal.startAlcohol} and volume ${serverRunOverviewLocal.startVolume}`);
          let volumeEthanol = serverRunOverviewLocal.startAlcohol * serverRunOverviewLocal.startVolume;
          let volumeMethanol = volumeEthanol * serverRunOverviewLocal.methanolPercent; //default 0.03
          let volumeHeads = volumeEthanol * serverRunOverviewLocal.volumeHeadsPercent; // default 0.05
          let volumeTails = volumeEthanol * serverRunOverviewLocal.volumeTailsPercent; //defaul 0.05
          let volumeHearts = volumeEthanol - (volumeMethanol + volumeTails + volumeHeads);
          let beakerArray = [];

          // build target volumes for each beaker
          for (let i = 0; i<21; i++) {
              let beakerInformation = {
                  targetVolume:0,
                  cycleCount:0,
                  closeTime:0
              };
              if (i==0) {
                  // methanol
                  beakerInformation.targetVolume = volumeMethanol;
              }
              if (i>0 && i<4) {
                  // heads
                  beakerInformation.targetVolume = volumeHeads * collectionCoefficient / 3;
              }
              if (i>=4 && i<=17) {
                  // hearts
                  beakerInformation.targetVolume = volumeHearts * collectionCoefficient / 14;
              }
              if (i>17) {
                  // tails
                  beakerInformation.targetVolume = volumeTails * collectionCoefficient / 3;
                  beakerInformation.overallFraction = 'Tails';
              }
              beakerInformation.beakerID=i;
              beakerArray[i]= beakerInformation;
          }

          for (let i = 0; i<21; i++) {
              let clickCount = Math.floor(beakerArray[i].targetVolume / 3.32);
              beakerArray[i].cycleCount = clickCount;
              if (i<=4) {
                  beakerArray[i].closeTime = 3000
              } else if (i<=10) {
                  beakerArray[i].closeTime = 4000
              } else if (i<=15) {
                  beakerArray[i].closeTime = 6000
              } else {
                  beakerArray[i].closeTime = 8000
              }
          }

          for (let i = 0; i<21; i++) {
              let clickCount = Math.floor(beakerArray[i].targetVolume / 3.32);
              beakerArray[i].cycleCount = clickCount;
              if (i<=lastFractionForHeads) {
                  beakerArray[i].overallFraction = 'Heads';
              } else if (i<=lastFractionForHearts) {
                  beakerArray[i].overallFraction = 'Hearts';
              } else {
                  beakerArray[i].overallFraction = 'Tails';
              }
          }

          // move arm after beakers
          beakerArray[lastFractionForHeads].nextFunction = () => { moveArmForTime(9000, 'extend') };
          beakerArray[lastFractionForHearts].nextFunction = () => { moveArmForTime(11000, 'extend') };
          logger.info('internal beaker array - line 111:');
          logger.info(JSON.stringify(beakerArray));
          for (let i=0; i<21; i++) {
              overallRunArray.push(beakerArray[i]);
          };
          logger.info(`Line 116 overall array:`);
          logger.info(JSON.stringify(overallRunArray));
          serverRunOverviewLocal.calculatedBeakerArray = overallRunArray;
      };

      const convertAlcoholToDecimal = () => {
          serverRunOverviewLocal.startAlcohol = parseFloat(serverRunOverviewLocal.startAlcohol);
          if (serverRunOverviewLocal.startAlcohol > 1) {
              serverRunOverviewLocal.startAlcohol = serverRunOverviewLocal.startAlcohol / 100;
          } else if (serverRunOverviewLocal.startAlcohol <= 0) {
              return false;
          }
          return true;
      };

      const convertVolumeToDecimal = () => {
          serverRunOverviewLocal.startVolume = parseFloat(serverRunOverviewLocal.startVolume)*1000;
          if (serverRunOverviewLocal.startVolume <= 0) {
              return false;
          }
          return true;
      };

      const buildDataForRun = () => {
          if (convertAlcoholToDecimal(serverRunOverviewLocal) && convertVolumeToDecimal(serverRunOverviewLocal)) {
              // build overall run array
              buildOverallRunArray(serverRunOverviewLocal, logger);
          } else {
              logger.info(`bad volume or alcohol value was received. alcohol: ${serverRunOverviewLocal.startAlcohol}, volume: ${serverRunOverviewLocal.startVolume}`);
              serverRunOverviewLocal.message = `bad volume or alcohol value was received. alcohol: ${serverRunOverviewLocal.startAlcohol}, volume: ${serverRunOverviewLocal.startVolume}`;
          }
      };

      function logTemperature() {
          let fractionalTemp = 0;
          try {
            fractionalTemp = fractionalControlSystemLocal.tempProbe.getTemperature();
          } catch (err) {logger.error('setState failed: ' +  JSON.stringify(err));}
          let dataPoint = {}
          const now = Date.now();
          dataPoint.y = fractionalTemp;
          dataPoint.x = (now - startTime)/(1000*60);
          dataPoint.id = now;
          fractionalGraphDataLocal.push(dataPoint);
          serverRunOverviewLocal.currentTemperature = fractionalTemp;
          let timePointData = {
              batchID:batchID,
              epochtime:now,
              temperature:fractionalTemp,
              elapsedtime:dataPoint.x,
              messageID:''
          };
          db.writeStillTimepoint(timePointData, 'fractional');
          // awsDatabaseOperations.writeStillTimepoint(timePointData,'fractional');
      }

      function updateExpectedTotalRunTime() {
          let totalTime = 0;
          for (let i= 0; i<overallRunArray.length; i++) {
              let beakerTime = (overallRunArray[i].closeTime + 0.5) * overallRunArray[i].cycleCount;
              totalTime = totalTime + beakerTime;
          }
          serverRunOverviewLocal.timeToCompleteRun = totalTime;
      };

      function updateBeakerEndTimes() {
        const now = Date.now();
        let timePreviousStepCompleted = now;
        if ( serverRunOverviewLocal.timePreHeatComplete == '') {
            timePreviousStepCompleted = now + 2.5 * 60 * 60 * 1000 + 10 * 60 * 1000;  // estimate 2.5h to preheat + 10 minutes to reflux
        } else {
            timePreviousStepCompleted = serverRunOverviewLocal.timePreHeatComplete;
        }
        for (let i=0; i<overallRunArray.length; i++) {
            let expectedBeakerEndTime = timePreviousStepCompleted + (overallRunArray[i].closeTime + 0.5) * overallRunArray[i].cycleCount;
            overallRunArray[i].expectedBeakerEndTime = expectedBeakerEndTime;
            timePreviousStepCompleted = expectedBeakerEndTime;
        }
        logger.info(JSON.stringify(overallRunArray));
      }

      function endFractionalRun() {
          function closeSoleniod() {
            const now = (new Date()).toLocaleString();
            fractionalControlSystemLocal.solenoid.setState(false).catch(function (err) {
              logger.error('setState failed: ' +  JSON.stringify(err));
            });
            logger.info(`Completed at ${now}. Solenoid is now closed`)
            serverRunOverviewLocal.message = `Run completed at ${now}`;
            clearInterval(temperatureLogInterval);
          }

          fractionalControlSystemLocal.heatingElement.setState(false).catch(function (err) {
            logger.error('setState failed: ' +  JSON.stringify(err));
          });
          serverRunOverviewLocal.message = `Heating element is turned off.  Waiting five minutes to drain still`;
          fractionalControlSystemLocal.solenoid.setState(true).catch(function (err) {
            logger.error('setState failed: ' +  JSON.stringify(err));
          });
          logger.info(`Heating element off, solenoid open`)
          setTimeout(() => {
              closeSoleniod();
          }, 5*60*1000);
          db.finishRun({
            result: {
              endTime: Date.now(),
              timePreHeatComplete: serverRunOverviewLocal.timePreHeatComplete,
              message: serverRunOverviewLocal.message
            }
          }, 'factional');

      }

      // This is the core logic.  It opens the solenoid valve for 0.5 seconds and closes for the time designated by each element of the array
      // After reaching the end of the array, heat is discontinued, we empty the still by opening the solenid for five minutes
      function runEnclosingArrayCycle(fractionInformation) {
          // recursive function.  Terminates when end of array is met
          let fractionCounter = 0;

          function runOneCycle() {
              fractionalControlSystemLocal.solenoid.setState(true).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              setTimeout(endOpenValve, 500);
          };

          function endOpenValve() {
              fractionalControlSystemLocal.solenoid.setState(false).catch(function (err) {
			          logger.error('setState failed: ' +  JSON.stringify(err));
		          });
              setTimeout(waitUntilNextCycle, fractionInformation.closeTime);
          };



          function waitUntilNextCycle() {
              fractionCounter++;
              serverRunOverviewLocal.currentClickCountInBeaker=fractionCounter;

              // Breakpoint for cycles within one beaker
              if (fractionCounter < fractionInformation.cycleCount) {
                  runOneCycle();
              } else {
                  // move to next beaker in overall array
                  positionInOverallArray++;
                  logger.info(`moving to next beaker ${positionInOverallArray}`);
                  // updateBeakerEndTimes();
                  // if the current beaker has a next function, run it.  Currently used to move actuator arm
                  if (fractionInformation.nextFunction) {
                      // run end of fraction function; currently only used to move actuator arm
                      fractionInformation.nextFunction();
                      logger.info(`moved actuator arm`);
                  }
                  // if there's another beaker in array, run its cycle
                  if (positionInOverallArray<overallRunArray.length) {
                      serverRunOverviewLocal.currentBeaker = positionInOverallArray;
                      serverRunOverviewLocal.totalClickCountInBeaker = overallRunArray[positionInOverallArray].cycleCount;
                      serverRunOverviewLocal.message = overallRunArray[positionInOverallArray].overallFraction;
                      serverRunOverviewLocal.timeToCompleteBeaker = overallRunArray[positionInOverallArray].cycleCount * (0.5 + overallRunArray[positionInOverallArray].closeTime) / 1000;
                      // move to next line in overall array
                      runEnclosingArrayCycle(overallRunArray[positionInOverallArray]);
                  } else {
                      // end the run
                      logger.info(`Last beaker reached, moving to run termination`);
                      serverRunOverview.message = `Last beaker completed, emptying the still`;
                      endFractionalRun();
                      serverRunOverviewLocal.running = false;
                  }
              }
          };
          serverRunOverview.timeCurrentBeakerStarted = Date.now();
          runOneCycle(); // one cycle opens solenoid for 500 ms; closes for beaker's close time
      }


      // **********************************  Main program ********************************** //

      // Tell server that the program is running and set key timepoints
      serverRunOverviewLocal.running=true;
      serverRunOverviewLocal.timeStarted = startTime;
      serverRunOverviewLocal.timePreHeatComplete = '';

      // Retract arm
      this.logger.info(`Retracting arm for 30 seconds`);
      serverRunOverviewLocal.running = true;
      moveArmForTime(30000,'retract');
      serverRunOverviewLocal.message = `Retracting arm`;

      // Build array of beakers for recursive section to iterate through
      buildDataForRun(serverRunOverviewLocal);
      this.logger.info(`Built the following beaker array:`);
      this.logger.info(JSON.stringify(overallRunArray));

      // Update server with estimated time to complete
      updateExpectedTotalRunTime();
      updateBeakerEndTimes();

      // Turn on temperature logging
      this.logger.info(`Initiating Temperature logging`);
      let startingTemperature = 0;
      try {
        startingTemperature = fractionalControlSystemLocal.tempProbe.getTemperature();
      } catch (err) {logger.error('setState failed: ' +  JSON.stringify(err));}
      this.logger.info(`Starting Temperature is ${startingTemperature}`)
      let temperatureLogInterval = setInterval(logTemperature, 60*1000);

      // Turn on heating element
      fractionalControlSystemLocal.heatingElement.setState(true).catch(function (err) {
        logger.error('setState failed: ' +  JSON.stringify(err));
      });
      this.logger.info(`Heating element turned on`);
      serverRunOverviewLocal.message = `Pre-heating System`;

      // Monitor temperature until target pre-heat temperature is hit
      this.logger.info(`pre-heating system until temperature reaches ${preHeatEndTemperature}`);
      let preheatCheck = setInterval( () => {
          let currentTemperature = 0;
          try {
            currentTemperature = fractionalControlSystemLocal.tempProbe.getTemperature();
          } catch (err) {logger.error('setState failed: ' +  JSON.stringify(err));}
          if (currentTemperature > preHeatEndTemperature) {
              // Wait ten minutes, stop monitoring temperature for pre-heat
              serverRunOverviewLocal.message = 'Ten minute wait before processing';
              this.logger.info(serverRunOverviewLocal.message);
              serverRunOverviewLocal.timePreHeatComplete = Date.now();
              clearInterval(preheatCheck);

              // After ten minute wait, recurse through beaker array, cycling solenoid
              setTimeout(() => {
                  updateBeakerEndTimes();
                  serverRunOverviewLocal.currentBeaker = 0;
                  serverRunOverviewLocal.totalClickCountInBeaker = overallRunArray[0].cycleCount;
                  serverRunOverviewLocal.message = overallRunArray[0].overallFraction;

                  // This starts the core fractional program.  Passes in first beaker's paramaters
                  runEnclosingArrayCycle(overallRunArray[0]);
              }, 10*60*1000);
          } else if (Date.now() > preHeatTimeLimit) {
            // Took to long to preheat, shut it down
            serverRunOverviewLocal.message = 'Took to long to preheat, shutting down';
            this.logger.info(serverRunOverviewLocal.message);
            this.email.sendMail('wittjr@gmail.com', 'Fractional still error', serverRunOverviewLocal.message);
            clearInterval(preheatCheck);
            endFractionalRun();
          }
      }, 1*60*1000);

  };
}

module.exports = FractionalStillRun;
