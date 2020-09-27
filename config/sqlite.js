const sqlite3 = require('sqlite3').verbose();

class Data {
  constructor(options) {
    this.logger = options.logger;
    this.db = new sqlite3.Database(options.location, (err) => {
      if (err) {
        return this.logger.error(err.message);
      }
      this.logger.info('Connected to the ' + options.location + ' SQlite database.');
    });

    this.db.serialize(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS timedata (
        id integer PRIMARY KEY AUTOINCREMENT,
        batchID text,
        timestamp integer,
        temperature real,
        operation text
      )`);
      this.db.run(`CREATE TABLE IF NOT EXISTS rundata (
        id integer PRIMARY KEY AUTOINCREMENT,
        batchID text,
        operation text,
        starttime integer,
        enttime integer,
        input text,
        result text
      )`);
      this.db.run(`ALTER TABLE rundata ADD endtime integer`);
    });
  }

  createRun(runData, unitOperation) {
    this.logger.debug('DB: Create run ' + JSON.stringify(runData));
    this.db.serialize(() => {
      this.db.run(`INSERT INTO rundata (
        batchID,
        operation,
        starttime,
        input
      ) VALUES ('` + runData.batchID + `','` + unitOperation + `',` + runData.startTime + `,'` + JSON.stringify(runData.input) + `')`);
    });
  }

  finishRun(runData) {
    this.logger.debug('DB: Finish run ' + JSON.stringify(runData));
    this.db.serialize(() => {
      this.db.run(`UPDATE rundata SET
        endtime = '` +  runData.endTime + `',
        result = '` + JSON.stringify(runData.result) + `'
        WHERE batchID = '` +  runData.batchID + `'`);
    });
  }

  getRun(batchID = undefined, callback) {
    let rows = [];
    let query = 'SELECT * FROM rundata';
    if (batchID) {
      query += ' WHERE batchID=\''+ batchID + '\' ORDER BY starttime ASC';
    }
    this.db.serialize(() => {
      this.db.each(query, (err, row) => {
        if (err) {
          this.logger.error(err.message);
        }
        let rowObj = Object.assign({}, row);
        rowObj.input = JSON.parse(row.input);
        rowObj.result = JSON.parse(row.result);
        rows.push(rowObj);
      }, () => {
        callback(rows);
      });
    });
  }

  writeStillTimepoint(timePointData, unitOperation) {
    this.logger.debug('DB: Write time point ' + JSON.stringify(timePointData));
    this.db.serialize(() => {
      this.db.run(`INSERT INTO timedata (
        batchID,
        timestamp,
        temperature,
        operation
      ) VALUES ('` + timePointData.batchID + `','` + timePointData.epochtime + `',` + timePointData.temperature + `,'`  + unitOperation + `')`);
    });
  }

  getTimePoints(batchID = undefined, callback) {
    let rows = [];
    let query = 'SELECT * FROM timedata';
    if (batchID) {
      query += ' WHERE batchID=\''+ batchID + '\' ORDER BY timestamp ASC';
    }
    this.db.serialize(() => {
      this.db.each(query, (err, row) => {
        if (err) {
          this.logger.error(err.message);
        }
        // this.logger.info(row.id + "\t" + row.batchID + "\t" + row.timestamp + "\t" + row.temperature + "\t" + "\t" + row.operation);
        rows.push(row);
      }, () => {
        callback(rows);
      });
    });
    // return rows;
  }

  close() {
    this.db.close((err) => {
      if (err) {
        return this.logger.error(err.message);
      }
      this.logger.info('DB: Close the database connection.');
    });
  }
}

module.exports = Data
