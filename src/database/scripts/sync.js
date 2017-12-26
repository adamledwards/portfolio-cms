const chalk = require('chalk');
const DB = require( '../db.js');
require( '../models.js');

console.log(chalk.blue('Syncing Database'));

DB.sync({force: true, logging: console.log}).then(() => {
  console.log(chalk.green('Database sync success'));
  process.exit(0);
}, (error) => {
  console.log(chalk.red('Database sync error'));
  console.log(error);
  process.exit(1);
});
