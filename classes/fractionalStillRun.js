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

  constructor(options) {
    this._logger = options.logger;
    this._db = options.db;
    this._still = options.still;
    this._input = options.input;
    this._email = options.email;
    this._emailNotify = options.notify;
    this._batchID = uuidv4();
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

  _endFractionalRun() {
    this._still.turnHeatOff();
    this._still.openSolenoid();
    this._setMessage(`Heating element off, solenoid open. Waiting five minutes to drain still`);
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
            resolve();
            return;
          });
        });
      }, 5*60*1000);
    });
  }

  // _sleep(seconds) {
  //   const date = Date.now();
  //   let currentDate = null;
  //   do {
  //     currentDate = Date.now();
  //   } while (currentDate - date < seconds*1000);
  // }

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
        clearInterval(bringToTempInterval);
        if (currentTemp >= temp) {
          this._setMessage(`Target temperature, ${temp}, reached ${currentTemp}`);
          resolve();
        } else if (timeLimit && Date.now() > (heatStartTime + (timeLimit*60*1000))) {
          this._setMessage('Took to long to heat');
          this._email.sendMail(this._emailNotify, 'Fractional still error', this.message);
        } else {
          // Calculate new interval
          if (lastTemp > 0) {
            let tempChange = currentTemp - lastTemp;
            avgDegreesPerSecond = tempChange/(interval/1000);
            let tempLeft = temp - currentTemp;
            interval = (Math.floor(tempLeft/avgDegreesPerSecond))/5;
            interval = (interval < 1) ? interval = 1000 : Math.floor(interval) * 1000;
            this._logger.debug('New temp check interval: ' + interval);
          }
          lastTemp = currentTemp;
          bringToTempInterval = setInterval(intervalFunction, interval);
        }

      }
      let bringToTempInterval = setInterval(intervalFunction, interval);
    });
  }

  _monitorTemp(temp, endTime) {
    return new Promise((resolve, reject) => {
      let interval = 1000;
      let lastTemp = 0;
      let avgDegreesPerSecond = 0;
      const tempTolerance = 0.5;

      const intervalFunction = () => {
        const currentTemp = this._still.temperature;
        this._setMessage(`Temperature check ${currentTemp}`);
        clearInterval(monitorTempInterval);
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
          resolve();
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
          interval = (interval < 1) ? interval = 1000 : Math.floor(interval) * 1000;
          this._logger.debug('New temp check interval: ' + interval);
        }
        lastTemp = currentTemp;
        monitorTempInterval = setInterval(intervalFunction, interval);
      }

      // const monitorTempInterval = setInterval(() => {
      //   const currentTemp = this._still.temperature;
      //   this._setMessage(`Temperature check ${currentTemp}`);
      //   if (currentTemp > (temp + 1) && this._still.heatStatus) {
      //     this._setMessage(`Turning off heat`);
      //     this._still.turnHeatOff();
      //   } else if (currentTemp < (temp - 1) && !this._still.heatStatus) {
      //     this._setMessage(`Turning on heat`);
      //     this._still.turnHeatOn();
      //   }
      //   if (Date.now() >= endTime) {
      //     clearInterval(monitorTempInterval);
      //     resolve();
      //   }
      // }, 5*1000);

      let monitorTempInterval = setInterval(intervalFunction, interval);
    });
  }

  async _controlHeat(temp, time) {
    this._setMessage(`Heating to ${temp} and holding for ${time} minutes`);
    // if (this._still.temperature < (temp - 1) && !this._still.heatStatus) {
    //   this._still.turnHeatOn();
    // }
    // return this._heatToTemp(temp).then(() => {
    //   this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    //   const endTime = Date.now() + time*60*1000;
    //   return this._monitorTemp(temp).then(() => {
    //     this._setMessage(`Temperature hold for ${time} at ${temp} finished`);
    //   })
    // });
    await this._heatToTemp(temp);
    this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    const endTime = Date.now() + time*60*1000;
    await this._monitorTemp(temp, endTime);
    this._setMessage(`Temperature hold for ${time} minutes at ${temp} finished`);

    // const bringToTempInterval = setInterval(() => {
    //   const currentTemp = this._still.temperature;
    //   if (currentTemp > (temp - 1)) {
    //     this._setMessage(`Temp, ${currentTemp}, within 1 degree of target ${temp}`);
    //     clearInterval(bringToTempInterval);
    //     this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    //     const endTime = Date.now() + time*60*1000;
    //     const monitorTempInterval = setInterval(() => {
    //       const currentTemp = this._still.temperature;
    //       this._setMessage(`Temperature check ${currentTemp}`);
    //       if (currentTemp > (temp + 1) && this._still.heatStatus) {
    //         this._setMessage(`Turning off heat`);
    //         this._still.turnHeatOff();
    //       } else if (currentTemp < (temp - 1) && !this._still.heatStatus) {
    //         this._setMessage(`Turning on heat`);
    //         this._still.turnHeatOn();
    //       }
    //       if (Date.now() >= endTime) {
    //         clearInterval(monitorTempInterval);
    //       }
    //     }, 5*1000);
    //   }
    // }, 5*1000);

    // while (true) {
    //   const currentTemp = this._still.temperature;
    //   if (currentTemp > (temp - 1)) {
    //     this._setMessage(`Temp, ${currentTemp}, within 1 degree of target ${temp}`);
    //     break;
    //   }
    //   this._sleep(5);
    // }

    // this._setMessage(`Reached temp ${temp}, holding for ${time}`);
    // const endTime = Date.now() + time*60*1000;
    // while (Date.now() < endTime) {
    //   const currentTemp = this._still.temperature;
    //   this._setMessage(`Temperature check ${currentTemp}`);
    //   if (currentTemp > (temp + 1) && this._still.heatStatus) {
    //     this._setMessage(`Turning off heat`);
    //     this._still.turnHeatOff();
    //   } else if (currentTemp < (temp - 1) && !this._still.heatStatus) {
    //     this._setMessage(`Turning on heat`);
    //     this._still.turnHeatOn();
    //   }
    //   this._sleep(5);
    // }
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
    await this._still.openSolenoid();
    await this._controlHeat(this._input.heartsTemp, this._input.heartsTime);
    await this._still.closeSolenoid();
  }

  async _collectTails() {
    this._setMessage('Begin collecting tails');
    await this._still.moveArmForTails();
    await this._still.openSolenoid();
    await this._controlHeat(this._input.tailsTemp, this._input.tailsTime);
    await this._still.closeSolenoid();
  }

  async startRun() {
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
    await this._still.resetArm();
    this._logger.info('Finished retracting arm');

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
    await this._heatToTemp(this._input.preHeatEndTemperature, this._input.preHeatTime * 60);
    this._timePreHeatComplete = Date.now();
    await this._collectHeads();
    await this._collectHearts();
    await this._collectTails();
    await this._endFractionalRun();
    clearInterval(temperatureLogInterval);

    // const preheatCheck = setInterval( () => {
    //   const currentTemperature = this._still.temperature;
    //   if (currentTemperature > this._input.preHeatEndTemperature) {
    //     this._timePreHeatComplete = Date.now();
    //     clearInterval(preheatCheck);
    //     (async () => {
    //       await this._collectHeads();
    //       await this._collectHearts();
    //       await this._collectTails();
    //       await this._endFractionalRun();
    //       clearInterval(temperatureLogInterval);
    //     }) ();
    //   } else if (Date.now() > preHeatTimeLimit) {
    //     // Took to long to preheat, shut it down
    //     this._setMessage('Took to long to preheat, shutting down');
    //     this._email.sendMail('', 'Fractional still error', serverRunOverview.message);
    //     clearInterval(preheatCheck);
    //     this._still.run = undefined;
    //     this._still.busy = false;
    //     this._endFractionalRun();
    //     clearInterval(temperatureLogInterval);
    //   }
    // }, 1*60*1000);
  }
}

module.exports = FractionalStillRun;
