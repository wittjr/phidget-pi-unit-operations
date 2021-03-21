'use strict';
const { v4: uuidv4 } = require('uuid');

class FractionalStillRun {
  _logger;
  _db;
  _still;
  _input;
  _email;
  _emailNotify;
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
  _type = 'temp';
  _temperatureLogInterval;
  _totalTimeLimit;
  _monitorTempInterval;
  _bringToTempInterval;
  _armPosition = 0;
  _runTimeLimit;  // in hours
  _stillDrainTime;  // in minutes

  constructor(options) {
    this._logger = options.logger;
    this._db = options.db;
    this._still = options.still;
    this._input = options.input;
    this._email = options.email;
    this._emailNotify = options.notify;
    this._batchID = uuidv4();
    this._stillDrainTime = options.input.stillDrainTime; // in minutes
    this._runTimeLimit = options.input.runTimeLimit; // in hours
    this.startRun();
  }

  getRunStatus() {
    return {
      running: this._running,
      currentTemperature: this._currentTemperature,
      message: this._message,
      type: this._type
    }
  }

  get id() {
    return this._batchID;
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

  _clearAllIntervals() {
    clearTimeout(this._totalTimeLimit);
    // clearInterval(this._temperatureLogInterval);
    clearInterval(this._monitorTempInterval);
    clearInterval(this._bringToTempInterval);
  }

  _endFractionalRun() {
    this._clearAllIntervals();
    this._still.turnHeatOff();
    if (this._armPosition == 1) {
      // We must have failed in hearts, move to tails for drain
      this._still.closeSolenoid();
      this._still.moveArmForTails();
    }
    this._still.openSolenoid();
    this._setMessage(`Heating element off, solenoid open. Waiting ${this._stillDrainTime} minutes to drain still`);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const now = (new Date()).toLocaleString();
        this._still.closeSolenoid().then(() => {
          this._still.resetArm().then(() => {
            this._setMessage(`Run completed at ${now}.`)
            this._db.finishRun({
              batchID: this._batchID,
              endTime: Date.now(),
              result: {
                timePreHeatComplete: this._timePreHeatComplete,
                message: this._message
              }
            }, 'factional');
            this._running = false;
            this._still.busy = false;
            clearInterval(this._temperatureLogInterval);
            resolve();
            return;
          });
        });
      }, this._stillDrainTime*60*1000);
    });
  }

  _heatToTemp(temp, timeLimit) {
    const heatStartTime = Date.now();
    if (timeLimit) {
      this._logger.info(`Heating to ${temp} by ${timeLimit} minutes`);
    } else {
      this._logger.info(`Heating to ${temp}`);
    }
    if (this._still.temperature < temp && !this._still.heatStatus) {
      this._still.turnHeatOn();
    }

    return new Promise((resolve, reject) => {

      let interval = 5*1000;
      let lastTemp = 0;
      let avgDegreesPerSecond = 0;
      const intervalFunction = () => {
        const currentTemp = this._still.temperature;
        clearInterval(this._bringToTempInterval);
        if (currentTemp >= temp) {
          this._setMessage(`Target temperature, ${temp}, reached ${currentTemp}`);
          resolve();
          return;
        } else if (timeLimit && Date.now() > (heatStartTime + (timeLimit*60*1000))) {
          this._setMessage('Took to long to heat');
          this._email.sendMail(this._emailNotify, 'Fractional still error', this.message);
          reject(new Error('_heatToTemp time limit expired'));
          return;
        } else {
          // Calculate new interval
          if (lastTemp > 0) {
            let tempChange = currentTemp - lastTemp;
            avgDegreesPerSecond = tempChange/(interval/1000);
            let tempLeft = temp - currentTemp;
            interval = (Math.floor(tempLeft/avgDegreesPerSecond))/5;
            // interval = (interval < 1) ? interval = 1000 : Math.floor(interval) * 1000;
            interval = Math.floor(Math.min(Math.max(interval,1), 60)) * 1000;
            this._logger.debug('New temp check interval: ' + interval/1000 + ' seconds');
          }
          lastTemp = currentTemp;
          this._bringToTempInterval = setInterval(intervalFunction, interval);
        }

      }
      this._bringToTempInterval = setInterval(intervalFunction, interval);
    });
  }

  _monitorTemp(temp, endTime) {
    return new Promise((resolve, reject) => {
      let interval = 1000;
      let lastTemp = 0;
      let avgDegreesPerSecond = 0;
      const tempTolerance = 1.0;

      const intervalFunction = () => {
        const currentTemp = this._still.temperature;
        this._setMessage(`Temperature check ${currentTemp}`);
        clearInterval(this._monitorTempInterval);
        let tempStateChanged = false;
        let targetTemp = temp + tempTolerance;

        if (currentTemp >= (temp + 1) && this._still.heatStatus) {
          this._setMessage(`Turning off heat`);
          tempStateChanged = true;
          targetTemp = temp - tempTolerance;
          this._still.turnHeatOff();
        } else if (currentTemp <= (temp - tempTolerance) && !this._still.heatStatus) {
          this._setMessage(`Turning on heat`);
          targetTemp = temp + tempTolerance;
          tempStateChanged = true;
          this._still.turnHeatOn();
        }
        if (Date.now() >= endTime) {
          resolve('Reached _monitorTemp endTime ' + endTime);
          return;
        }
        // Calculate new interval
        if (tempStateChanged) {
          interval = 1000;
          this._logger.debug('New temp check interval due to heat change: ' + interval);
        } else if (lastTemp > 0) {
          let tempChange = currentTemp - lastTemp;
          avgDegreesPerSecond = tempChange/(interval/1000);
          let tempLeft = Math.abs(targetTemp - currentTemp);
          interval = (Math.floor(tempLeft/avgDegreesPerSecond))/5;
          interval = Math.floor(Math.min(Math.max(interval,1), 30)) * 1000;
          this._logger.debug('New temp check interval: ' + interval/1000 + ' seconds');
        }
        lastTemp = currentTemp;
        this._monitorTempInterval = setInterval(intervalFunction, interval);
      }
      this._monitorTempInterval = setInterval(intervalFunction, interval);
    });
  }

  async _controlHeat(temp, time) {
    this._setMessage(`Heating to ${temp} and holding for ${time} minutes`);
    await this._heatToTemp(temp);
    this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    const endTime = Date.now() + time*60*1000;
    await this._monitorTemp(temp, endTime);
    this._setMessage(`Temperature hold for ${time} minutes at ${temp} finished`);
  }

  async _collectHeads() {
    this._setMessage('Begin collecting heads');
    await this._still.openSolenoid();
    await this._controlHeat(this._input.headsTemp, this._input.headsTime);
    await this._still.closeSolenoid();
  }

  async _collectHearts() {
    this._setMessage('Begin collecting hearts');
    await this._still.moveArmForHearts();
    this._armPosition = 1;
    await this._still.openSolenoid();
    await this._controlHeat(this._input.heartsTemp, this._input.heartsTime);
    await this._still.closeSolenoid();
  }

  async _collectTails() {
    this._setMessage('Begin collecting tails');
    await this._still.moveArmForTails();
    this._armPosition = 2;
    await this._still.openSolenoid();
    await this._controlHeat(this._input.tailsTemp, this._input.tailsTime);
    await this._still.closeSolenoid();
  }

  async startRun() {
    try {
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
      this._logger.info('Retracting arm for start of run');
      await this._still.resetArm();
      this._armPosition = 0;
      this._logger.info('Finished retracting arm');

      // Turn on temperature logging
      this._logger.info('Initiating Temperature logging');
      const startingTemperature = this._still.temperature;
      this._logger.info(`Starting Temperature is ${startingTemperature}`)
      // const temperatureLogInterval = setInterval(() => {this._logTemperature()}, 60*1000);
      this._temperatureLogInterval = setInterval(this._logTemperature.bind(this), 60*1000);

      // Close the solenoid
      this._still.closeSolenoid();
      this._logger.info('Solenoid closed');

      // Turn on heating element
      this._still.turnHeatOn();
      this._logger.info('Heating element turned on');
      this._setMessage('Pre-heating System');

      // Monitor temperature until target pre-heat temperature is hit
      this._logger.info(`pre-heating system until temperature reaches ${this._input.preHeatEndTemperature}`);
      await this._heatToTemp(this._input.preHeatEndTemperature, this._input.preHeatTime * 60);
      this._timePreHeatComplete = Date.now();

      this._logger.info(`Will shutdown if run does not complete by ${new Date(Date.now()+this._runTimeLimit*60*60*1000).toLocaleString()}`)
      this._totalTimeLimit = setTimeout(() => {
        this._logger.info(`Hit ${this._runTimeLimit} hour limit`);
        this._endFractionalRun();
      }, this._runTimeLimit*60*60*1000);

      await this._collectHeads();
      await this._collectHearts();
      await this._collectTails();
      await this._endFractionalRun();
    } catch (e) {
      this._logger.error(e.message);
      await this._endFractionalRun();
    }
  }

  async endRun() {
    await this._endFractionalRun();
  }

  async endRunImmediate() {
    this._clearAllIntervals();
    this._still.turnHeatOff();
    if (this._armPosition == 1) {
      // We must have failed in hearts, move to tails for drain
      this._still.closeSolenoid();
      this._still.moveArmForTails();
    }
    this._still.openSolenoid();
    const now = (new Date()).toLocaleString();
    this._setMessage(`Run terminated at ${now}, solenoid left open.`)
    this._db.finishRun({
      batchID: this._batchID,
      endTime: Date.now(),
      result: {
        timePreHeatComplete: this._timePreHeatComplete,
        message: this._message
      }
    }, 'factional');
    this._running = false;
    this._still.busy = false;
  }
}

module.exports = FractionalStillRun;
