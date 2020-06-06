const phidget22 = require('phidget22');

let serverPotStatus = true;
let serverGraphData = [];


flashingLights = {
    runDemo: function() {
        serverPotStatus ? serverGraphData = [] : '';
        var SERVER_PORT = 5661;
        hostname = '127.0.0.1';
        var conn = new phidget22.Connection(SERVER_PORT, hostname, { name: 'Server Connection', passwd: '' });
        conn.connect()
            .then(this.startThePhidgetProgram(conn))
            .catch(function (err) {
                console.error('Error running example:', err.message);
                process.exit(1);
            });
    },
    startThePhidgetProgram: function(conn) {
      firstTimePoint = Date.now(); 
      var digitalOutput = new phidget22.DigitalOutput();
      digitalOutput.open()
        .then(() => {
          var lcdDisplay = new phidget22.LCD();
          lcdDisplay.open()
          .then(() => {
            if (lcdDisplay.getDeviceID() === phidget22.DeviceID.PN_1204)
            lcdDisplay.setScreenSize(phidget22.LCDScreenSize.DIMENSIONS_2X40);
            lcdDisplay.setBacklight(1);
            lcdDisplay.writeText(phidget22.LCDFont.DIMENSIONS_5X8, 0, 0, "LED Status: True");
            lcdDisplay.flush();
  
            
            console.log(firstTimePoint);
  
            
              function updateState() {
              var newState = !digitalOutput.getState();
              console.log('\nSetting state to ' + newState + ' for 5 seconds...');
              digitalOutput.setState(newState);
              let message = `LED status is ${!newState}`;
              lcdDisplay.clear();
              lcdDisplay.writeText(phidget22.LCDFont.DIMENSIONS_5X8, 0, 0, message);
              lcdDisplay.flush();
              let graphDataPoint = {
                x: Math.floor((Date.now() - firstTimePoint)/1000),
                y: Math.random()*100,
              }
              graphDataPoint.id = graphDataPoint.x/3;
              serverGraphData.push(graphDataPoint);
            
            }
            
            let exTimer = setInterval(function () { 
              if (serverPotStatus) {
                updateState() 
              } else {
                digitalOutput.setState(true);
                lcdDisplay.clear();
                lcdDisplay.writeText(phidget22.LCDFont.DIMENSIONS_5X8, 0, 0, 'turning off');
                lcdDisplay.writeText(phidget22.LCDFont.DIMENSIONS_5X8, 0, 1, 'good bye');
                lcdDisplay.flush();
                clearInterval(exTimer);
                lcdDisplay.close();
                digitalOutput.close();
                console.log('logging data on quit')
                console.log(serverGraphData);
                conn.close();
              }
            }, 1000);
          })
          .catch(function (err) {
            console.error('Error running example:', err.message);
            process.exit(1);
          });
        })
        .catch(function (err) {
          console.error('Error running example:', err.message);
          process.exit(1);
        });
    }
  }

  console.log(`starting flashing lights`);

  flashingLights.runDemo();
  