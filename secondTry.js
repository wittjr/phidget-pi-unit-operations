// To Do:
// 1. Add time estimate for overall fraction (e.g. heads / hearts / tails)
// 2. Change message to an array --> push the current to array and peek on frontend
// 3. Make message {timeStamp, message}


// This module receives:
// fractionalGraphData: array where each object is: x (elapsed time in seconds), y (temperature), id (Date.now() to use as identifier)
// serverRunOverview: object {currentBeaker, currentClickCountInBeaker, totalClickCountInBeaker, 
//                            timeToCompleteBeaker, timeToCompleteRun, startAlcohol, startVolume, message, running}. 

// import UUID
const uuidv1 = require('uuid/v1'); 

// database ORM
const awsDatabaseOperations = require('./databaseOperations/writeToAWS');

function startFractionalRun(fractionalGraphData, serverRunOverview, fractionalControlSystem) {
    // physical parameters and relay mapping
    const collectionCoefficient = 1.75;
    const lastFractionForHeads = 5;
    const lastFractionForHearts = 16;
    const preHeatEndTemperature = 45;
    const batchID = uuidv1();

    let startTime = Date.now();
    let fractionalGraphDataLocal = fractionalGraphData;
    let serverRunOverviewLocal = serverRunOverview;
    let fractionalControlSystemLocal = fractionalControlSystem;
    let overallRunArray = [];
    let positionInOverallArray=0;

    convertAlcoholToDecimal = function() {
        serverRunOverviewLocal.startAlcohol = parseFloat(serverRunOverviewLocal.startAlcohol);
        if (serverRunOverviewLocal.startAlcohol > 1) {
            serverRunOverviewLocal.startAlcohol = serverRunOverviewLocal.startAlcohol / 100;
        } else if (serverRunOverviewLocal.startAlcohol <= 0) {
            return false;
        }
        return true;
    };
    
    convertVolumeToDecimal = function() {
        serverRunOverviewLocal.startVolume = parseFloat(serverRunOverviewLocal.startVolume)*1000;
        if (serverRunOverviewLocal.startVolume <= 0) {
            return false;
        }
        return true; 
    };

    moveArmForTime = function(moveTimeInMilliseconds, direction) {
        if (direction == 'extend') {
            fractionalControlSystemLocal.retractArm.setState(false);
            fractionalControlSystemLocal.extendArm.setState(true);
            setTimeout( () => {
                fractionalControlSystemLocal.extendArm.setState(false) 
            }, moveTimeInMilliseconds);
        } else {
            fractionalControlSystemLocal.extendArm.setState(false);
            fractionalControlSystemLocal.retractArm.setState(true);
            setTimeout( () => {
                fractionalControlSystemLocal.retractArm.setState(false) 
            }, moveTimeInMilliseconds);
        }
    };

    buildOverallRunArray = function() {
        console.log(`Line 55: Starting alcohol is ${serverRunOverviewLocal.startAlcohol} and volume ${serverRunOverviewLocal.startVolume}`);
        let volumeEthanol = serverRunOverviewLocal.startAlcohol * serverRunOverviewLocal.startVolume;
        let volumeMethanol = volumeEthanol * 0.03;
        let volumeHeads = volumeEthanol * 0.05;
        let volumeTails = volumeEthanol * 0.05;
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
        console.log('internal beaker array - line 111:');
        console.log(beakerArray);
        for (let i=0; i<21; i++) {
            overallRunArray.push(beakerArray[i]);
        };
        console.log(`Line 116 overall array:`);
        console.log(overallRunArray);
        serverRunOverviewLocal.calculatedBeakerArray = overallRunArray;
    };

    function buildDataForRun() {
        if (convertAlcoholToDecimal(serverRunOverviewLocal) && convertVolumeToDecimal(serverRunOverviewLocal)) {
            // build overall run array
            buildOverallRunArray(serverRunOverviewLocal);
        } else {
            console.log(`bad volume or alcohol value was received. alcohol: ${serverRunOverviewLocal.startAlcohol}, volume: ${serverRunOverviewLocal.startVolume}`);
            serverRunOverviewLocal.message = `bad volume or alcohol value was received. alcohol: ${serverRunOverviewLocal.startAlcohol}, volume: ${serverRunOverviewLocal.startVolume}`;
        }
    };

    function logTemperature() {
        let fractionalTemp = fractionalControlSystemLocal.tempProbe.getTemperature();
        let dataPoint = {}
        dataPoint.y = fractionalTemp;
        dataPoint.x = (Date.now() - startTime)/(1000*60);
        dataPoint.id = Date.now();
        fractionalGraphDataLocal.push(dataPoint);
        serverRunOverviewLocal.currentTemperature = fractionalTemp;
        let timePointData = {
            batchID:batchID,
            epochtime:Date.now()/1000,
            temperature:fractionalTemp,
            elapsedtime:dataPoint.x,
            messageID:''
        };
        awsDatabaseOperations.writeStillTimepoint(timePointData,'fractional');
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
        let timePreviousStepCompleted = Date.now();
        if ( serverRunOverviewLocal.timePreHeatComplete == '') {
            timePreviousStepCompleted = Date.now() + 2.5 * 60 * 60 * 1000 + 10 * 60 * 1000;  // estimate 2.5h to preheat + 10 minutes to reflux
        } else {
            timePreviousStepCompleted = serverRunOverviewLocal.timePreHeatComplete;
        }
        for (let i=0; i<overallRunArray.length; i++) {
            let expectedBeakerEndTime = timePreviousStepCompleted + (overallRunArray[i].closeTime + 0.5) * overallRunArray[i].cycleCount;
            overallRunArray[i].expectedBeakerEndTime = expectedBeakerEndTime;
            timePreviousStepCompleted = expectedBeakerEndTime;
        }
        console.log(`${overallRunArray}`);
    }

    function endFractionalRun() {
        function closeSoleniod() {
            fractionalControlSystemLocal.solenoid.setState(false);
            console.log(`Completed at ${Date.now()}. Solenoid is now closed`)
            serverRunOverviewLocal.message = `Run completed at ${Date.now()}`;
            clearInterval(temperatureLogInterval);
        }

        fractionalControlSystemLocal.heatingElement.setState(false);
        serverRunOverviewLocal.message = `Heating element is turned off.  Waiting five minutes to drain still`;
        fractionalControlSystemLocal.solenoid.setState(true);
        console.log(`Heating element off, solenoid open`)
        setTimeout(() => {
            closeSoleniod();
        }, 5*60*1000);
    }

    // This is the core logic.  It opens the solenoid valve for 0.5 seconds and closes for the time designated by each element of the array
    // After reaching the end of the array, heat is discontinued, we empty the still by opening the solenid for five minutes
    function runEnclosingArrayCycle(fractionInformation) {
        // recursive function.  Terminates when end of array is met
        let fractionCounter = 0;
    
        function runOneCycle() {
            fractionalControlSystemLocal.solenoid.setState(true);
            setTimeout(endOpenValve, 500);
        };
        
        function endOpenValve() {
            fractionalControlSystemLocal.solenoid.setState(false);
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
                console.log(`moving to next beaker ${positionInOverallArray}`);
                // updateBeakerEndTimes();
                // if the current beaker has a next function, run it.  Currently used to move actuator arm
                if (fractionInformation.nextFunction) {
                    // run end of fraction function; currently only used to move actuator arm
                    fractionInformation.nextFunction();
                    console.log(`moved actuator arm`);
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
                    console.log(`Last beaker reached, moving to run termination`);
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
    console.log(`Retracting arm for 30 seconds`);
    serverRunOverviewLocal.running = true;
    moveArmForTime(30000,'retract');
    serverRunOverviewLocal.message = `Retracting arm`;

    // Build array of beakers for recursive section to iterate through
    buildDataForRun(serverRunOverviewLocal);
    console.log(`Built the following beaker array:`);
    console.log(overallRunArray);

    // Update server with estimated time to complete
    updateExpectedTotalRunTime();
    updateBeakerEndTimes();

    // Turn on temperature logging
    console.log(`Initiating Temperature logging`);
    let startingTemperature = fractionalControlSystemLocal.tempProbe.getTemperature();
    console.log(`Starting Temperature is ${startingTemperature}`)
    let temperatureLogInterval = setInterval(logTemperature, 60*1000);
    
    // Turn on heating element
    fractionalControlSystemLocal.heatingElement.setState(true);
    console.log(`Heating element turned on`);
    serverRunOverviewLocal.message = `Pre-heating System`;

    // Monitor temperature until target pre-heat temperature is hit
    console.log(`pre-heating system until temperature reaches ${preHeatEndTemperature}`);
    let preheatCheck = setInterval( () => {
        let currentTemperature = fractionalControlSystemLocal.tempProbe.getTemperature();
        if (currentTemperature > preHeatEndTemperature) {
            // Wait ten minutes, stop monitoring temperature for pre-heat
            serverRunOverviewLocal.message = 'Ten minute wait before processing';
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
        }
    }, 1*60*1000);

};

module.exports.startFractionalRun = startFractionalRun;