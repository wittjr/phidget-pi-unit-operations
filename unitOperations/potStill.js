// import UUID
const uuidv1 = require('uuid/v1'); 

// database ORM
const awsDatabaseOperations = require('../databaseOperations/writeToAWS');


function startPotRun(potGraphData, serverPotOverview, potControlSystem) {
    const termminationTemperature = 99.5; // celsius
    
    let startTime = Date.now();
    const batchID = uuidv1();
    let potGraphDataLocal = potGraphData;
    let serverPotOverviewLocal = serverPotOverview;
    let potControlSystemLocal = potControlSystem;
    let temperatureLogging;
    let runTimer;
    

    function logTemperature() {
        let potColumnTemperature = potControlSystemLocal.columnTemperature.getTemperature();
        let dataPoint = {}
        dataPoint.y = potColumnTemperature;
        dataPoint.x = (Date.now() - startTime)/(1000*60);
        dataPoint.id = Date.now();
        potGraphDataLocal.push(dataPoint);
        serverPotOverviewLocal.columnTemperature = potColumnTemperature;
        
        let timePointData = {
            batchID:batchID,
            epochtime: Date.now()/1000,
            temperature:potColumnTemperature,
            elapsedtime:dataPoint.x,
            messageID:''
        }; 
        awsDatabaseOperations.writeStillTimepoint(timePointData,'pot');

        // Monitor temperature until target temperature is attained
        if (serverPotOverviewLocal.columnTemperature >= termminationTemperature) {
            serverPotOverviewLocal.requiresStrippingRun = false;  // If temperature endpoint is reached, no stripping is required
            endPotRun();
        }
    }

    function endPotRun() {  
        potControlSystemLocal.potHeatingElement.setState(false);
        potControlSystemLocal.potHeatingElementHighVoltage.setState(false);
        serverPotOverviewLocal.running = false;
        serverPotOverviewLocal.runEndTime = Date.now();
        serverPotOverviewLocal.message = `Run has finished.  Heating element is inactive.`
        clearTimeout(runTimer);
        clearInterval(temperatureLogging);
    }

    // **********************************  Main program ********************************** //
    
    // Tell server that the program is running
    serverPotOverviewLocal.running=true;
    serverPotOverviewLocal.timeStarted = startTime;

    // This forces the program to run a stripping run after gin runs
    serverPotOverviewLocal.requiresStrippingRun ? serverPotOverviewLocal.forcedTerminationTime = 8 : ''; 

    console.log(`line 46. after ternery forced term time`);
    console.log(serverPotOverviewLocal)
    // Set the time limit in milliseconds
    let runTimeInMilliSeconds = serverPotOverviewLocal.forcedTerminationTime * 60 * 60 * 1000; //hours * 60 min/hour * 60 secos/min * 1000 ms/sec
    console.log(runTimeInMilliSeconds);
    console.log(typeof(runTimeInMilliSeconds));

    // Turn on temperature logging.  This will build graph data and terminate run if target temperature is reached
    // console.log(`Initiating Temperature logging`);
    temperatureLogging = setInterval(logTemperature, 60*1000); // log temperature every minute
    
    // Turn on heating element
    potControlSystemLocal.potHeatingElement.setState(true);
    if ( serverPotOverviewLocal.forcedTerminationTime > 10 ) {
        potControlSystemLocal.potHeatingElementHighVoltage.setState(true);
    }
    // console.log(`Heating element turned on`);
    serverPotOverviewLocal.message = `Heating element is active`;

    // Set timeout for total run time
    runTimer = setTimeout( () => {
        serverPotOverviewLocal.requiresStrippingRun = true;  // If the program terminates due to time, make the next run a stripping run
        endPotRun()
    }, runTimeInMilliSeconds);
    console.log(runTimer);
};


module.exports.startPotRun = startPotRun;