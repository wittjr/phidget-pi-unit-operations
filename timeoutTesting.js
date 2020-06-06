let arrayOfClosedTimes = [2000, 4000, 6000, 8000, 10000];
let counter = 0;
let startTime = Date.now();
let lastStamp = startTime;
let positionInOverallArray = 0;

let cycleCountArray = [
    {cycleCount:5, closeTime:2000},
    {cycleCount:3, closeTime:3000, nextFunction:function(){console.log('move arm')} },
    {cycleCount:2, closeTime:4000},
    {cycleCount:1, closeTime:8000}
];

function runEnclosingArrayCycle(fractionInformation) {
    let fractionCounter = 0;

    function runOneCycle() {
        valveStatus=true;
        console.log(`Overall: ${positionInOverallArray} Counter: ${fractionCounter} timestamp: ${Date.now()-lastStamp}: valve status: ${valveStatus}`);
        lastStamp=Date.now();
        let openTimer = setTimeout(endOpenValve, 500);
    };
    
    function endOpenValve() {
        valveStatus = false;
        console.log(`Overall: ${positionInOverallArray} Counter: ${fractionCounter} timestamp: ${Date.now()-lastStamp}: valve status: ${valveStatus}`);
        lastStamp=Date.now();
        let endCycleTimer = setTimeout(waitUntilNextCycle, fractionInformation.closeTime);
    };

    function waitUntilNextCycle() {
        // console.log(`timestamp: ${Date.now()}: valve status: ${valveStatus}`);
        fractionCounter++;
        if (fractionCounter < fractionInformation.cycleCount) {
            runOneCycle();
        } else {
            positionInOverallArray++;
            console.log(`line 47 ${positionInOverallArray}`)
            if (fractionInformation.nextFunction) {
                // run end of fraction function; usually move actuator arm
                fractionInformation.nextFunction();
            } 
            if (positionInOverallArray<cycleCountArray.length) {
                // move to next line in overall array
                runEnclosingArrayCycle(cycleCountArray[positionInOverallArray]);
            } else {
                // end the run
                console.log(`Run has ended`);
            }
        }
    };

    runOneCycle();
}

runEnclosingArrayCycle(cycleCountArray[positionInOverallArray]);
