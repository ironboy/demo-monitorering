import path from 'path';
import betterSqlite3 from 'better-sqlite3';
import PathFinder from '../helpers/PathFinder.js';
import PasswordEncryptor from '../helpers/PasswordEncryptor.js';
import numericValuesToNumbers from '../helpers/numericValuesToNumbers.js';
import { dbQueryDuration } from '../helpers/metrics.js';

export default class DBQueryMaker {

  log = false; // debug log all queries to the db

  static db = null;  // db connection, store static so it can be reused

  // Create a db connection (if not existing already)
  constructor({ dbPath }) {
    //  connect to the db if not done already by another instance
    let dbAbsPath = globalThis.orgBackendFolder ? // from react-rapide
      path.join(globalThis.orgBackendFolder, dbPath) :
      PathFinder.relToAbs('../' + dbPath);
    this.constructor.db = this.constructor.db || betterSqlite3(dbAbsPath);
    // copy the connection to an instance property for convenience
    this.db = this.constructor.db;
    // for react-rapide, so it can close the db connection
    globalThis.openDbFromQueryMaker = this.db;
  }

  // Make a query to the database, as a prepared statement and
  // run it using .all() if a select statement, otherwise using .run()
  // (async not really needed for the better-sqlite driver
  // but used a reminder that we'll need it for other drivers)
  // Note: The method and route arguments are only used for logging.
  async query(method, route, sql, parameters = {}) {
    sql = sql.trim().replace(/\s{1,}/g, ' ');
    parameters = numericValuesToNumbers(parameters);
    // encrypt all passwords amongst the parameters
    await PasswordEncryptor.encrypt(parameters);
    // check if SELECT or other type of query
    const operation = sql.split(' ', 1)[0].toUpperCase();
    const isSelect = operation === 'SELECT';
    // extract table name for metrics
    const tableMatch = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    const table = tableMatch ? tableMatch[1] : 'unknown';
    const endTimer = dbQueryDuration.startTimer();
    // try to make the query
    let result;
    try {
      const preparedStatement = this.db.prepare(sql);
      result = preparedStatement[isSelect ? 'all' : 'run'](parameters);
      if (isSelect) {
        for (let row of result) {
          for (let key in row) {
            let val = row[key];
            if (typeof val === 'string' && val.startsWith('JSON:')) {
              try {
                row[key] = JSON.parse(val.slice(5));
              }
              catch (_e) { }
            }
          }
        }
      }
    }
    catch (error) { result = { error: error + '' }; }
    endTimer({ operation, table });
    // log method, route, query, parameters and result
    this.log && method && route && console.log('\nDB Query:', {
      method, route, sql, parameters,
      result: result instanceof Array ?
        { rows: result.length } : result
    });
    return result;
  }

}