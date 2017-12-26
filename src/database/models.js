const Sequelize = require('sequelize');
const SETTINGS = require('../config/settings.js');
const DB = require('./db.js');

const User = DB.define('user', {
  firstName: {
    type: Sequelize.STRING,
    allowNull: false
  },
  lastname: {
    type: Sequelize.STRING,
    allowNull: false
  },
  email: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    }
  },
  password: {
    type: Sequelize.STRING(64),
    allowNull: false
  }
});

const File = DB.define('file', {
  path: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  fullPath: {
    type: Sequelize.VIRTUAL,
    get() {
      return `${SETTINGS.HOST}${SETTINGS.MEDAIA_PATH}/${this.get('path')}`;
    }
  },
  absolutePath: {
    type: Sequelize.VIRTUAL,
    get() {
      return `${SETTINGS.MEDAIA_ROOT}/${this.get('path')}`;
    }
  },
  originalname: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  contentType: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  size: {
    type: Sequelize.INTEGER
  },
  scope: {
    type: Sequelize.STRING,
    allowNull: true,
  },
});

const Page = DB.define('page', {
  title: {
    type: Sequelize.STRING,
    allowNull: false
  },
  description: {
    type: Sequelize.STRING,
    allowNull: true
  },
  projectGoLive: {
    type: Sequelize.DATEONLY,
    allowNull: true
  },
  client: {
    type: Sequelize.STRING,
    allowNull: true
  },
  published: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  publishedOn: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  position: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    allowNull: false,
  }
});

const Meta = DB.define('meta', {
  field1:  {
    type: Sequelize.STRING,
    allowNull: true
  },
  field2:  {
    type: Sequelize.STRING,
    allowNull: true
  },
  position:  {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    allowNull: true
  },
});

const Block = DB.define('block', {
  blockType: {
    type: Sequelize.STRING,
    allowNull: false
  },
  position: {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  editor: {
    type: Sequelize.JSON,
    allowNull: true
  },
  date: {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: Sequelize.NOW
  },
  title: {
    type: Sequelize.STRING,
    allowNull: true
  },
  colour: {
    type: Sequelize.STRING,
    allowNull: true
  },
});

User.hasMany(Page);
Page.hasMany(Block);
DB.models.page.listingImage = Page.belongsTo(File, {
  as: 'listingImage', 
  foreignKey: 'listing_image_id',
  constraints: false,
});
Block.hasMany(Meta, { onDelete: 'CASCADE' });
Block.hasMany(File);

module.exports = {
  models: DB.models,
  DB: DB,
};