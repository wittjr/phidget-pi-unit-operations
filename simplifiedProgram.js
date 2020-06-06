function startSimplifiedProgram(fractionalGraphData, serverFractionalStatus, serverRunOverview, fractionalControlSystem) {
    let overallArray = [];
    let startTime = Date.now();

    let serverFractionalStatusLocal = serverFractionalStatus;
    let fractionalGraphDataLocal = fractionalGraphData;
    let serverRunOverviewLocal = serverRunOverview;
    let fractionalControlSystemLocal = fractionalControlSystem;

    console.log(fractionalControlSystemLocal);


    function buildOuterArray() {
        let numberOfCycles = Math.floor(serverRunOverviewLocal.startAlcohol * serverRunOverviewLocal.startVolume);
        for (let i=0; i<numberOfCycles; i++) {
            let individualCycle = {};
            individualCycle.closeTime = .5 * (i+1);
            overallArray.push(individualCycle);
        };
    };
    function processOverallArray(){
        console.log(serverRunOverviewLocal);
        let counter = 0;
        function runOneCycle() {
            fractionalControlSystemLocal.solenoid.setState(true);
            console.log('opened valve');
            setTimeout(endOpenValve, 500);
        };
        
        function endOpenValve() {
            fractionalControlSystemLocal.solenoid.setState(false);
            console.log('closed valve');
            setTimeout(waitUntilNextCycle, 4000);
        };
        function waitUntilNextCycle() {
            counter++;
            serverRunOverviewLocal.currentClickCountInBeaker=counter;
            
            if (counter < overallArray.length) {
                runOneCycle();
            } else {
                console.log('testing that i can see overall array:');
                console.log(overallArray);
                fractionalControlSystemLocal.solenoid.setState(false);
                fractionalControlSystemLocal.heatingElement.setState(false);
                console.log(`Finished Run at ${Date.now()}`);
                clearInterval(tempLoggingTimer);
                console.log(`temp logging stopped`);
                console.log(fractionalGraphDataLocal);
            }
        };
        runOneCycle();
    };
    function waitAfterPreHeat() {
        let waitTime = .25 * 60 * 1000;
        setTimeout( () => processOverallArray(), waitTime)  
    };
    function logTemperature(startTime) {
        let fractionalTemp = fractionalControlSystemLocal.tempProbe.getTemperature();
        let dataPoint = {}
        dataPoint.y = fractionalTemp;
        dataPoint.x = Date.now() - startTime;
        dataPoint.id = Date.now();
        fractionalGraphDataLocal.push(dataPoint);
        console.log(`Pushed temperature: ${fractionalTemp} to array at ${Date.now()}`);
    }
    fractionalControlSystem.heatingElement.setState(true);
    let tempLoggingTimer = setInterval( () => logTemperature(startTime), 5000);
    console.log(`starting run now: ${Date.now()}`);
    buildOuterArray(serverRunOverviewLocal);
    console.log(`Outer Array: `);
    console.log(overallArray);
    fractionalControlSystem.heatingElement.setState(true);
    console.log('heating element is on');
    waitAfterPreHeat();

}

module.exports.startSimplifiedProgram = startSimplifiedProgram;