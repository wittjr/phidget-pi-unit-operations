'use strict';

const { v4: uuidv4 } = require('uuid');

class FractionalStill {
  _busy = false;
  _run = undefined;
  _temperature = undefined;
  _db;
  _logger;
  _email;

  constructor(options) {
    this._logger = options.logger;
    this._db = options.db;
    this._email = options.email;
  }

  setStillComponents(options) {
    this._heatingElement = options.heatingElement;
    this._solenoid = options.solenoid;
    this._tempProbe = options.tempProbe;
    this._extendArm = options.extendArm;
    this._retractArm = options.retractArm;
  }

  get busy() {
    return this._busy;
  }

  set busy(value) {
    this._busy = value;
  }

  get run() {
    return this._run;
  }

  set run(value) {
    this._run = value;
  }

  get temperature() {
    this._temperature = this._tempProbe.getTemperature();
    return this._temperature;
  }

  get heatStatus() {
    return this._heatingElement.getState();
  }

  get solenoidStatus() {
    return this._solenoid.getState();
  }

  async _changePhidgetState(phidget, value) {
    await phidget.setState(value);
  }

  async openSolenoid() {
    logger.debug('Attempting to open solenoid');
    await this._changePhidgetState(this._solenoid, true);
  }

  async closeSolenoid() {
    logger.debug('Attempting to close solenoid');
    await this._changePhidgetState(this._solenoid, false);
  }

  async turnHeatOn() {
    logger.debug('Attempting to turn heat on');
    await this._changePhidgetState(this._heatingElement, true);
  }

  async turnHeatOff() {
    logger.debug('Attempting to turn heat off');
    await this._changePhidgetState(this._heatingElement, false);
  }

  async resetArm() {
    logger.debug('Attempting to reset arm');
    await this._moveArmForTime(25000, 'retract');
  }

  async moveArmForHearts() {
    logger.debug('Attempting to set arm for hearts');
    await this._moveArmForTime(11000, 'extend');
  }

  async moveArmForTails() {
    logger.debug('Attempting to set arm for tails');
    await this._moveArmForTime(10000, 'extend');
  }

  async _moveArmForTime(moveTimeInMilliseconds, direction) {
    this._logger.debug('Still requested to ' + direction + ' arm for ' + moveTimeInMilliseconds/1000 + ' seconds');
    if (direction == 'extend') {
      await this._changePhidgetState(this._retractArm, false);
      await this._changePhidgetState(this._extendArm, true);
      await new Promise((resolve, reject) => {
        setTimeout( () => {
          this._changePhidgetState(this._extendArm, false).then(() => {
            resolve();
            return;
          });
        }, moveTimeInMilliseconds);
      });
    } else {
      await this._changePhidgetState(this._extendArm, false);
      await this._changePhidgetState(this._retractArm, true);
      await new Promise((resolve, reject) => {
        setTimeout( () => {
          this._changePhidgetState(this._retractArm, false).then(() => {
            resolve();
            return;
          });
        }, moveTimeInMilliseconds);
      });
    }
  };

  //Previous volume based run
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
      const logger = this._logger;
      this.logger = logger;
      const db = this._db;
      this.db = db;
      const email = this._email;
      this.email = email;

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
          logger.debug('fractionalStill.logTemperature: ' + fractionalTemp);
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
              logger.debug('fractionalStill.runEnclosingArrayCycle: opened solenoid');
              setTimeout(endOpenValve, 500);
          };

          function endOpenValve() {
              fractionalControlSystemLocal.solenoid.setState(false).catch(function (err) {
                logger.error('setState failed: ' +  JSON.stringify(err));
              });
              logger.debug('fractionalStill.runEnclosingArrayCycle: closed solenoid');
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
              }, 1000);
          } else if (Date.now() > preHeatTimeLimit) {
            // Took to long to preheat, shut it down
            serverRunOverviewLocal.message = 'Took to long to preheat, shutting down';
            this.logger.info(serverRunOverviewLocal.message);
            this.email.sendMail(serverRunOverviewLocal.notifyEmail, 'Fractional still error', serverRunOverviewLocal.message);
            clearInterval(preheatCheck);
            endFractionalRun();
          }
      }, 1*60*1000);

  };
}

module.exports = FractionalStill;
