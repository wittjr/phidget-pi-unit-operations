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
}

module.exports = FractionalStillRun;
