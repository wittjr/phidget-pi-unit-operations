'use strict';

const SERVER_PORT = 5661;
const hostName = '127.0.0.1';

const conn = new phidget22.Connection(SERVER_PORT, hostName, { name: 'Server Connection', passwd: '' });
conn.connect(fractionalControlSystem, potControlSystem)
  .then(initializePhidgetBoards(fractionalControlSystem, potControlSystem))
  .catch(function (err) {
    console.error('Error connecting to phidget:', err.message);
    process.exit(1);
  });
}

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
