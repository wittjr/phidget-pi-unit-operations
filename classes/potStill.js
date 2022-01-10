// import UUID
const { v4: uuidv4 } = require('uuid');


class PotStill {
  _runTimer;
  _temperatureLoggingInterval;
  _batchID;

  constructor(options) {
    this.logger = options.logger;
    this.db = options.db;
  }

  async endPotRun(serverPotOverview, potControlSystem) {
    this.logger.info("Called new endPotRun for potStill")

    let serverPotOverviewLocal = serverPotOverview;
    let potControlSystemLocal = potControlSystem;

    potControlSystemLocal.potHeatingElement.setState(false).catch(function (err) {
      this.logger.error('setState failed: ' +  JSON.stringify(err));
    });
    potControlSystemLocal.potHeatingElementHighVoltage.setState(false).catch(function (err) {
      this.logger.error('setState failed: ' +  JSON.stringify(err));
    });
    serverPotOverviewLocal.running = false;
    serverPotOverviewLocal.runEndTime = Date.now();
    serverPotOverviewLocal.message = `Run terminated.  Heating element is inactive.`
    this.db.finishRun({
      batchID: this._batchID,
      endTime: serverPotOverviewLocal.runEndTime,
      result: {
        message: serverPotOverviewLocal.message
      }
    });

    clearTimeout(this._runTimer);
    clearInterval(this._temperatureLoggingInterval);
  }

  startPotRun(potGraphData, serverPotOverview, potControlSystem) {
    const termminationTemperature = 99.5; // celsius

    let startTime = Date.now();
    const batchID = uuidv4();
    this._batchID = batchID;
    let potGraphDataLocal = potGraphData;
    let serverPotOverviewLocal = serverPotOverview;
    let potControlSystemLocal = potControlSystem;
    const runData = {
      batchID: batchID,
      startTime: startTime,
      input: serverPotOverviewLocal.potStillInitiatingValues
    };
    this.db.createRun(runData, 'pot');

    function logTemperature(parent, db, logger) {
      let potColumnTemperature = 0;
      try {
        potColumnTemperature = potControlSystemLocal.columnTemperature.getTemperature();
      } catch (err) {logger.error('setState failed: ' +  JSON.stringify(err));}

      let dataPoint = {}
      const now = Date.now();
      const elapsedTime = (now - startTime) / (1000 * 60);
      dataPoint.y = potColumnTemperature;
      dataPoint.x = parseFloat(elapsedTime.toFixed(2));
      dataPoint.id = now;
      potGraphDataLocal.push(dataPoint);
      serverPotOverviewLocal.columnTemperature = potColumnTemperature;

      let timePointData = {
        batchID: batchID,
        epochtime: now,
        temperature: potColumnTemperature,
        elapsedtime: elapsedTime,
        messageID: ''
      };
      db.writeStillTimepoint(timePointData, 'pot');
      // awsDatabaseOperations.writeStillTimepoint(timePointData, 'pot');

      // Monitor temperature until target temperature is attained
      logger.info('Checking temp ' + serverPotOverviewLocal.columnTemperature + " " + termminationTemperature);
      if (serverPotOverviewLocal.columnTemperature >= termminationTemperature) {
        logger.info('Time to end the run, reached temp')
        serverPotOverviewLocal.requiresStrippingRun = false; // If temperature endpoint is reached, no stripping is required
        endPotRun(parent, db, logger);
      }
    }

    function endPotRun(parent, db, logger) {
      logger.info("Called old endPotRun for potStill")
      potControlSystemLocal.potHeatingElement.setState(false).catch(function (err) {
        logger.error('setState failed: ' +  JSON.stringify(err));
      });
      potControlSystemLocal.potHeatingElementHighVoltage.setState(false).catch(function (err) {
        logger.error('setState failed: ' +  JSON.stringify(err));
      });
      serverPotOverviewLocal.running = false;
      serverPotOverviewLocal.runEndTime = Date.now();
      serverPotOverviewLocal.message = `Run has finished.  Heating element is inactive.`
      db.finishRun({
        batchID: batchID,
        result: {
          endTime: serverPotOverviewLocal.runEndTime,
          message: serverPotOverviewLocal.message
        }
      });
      clearTimeout(parent._runTimer);
      clearInterval(parent._temperatureLoggingInterval);
    }

    // **********************************  Main program ********************************** //

    // Tell server that the program is running
    serverPotOverviewLocal.running = true;
    serverPotOverviewLocal.timeStarted = startTime;

    // This forces the program to run a stripping run after gin runs
    // serverPotOverviewLocal.requiresStrippingRun ? serverPotOverviewLocal.forcedTerminationTime = 8 : '';

    this.logger.info(`line 46. after ternery forced term time`);
    this.logger.info(JSON.stringify(serverPotOverviewLocal));
    // Set the time limit in milliseconds
    let runTimeInMilliSeconds = serverPotOverviewLocal.forcedTerminationTime * 60 * 60 * 1000; //hours * 60 min/hour * 60 secos/min * 1000 ms/sec
    this.logger.info(runTimeInMilliSeconds);
    this.logger.info(typeof(runTimeInMilliSeconds));

    // Turn on temperature logging.  This will build graph data and terminate run if target temperature is reached
    // console.log(`Initiating Temperature logging`);
    this._temperatureLoggingInterval = setInterval(logTemperature, 60 * 1000, this, this.db, this.logger); // log temperature every minute
    // temperatureLogging = setInterval(logTemperature, 60 * 1000, this.db, this.logger); // log temperature every minute

    // Turn on heating element
    potControlSystemLocal.potHeatingElement.setState(true).catch(function (err) {
      this.logger.error('setState failed: ' +  JSON.stringify(err));
    });
    // if (serverPotOverviewLocal.forcedTerminationTime > 20) {
    if (serverPotOverviewLocal.potStillInitiatingValues.typeOfRun == 'Large Stripping') {
      potControlSystemLocal.potHeatingElementHighVoltage.setState(true).catch(function (err) {
        this.logger.error('setState failed: ' +  JSON.stringify(err));
      });
    }
    // console.log(`Heating element turned on`);
    serverPotOverviewLocal.message = `Heating element is active`;

    // Set timeout for total run time
    this._runTimer = setTimeout(() => {
      this.logger.info('Max time for pot run reached, shutting down.')
      serverPotOverviewLocal.requiresStrippingRun = true; // If the program terminates due to time, make the next run a stripping run
      endPotRun(this, this.db, this.logger)
    }, runTimeInMilliSeconds);
  };
}

module.exports = PotStill;
