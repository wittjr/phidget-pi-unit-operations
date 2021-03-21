const phidget22 = require('phidget22');

function log(message) {
  console.log((new Date().toLocaleString()) + ' - ' + message);
}

let phidgetSerials = {}

function changeHandler(propertyName) {
  let phidgetName = phidgetSerials[this.getKey()]
  switch (propertyName) {
    case 'State':
      log(phidgetName + ' new state: ' + this.getState());
      break;
    default:
      log(phidgetName + ' unhandled property: ' + propertyName);
  }
}

function errorHandler(code, description) {
  let phidgetName = phidgetSerials[this.getKey()]
  log(phidgetName + ' error, Code: ' + code + ', Description: ' + description)
}

function tempChangeHandler(temperature) {
  let phidgetName = phidgetSerials[this.getKey()]
  log(phidgetName + ' temperature: ' + temperature)
}

async function main () {
  let conn;
  try {
    let connectionOptions = {
      hostname: '192.168.128.33',
      port: 5661,
      name: 'Phidget connection',
      passwd: '',
      onError: function(code, msg) { log("Connection Error:", code, msg); },
	    onConnect: () => { log("Connected"); },
	    onDisconnect: () => { log("Disconnected"); }
    }
    conn = new phidget22.Connection(connectionOptions);

    await conn.connect();

    let heatingElement = new phidget22.DigitalOutput();
    heatingElement.setHubPort(0);
    heatingElement.setChannel(0);
    heatingElement.onPropertyChange = changeHandler
    heatingElement.onError = errorHandler
    await heatingElement.open();
    phidgetSerials[heatingElement.getKey()] = 'fractional heating element'
    log('heating element attached');

    let solenoid = new phidget22.DigitalOutput();
    solenoid.setHubPort(0);
    solenoid.setChannel(1);
    solenoid.onPropertyChange = changeHandler
    solenoid.onError = errorHandler
    await solenoid.open();
    phidgetSerials[solenoid.getKey()] = 'solenoid'
    log('solenoid attached');

    let extendArm = new phidget22.DigitalOutput();
    extendArm.setHubPort(0);
    extendArm.setChannel(2);
    extendArm.onPropertyChange = changeHandler
    extendArm.onError = errorHandler
    await extendArm.open();
    phidgetSerials[extendArm.getKey()] = 'extendArm'
    log('arm extender attached');

    let retractArm = new phidget22.DigitalOutput();
    retractArm.setHubPort(0);
    retractArm.setChannel(3);
    retractArm.onPropertyChange = changeHandler
    retractArm.onError = errorHandler
    await retractArm.open();
    phidgetSerials[retractArm.getKey()] = 'retractArm'
    log('arm retractor attached');

    var tempProbe = new phidget22.TemperatureSensor();
    tempProbe.setHubPort(1);
    tempProbe.setChannel(1);
    tempProbe.onPropertyChange = changeHandler
    tempProbe.onError = errorHandler
    tempProbe.onTemperatureChange = tempChangeHandler
    await tempProbe.open();
    phidgetSerials[tempProbe.getKey()] = 'fractional tempProbe'
    tempProbe.setTemperatureChangeTrigger(0.5)
    tempProbe.setDataInterval(500);
    log('temp probe attached');

    var columnTemperature = new phidget22.TemperatureSensor();
    columnTemperature.setHubPort(1);
    columnTemperature.setChannel(0);
    columnTemperature.onPropertyChange = changeHandler
    columnTemperature.onError = errorHandler
    columnTemperature.onTemperatureChange = tempChangeHandler
    await columnTemperature.open();
    columnTemperature.setTemperatureChangeTrigger(0.5)
    columnTemperature.setDataInterval(500);
    phidgetSerials[columnTemperature.getKey()] = 'pot columnTemperature'
    log('pot temp probe attached');

    let potHeatingElement = new phidget22.DigitalOutput();
    potHeatingElement.setHubPort(2);
    potHeatingElement.setChannel(0);
    potHeatingElement.onPropertyChange = changeHandler
    potHeatingElement.onError = errorHandler
    await potHeatingElement.open();
    phidgetSerials[potHeatingElement.getKey()] = 'potHeatingElement'
    log('pot heating element attached');

    let potHeatingElementHighVoltage = new phidget22.DigitalOutput();
    potHeatingElementHighVoltage.setHubPort(2);
    potHeatingElementHighVoltage.setChannel(1);
    potHeatingElementHighVoltage.onPropertyChange = changeHandler
    potHeatingElementHighVoltage.onError = errorHandler
    await potHeatingElementHighVoltage.open();
    phidgetSerials[potHeatingElementHighVoltage.getKey()] = 'potHeatingElementHighVoltage'
    log('pot heating high voltage element attached');

  } catch(e) {
    if (e instanceof phidget22.PhidgetError) {
      log('Phidget Error: ' + e.errorCode + ' ' + e.message)
    } else {
      log(e);
    }
    conn.close();
    process.exit(1);
  }
}

main()
