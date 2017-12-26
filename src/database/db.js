const Sequelize = require('sequelize');

const DB = new Sequelize(
  'portfolio',
  'portfolio',
  'portfolio123',
  {
    dialect: 'postgres',
    host: 'localhost',
    port: 5432
  }
);

module.exports = DB;
