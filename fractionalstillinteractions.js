// Extend Arm, Retract Arm, Heat On, Heat Off, Check Temperature, Open Solenoid, Close Solenoid

function handleIndividualFractionalInteraction(fractionalControlSystem, interaction) {
    let fractionalControlSystemLocal = fractionalControlSystem;


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

    if (interaction == 'extendArm') {
        moveArmForTime(30000, 'extend');
        return (`arm extended`)
    } else if (interaction == 'retractArm') {
        moveArmForTime(30000, 'retract')
        return (`arm retracted`)
    } else if (interaction == 'heatOn') {
        fractionalControlSystemLocal.heatingElement.setState(true);
        return (`heating element on`)
    } else if (interaction == 'heatOff') {
        fractionalControlSystemLocal.heatingElement.setState(false);
        return (`heating element off`)
    } else if (interaction == 'openValve') {
        fractionalControlSystemLocal.solenoid.setState(true);
        return (`solenoid valve is open`)
    } else if (interaction == 'closeValve') {
        fractionalControlSystemLocal.solenoid.setState(false);
        return (`solenoid valve is closed`)
    } else if (interaction == 'checkTemp') {
        let fractionalTemp = fractionalControlSystemLocal.tempProbe.getTemperature();
        return `current column temperature is ${fractionalTemp}`;
    };
};

module.exports.handleIndividualFractionalInteraction = handleIndividualFractionalInteraction;