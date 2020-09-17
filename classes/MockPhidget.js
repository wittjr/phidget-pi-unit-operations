class MockPhidget {
  constructor(options) {
    this.state = false;
    this.temperature = 0;
    this.lastTempCheck = Date.now();
    this.name = options.name;
    this.logger = options.logger;
    this.isTempSensor = options.isTempSensor;
  }

  setState(value) {
    this.logger.debug(this.name + ': Current state: ' + this.state);
    if (this.isTempSensor && value && !this.state) {
      const currentTemp = this.temperature;
      const thisTimeCheck = Date.now();
      const millisecondsSinceLastCheck = thisTimeCheck - this.lastTempCheck;
      const minutesSinceLastCheck = millisecondsSinceLastCheck/(1000*60);
      const timeSinceLastCheck = parseFloat(minutesSinceLastCheck.toFixed(2));
      this.lastTempCheck = thisTimeCheck;
      this.logger.debug(this.name + ': Time since last check: ' + timeSinceLastCheck);
      this.temperature = currentTemp - timeSinceLastCheck;
      if (this.temperature < 0) {
        this.temperature = 0;
      }
      this.logger.debug(this.name + ': Current temperature: ' + this.temperature);
    }
    this.state=value;
    this.logger.debug(this.name + ': State set to: ' + this.state);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
        return;
      }, 1*1000);
    });
  }

  getState() {
    this.logger.debug(this.name + ': Current state: ' + this.state);
    return this.state;
  }

  getTemperature() {
    const currentTemp = this.temperature;
    const thisTimeCheck = Date.now();
    const millisecondsSinceLastCheck = thisTimeCheck - this.lastTempCheck;
    const minutesSinceLastCheck = millisecondsSinceLastCheck/(1000*60);
    const timeSinceLastCheck = parseFloat(minutesSinceLastCheck.toFixed(2));
    this.lastTempCheck = thisTimeCheck;
    this.logger.debug(this.name + ': Time since last check: ' + timeSinceLastCheck);
    this.logger.debug(this.name + ': Current state: ' + this.state);
    if (this.state) {
      // heat 15 degrees per second
      this.temperature = currentTemp + (timeSinceLastCheck * 20);
    } else {
      // cool by 1 degree per second
      this.temperature = currentTemp - timeSinceLastCheck;
    }
    if (this.temperature < 0) {
      this.temperature = 0;
    }
    this.logger.debug(this.name + ': Current temperature: ' + this.temperature);
    return this.temperature
  }
}

module.exports = MockPhidget;
