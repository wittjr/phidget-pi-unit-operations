var phidget22 = require('phidget22');

var SERVER_PORT = 5661;
var hostname = 'localhost';

function main() {

	console.log('connecting to:' + hostname);
	var conn = new phidget22.Connection(SERVER_PORT, hostname, { name: 'Server Connection', passwd: '' });
	conn.connect()
		.then(runExample)
		.catch(function (err) {
			console.error('Error running example:', err.message);
			process.exit(1);
		});
}

function runExample() {
    initializePhidgetBoards().then( (controlSystem) => { runFracProcess( controlSystem ) });
}

function runFracProcess(controlSystem){
    controlSystem.solenoid.setState(true);
    controlSystem.heatingElement.setState(true);
    

    setTimeout(() => {
        controlSystem.solenoid.setState(false);
    }, 15000);
    setTimeout(() => {
        controlSystem.heatingElement.setState(false);
    }, 10000);
    setInterval(() => {
        console.log(`temp requested at: ${Date.now()}`)
        console.log(`Temperature returned at ${Date.now()}`)
        let tempreading = controlSystem.tempProbe.getTemperature();
        console.log(tempreading);
    }, 1000);
}
    
async function initializePhidgetBoards() {
    let heatingElement = new phidget22.DigitalOutput();
    heatingElement.setChannel(0);
    await heatingElement.open();

    let solenoid = new phidget22.DigitalOutput();
    solenoid.setChannel(1);
    await solenoid.open();

    let extendArm = new phidget22.DigitalOutput();
    extendArm.setChannel(2);
    await extendArm.open();

    let retractArm = new phidget22.DigitalOutput();
    retractArm.setChannel(3);
    await retractArm.open();


    var tempProbe = new phidget22.TemperatureSensor();
    tempProbe.setChannel(0);
    tempProbe.setDataInterval(500);
    await tempProbe.open();
    console.log('temp probe attached');
    

    let phidgetBoardMapping = {
        heatingElement:heatingElement,
        solenoid:solenoid,
        extendArm:extendArm,
        retractArm:retractArm,
        tempProbe:tempProbe
    }
    return phidgetBoardMapping;
}


if (require.main === module)
	main();