const { 
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLSchema,
  GraphQLID,
  GraphQLBoolean,
 } = require('graphql');

const {
  nodeDefinitions,
  globalIdField,
  toGlobalId,
  fromGlobalId,
  mutationWithClientMutationId,
  connectionArgs,
  connectionDefinitions,
  connectionFromArray,
  cursorForObjectInConnection,
  offsetToCursor
} = require('graphql-relay');
const GraphQLJSON  = require('graphql-type-json');
const md5 = require('md5');
const path = require('path');
const fs = require('fs-extra');
const SETTINGS = require('./config/settings.js');
const { DB, models } = require('./database');
const { saveFile } = require('./fileManger.js');


function getDataType (type) {
  return {
    page: PageType,
    block: blockType
  }[type];
}

var {nodeInterface, nodeField} = nodeDefinitions(
  (globalId) => {
    var {type, id} = fromGlobalId(globalId);
    console.log('type=', type);
    console.log('id=', id);
    return DB.models[type.toLocaleLowerCase()].findById(id);
  },
  (obj) => {
    return getDataType(obj.constructor.name) || null;
  }
);

const metaType = new GraphQLObjectType({
  name: 'Meta',
  description: 'Meta fiels',  
  interfaces: [nodeInterface],
  fields () {
    return {
      id: globalIdField(),
      field1: {
        type: GraphQLString,
        description: 'key',
        resolve (meta) {
          return meta.field1;
        },
      },
      field2: {
        type: GraphQLString,
        description: 'value',
        resolve (meta) {
          return meta.field2;
        },
      },
      position: {
        type: GraphQLInt,
        description: 'position',
        resolve (meta) {
          return meta.position;
        },
      },
    };
  },
});

const metaTypeCreateInput = new GraphQLInputObjectType({
  name: 'MetaTypeCreateInput',
  description: 'Meta',
  fields: { 
    blockId: {
      type: GraphQLID,
      description: 'block id',
    },
    field1: {
      type: GraphQLString,
      description: 'field1',
    },
    field2: {
      type: GraphQLString,
      description: 'field2',
    },
    position: {
      type: GraphQLInt,
      description: 'position',
      defaultValue: 0
    }
  },
});

const { connectionType: metaConnection, edgeType: metaEdge } = 
connectionDefinitions({ name: 'Meta', nodeType: metaType });

const createMeta =  mutationWithClientMutationId({
  name: 'createMeta',
  inputFields: {
    metaInput: { type: metaTypeCreateInput },
  },
  mutateAndGetPayload({ metaInput }) {
    const {type, id} = fromGlobalId(metaInput.blockId);
    if(type !== 'Block') {
      throw Error('ID must belong to Block type');
    }
    const newMeta = Object.assign({},metaInput, {blockId: id});
    return DB.transaction(transaction => { 
      return models.meta.create(newMeta, { transaction }
      ).then((meta) => {
        return DB.query(
          `UPDATE meta
          set position = position + 1
          where position >= 0 and "blockId" = $id`,
          { 
            bind: { id:  id },
            type: 'UPDATE', 
            transaction, 
          }
        ).then(() => meta);
      });
    });
  },
  outputFields: {
    metaEdge: {
      type: metaEdge,
      resolve: (payload) => {
        return models.meta.findAll({where: {
          blockId: payload.blockId
        }}).then((meta) => {
          return {
            cursor: cursorForObjectInConnection(meta, payload),
            node: payload
          };
        });
      } 
    }
  }
});

const metaTypeUpdateInput = new GraphQLInputObjectType({
  name: 'MetaTypeUpdateInput',
  description: 'Meta update',
  fields: { 
    id: {
      type: GraphQLID,
      description: 'Meta id',
    },
    field1: {
      type: GraphQLString,
      description: 'field1',
    },
    field2: {
      type: GraphQLString,
      description: 'field2',
    },
    position: {
      type: GraphQLInt,
      description: 'position',
    }
  },
});


const updateMeta =  mutationWithClientMutationId({
  name: 'updateMeta',
  inputFields: {
    metaInput: { type: metaTypeUpdateInput },
  },
  mutateAndGetPayload({ metaInput }) {
    const {type, id} = fromGlobalId(metaInput.id);
    if(type !== 'Meta') {
      throw Error('ID must belong to Meta type');
    }
    const input = { field1: metaInput.field1, field2: metaInput.field2 };
    if(!isNaN(metaInput.position)) {
      input.position = metaInput.position;
    }
    const updater = (meta) => {
      const oldPosition = meta.position;
      return DB.transaction(transaction => {
        return meta.update(input, { transaction }
        ).then((updatedMeta) => {
          const direction = oldPosition - input.position;
          if(!isNaN(direction)) {
            return DB.query(`
              UPDATE meta
              SET position = position + $direction
              WHERE position >= $min 
              AND position <= $max
              AND "blockId" = $blockId
              AND NOT id = $id`,
              { 
                bind: { 
                  id,
                  direction: direction >= 0 ? 1 : -1,
                  min: Math.min(input.position, oldPosition),
                  max: Math.max(input.position, oldPosition),
                  blockId: meta.blockId
                },
                type: 'UPDATE', 
                transaction, 
              }
            ).then(() => updatedMeta);
          }
          return updatedMeta;
        });
      });
    };
    return models.meta.findById(id).then(updater);
  },
  outputFields: {
    updateMeta: {
      type: metaType,
      resolve: (payload) => payload
    },
    metaConnection: {
      type: metaConnection,
      args: connectionArgs,
      resolve: (payload, args) => {
        return models.meta.findAll({
          where: { blockId: payload.blockId },
          order: [ ['position', 'ASC'] ]
        }).then(metas => connectionFromArray(metas, args)); 
      }
    }
  }
});


const removeMeta = mutationWithClientMutationId({
  name: 'removeMeta',
  inputFields: {
    id: { type: GraphQLID }
  },
  mutateAndGetPayload({ id }) {
    const globalId = fromGlobalId(id);
    if(globalId.type !== 'Meta') {
      throw Error('id must be from type meta');
    }
    return models.meta.findById(globalId.id).then(meta => {
      return meta.destroy().then(() => ({
        deletedId: id,
        meta: meta
      }));
    });
  },
  outputFields: {
    deletedId: {
      type: GraphQLID,
      description: 'deleted meta Id',
      resolve: (payload) => payload.deletedId
    },
    meta: {
      type: metaType,
      description: 'deleted meta item',
      resolve: payload => payload.meta
    }
  }
});

const FileType = new GraphQLObjectType({
  name: 'File',
  description: 'File store',
  interface: [nodeInterface],
  fields() {
    return {
      id: globalIdField(),
      path: {
        type: GraphQLString,
        resolve (file) {
          return file.path;
        }
      },
      fullPath: {
        type: GraphQLString,
        resolve (file) {
          return file.fullPath;
        }
      },
      contentType: {
        type: GraphQLString,
        resolve (file) {
          return file.contentType;
        }
      },
      scope: {
        type: GraphQLString,
        resolve (file) {
          return file.scope;
        }
      },
      size: {
        type: GraphQLInt,
        resolve (file) {
          return file.size;
        }
      }
    };
  },
});
const { 
  connectionType: fileConnection,
  edgeType: FileEdge } = connectionDefinitions({ name: 'File', nodeType: FileType });

const BlockFileTypeInput = new GraphQLInputObjectType({
  name: 'BlockFileTypeInput',
  description: 'attach file to block',
  fields: {
    blockId: {
      type: GraphQLID,
      description: 'Block id field',
    },
    scope: {
      type: GraphQLString,
      description: 'Scope of image',
    }
  }
});

const uploadBlockFile = mutationWithClientMutationId({
  name: 'UploadBlockFile',
  inputFields: {
    blockFileInput: { type:  BlockFileTypeInput }
  },
  mutateAndGetPayload({ blockFileInput }, context) {
    const { scope, blockId: blockIdNode } = blockFileInput;
    const {type, id: blockId } = fromGlobalId(blockIdNode);
    if(type !== 'Block') {
      throw Error('ID must belong to Block type');
    }
    let deletedIds = [];
    return models.file.findAll({where: {
      blockId,
      scope
    }}).then(results => {
      deletedIds = results.map((row) => {
        const path = row.absolutePath;
        fs.unlink(path);
        return row.id;
      });
      return models.file.destroy(
        {
          where: { 
            id: {
              [DB.Sequelize.Op.in]: deletedIds,
            }
          }
        }
      );
    }).then(() => {
      return saveFile(context, SETTINGS.MEDAIA_ROOT);
    }).then((fileObj) => {
      return models.file.create(Object.assign({}, fileObj, { blockId, scope }));
    }).then(fileInstance => ({
      blockId,
      scope,
      file: fileInstance,
      deletedIds: deletedIds.map(id => toGlobalId('File', id))
    })).catch((err) => new Error(err));
  },
  outputFields: {
    deletedIds: {
      type: new GraphQLList(GraphQLID),
      resolve: payload => payload.deletedIds
    },
    file: {
      type: FileEdge,
      resolve: (payload) => {
        return models.file.findAll({
          where: {
            blockId: payload.blockId,
            scope: payload.scope
          },
          raw: true,
        }).then((files) => {

          return {
            cursor: offsetToCursor(files.length),
            node: payload.file
          };
        });
      } 
    }
  }
});

const uploadFile = mutationWithClientMutationId({
  name: 'UploadFile',
  inputFields: {
  },
  mutateAndGetPayload(root, context) {
    return saveFile(context, SETTINGS.MEDAIA_ROOT).then((file) => models.file.create(file));
  },
  outputFields: {
    file: {
      type: new GraphQLList(FileType),
      resolve: (payload) => payload,
    }
  }
});


const blockType = new GraphQLObjectType({
  name: 'Block',
  description: 'Page block',
  interface: [nodeInterface], 
  fields () {
    return {
      id: globalIdField(),
      page: {
        type: PageType,
        resolve(block) {
          return block.getPage();
        }
      },
      blockType: {
        type: GraphQLString,
        resolve (block) {
          return block.blockType;
        },
      },
      editor: {
        type: GraphQLJSON,
        resolve (block) {
          return block.editor;
        },
      },
      date: {
        type: GraphQLString,
        description: 'Go live date for project this will apprear in the listing',
        resolve (block) {
          return block.date && block.date.toISOString();
        },
      },
      title: {
        type: GraphQLString,
        description: 'Client that the project was for',
        resolve (block) {
          return block.title;
        },
      },
      colour: {
        type: GraphQLString,
        description: 'Colour',
        resolve (block) {
          return block.colour;
        },
      },
      position: {
        type: GraphQLInt,
        description: 'position',
        resolve (block) {
          return block.position;
        }
      },
      metaConnection: {
        type: metaConnection,
        args: connectionArgs,
        description: 'meta data',
        resolve (block, args) {
          return  block.getMeta({
            order: [['position', 'ASC']],
          }
          ).then(metas => connectionFromArray(metas, args));
        }
      },
      fileConnection: {
        type: fileConnection,
        args: connectionArgs,
        description: 'files',
        resolve (block, args) {
          return  block.getFiles().then(files => connectionFromArray(files, args));
        }
      }
    };
  },
});

const { 
  connectionType: blockConnection,
  edgeType: blockEdge 
} = connectionDefinitions({ name: 'Blocks', nodeType: blockType });

const blockTypeInput = new GraphQLInputObjectType({
  name: 'BlockInput',
  description: 'Page block',
  fields: { 
    pageId: {
      type: GraphQLID,
    },
    blockType: {
      type: GraphQLString,
    },
    editor: {
      type: GraphQLJSON,
    },
    date: {
      type: GraphQLString,
      description: 'Go live date for project this will apprear in the listing',
    },
    title: {
      type: GraphQLString,
      description: 'Client that the project was for',
    },
    colour: {
      type: GraphQLString,
      description: 'Colour',
    }
  },
});

const blockUpdateTypeInput = new GraphQLInputObjectType({
  name: 'BlockUpdateInput',
  description: 'Page block',
  fields: { 
    ID: {
      type: GraphQLID,
    },
    editor: {
      type: GraphQLJSON,
    },
    date: {
      type: GraphQLString,
      description: 'Go live date for project this will apprear in the listing',
    },
    blockType: {
      type: GraphQLString,
      description: 'change block type',
    },
    title: {
      type: GraphQLString,
      description: 'Client that the project was for',
    },
    colour: {
      type: GraphQLString,
      description: 'block colour',
    }
  },
});

const createBlock =  mutationWithClientMutationId({
  name: 'createBlock',
  inputFields: {
    blockInput: { type: blockTypeInput },
  },
  mutateAndGetPayload({ blockInput }) {
    const {type, id} = fromGlobalId(blockInput.pageId);
    if(type !== 'Page') {
      throw Error('ID must belong to Page type');
    }
    return models.block.count({ where: { pageId: id }})
      .then(count => {
        return models.block.create(
          Object.assign(
            blockInput,
            {
              pageId: id,
              position: count + 1,
            }
          ));
      });
  },
  outputFields: {
    blockEdge: {
      type: blockEdge,
      resolve: (payload) => {
        return models.block.findAll({where: {
          pageId: payload.pageId
        }}).then((blocks) => {
          return {
            cursor: cursorForObjectInConnection(blocks, payload),
            node: payload
          };
        });
      } 
    }
  }
});

const updateBlock =  mutationWithClientMutationId({
  name: 'updateBlock',
  inputFields: {
    blockInput: { type: blockUpdateTypeInput },
  },
  mutateAndGetPayload({ blockInput }) {
    const {type, id} = fromGlobalId(blockInput.ID);
    if(type !== 'Block') {
      throw Error('ID must belong to Block type');
    }
    const input = Object.assign({}, blockInput);
    delete input.ID;
    
    return models.block.findById(id).then((block) => {
      return block.update(input);
    });
  },
  outputFields: {
    block: {
      type: blockType,
      resolve: (payload) => payload
    }
  }
});

const updateBlockPosition = mutationWithClientMutationId({
  name: 'updateBlockPosition',
  inputFields: {
    id: {
      type: GraphQLID,
    },
    position: {
      type: GraphQLInt
    }
  },
  mutateAndGetPayload(input) {
    const {type, id} = fromGlobalId(input.id);
    if(type !== 'Block') {
      throw Error('ID must belong to Block type');
    }

    const updater = (block) => {
      const oldPosition = block.position;
      return DB.transaction(transaction => {
        return block.update({position: input.position}, transaction)
          .then((updatedBlock) => {
            const direction = oldPosition - input.position;
            if(!isNaN(direction)) {
              return DB.query(`
                UPDATE blocks
                SET position = position + $direction
                WHERE position >= $min 
                AND position <= $max
                AND "pageId" = $pageId
                AND NOT id = $id`,
                { 
                  bind: { 
                    id,
                    direction: direction >= 0 ? 1 : -1,
                    min: Math.min(input.position, oldPosition),
                    max: Math.max(input.position, oldPosition),
                    pageId: block.pageId
                  },
                  type: 'UPDATE',
                  transaction
                }
              ).then(() => updatedBlock);
            }
            return updatedBlock;
          });
      });
    }; 
    return models.block.findById(id).then(updater).catch(console.error);
  },
  outputFields: {
    blockEdge: {
      type: blockEdge,
      resolve: (payload) => {
        return models.block.count({where: {pageId: payload.pageId}})
          .then(count => {
            return {
              cursor: offsetToCursor(count),
              node: payload
            };
          });
      }
    },
    blockConnection: {
      type: blockConnection,
      args: connectionArgs,
      resolve: (payload, args) => {
        return models.block.findAll({
          where: { pageId: payload.pageId },
          order: [ ['position', 'ASC'] ]
        }).then(blocks => connectionFromArray(blocks, args)); 
      }
    }
  }
});

const removeBlock =  mutationWithClientMutationId({
  name: 'removeBlock',
  inputFields: {
    id: { type: GraphQLID },
  },
  mutateAndGetPayload({ id }) {
    const blockId = fromGlobalId(id).id;
    return models.block.findById(blockId).then(block => {
      return block.destroy().then(() => ({
        block: block,
        deletedId: id
      }));
    });
  },
  outputFields: {
    deletedId: {
      type: GraphQLID,
      resolve: (payload) => payload.deletedId 
    },
    block: {
      type: blockType,
      resolve: (payload) => payload.block 
    }
  }
});

const PageType = new GraphQLObjectType({
  name: 'Page',
  description: 'Project Page',  
  interfaces: [nodeInterface],
  fields () {
    return {
      id: globalIdField(),
      title: {
        type: GraphQLString,
        description: 'Title of project',
        resolve (page) {
          return page.title;
        },
      },
      description: {
        type: GraphQLString,
        description: 'Description of project',
        resolve (page) {
          return page.description;
        },
      },
      projectGoLive: {
        type: GraphQLString,
        description: 'Go live date for project this will apprear in the listing',
        resolve (page) {
          return page.projectGoLive;
        },
      },
      client: {
        type: GraphQLString,
        description: 'Client that the project was for',
        resolve (page) {
          return page.client;
        },
      },
      published: {
        type: GraphQLBoolean,
        description: 'Flag to indicate if the page should be made public',
        resolve (page) {
          return page.published;
        },
      },
      position: {
        type: GraphQLInt,
        description: 'position to of page',
        resolve (page) {
          return page.position;
        },
      },
      listingImage: {
        type: FileType,
        description: 'Listing image file',
        resolve (page) {
          return page.listingImage;
        },
      },
      blockConnection: {
        type: blockConnection,
        args: connectionArgs,
        description: 'page blocks',
        resolve (page, args) {
          return page.getBlocks(
            {
              order: [ ['position', 'ASC'] ]
            }
          ).then((blocks) => {
            return connectionFromArray(blocks,args);
          });
        },
      },
    };
  },
});

const { connectionType: pageConnection, edgeType: pageEdge } = 
connectionDefinitions({ name: 'Page', nodeType: PageType });

const PageTypeInput  = new GraphQLInputObjectType({
  name: 'PageInput',
  description: 'input fields for page',
  fields: {
    title: {
      type: GraphQLString,
      description: 'Title of project',
    },
    description: {
      type: GraphQLString,
      description: 'Description of project',
    },
    projectGoLive: {
      type: GraphQLString,
      description: 'Go live date for project this will apprear in the listing',
    },
    client: {
      type: GraphQLString,
      description: 'Client that the project was for',
    },
    published: {
      type: GraphQLBoolean,
      description: 'Flag to indicate if the page should be made public',
      defaultValue: false
    },
    position: {
      type: GraphQLInt,
    }
  }
});

const createPage =  mutationWithClientMutationId({
  name: 'CreatePage',
  inputFields: {
    pageInput: { type: PageTypeInput },
  },
  mutateAndGetPayload({ pageInput }, context) {
    if(context.file) {
      return saveFile(context, SETTINGS.MEDAIA_ROOT)
        .then((file) => {
          const input = Object.assign(
            pageInput,
            { listingImage: file }
          );
          return models.page.create(input, {
            include: [{
              association: DB.models.page.listingImage,
            }]
          });
        }).catch(console.log);
    }
    return models.page.create(pageInput);
  },
  outputFields: {
    page: {
      type: PageType,
      resolve: (payload) => {
        return payload;
      }
    }
  }
});

const updatePage =  mutationWithClientMutationId({
  name: 'UpdatePage',
  inputFields: {
    id: { type: GraphQLID },
    pageInput: { type: PageTypeInput },
  },
  mutateAndGetPayload({ id, pageInput  }) {
    const {type, dbid} = fromGlobalId(id);
    if(type !== 'Page') {
      throw Error('id must be type page');
    }
    return models.page.update(pageInput, { where:  {id: dbid } });
  },
  outputFields: {
    page: {
      type: PageType,
      resolve: (payload) => payload
    }
  }
});


const mutationType = new GraphQLObjectType({
  name: 'Mutation',
  fields() {
    return {
      createPage,
      updatePage,
      createBlock,
      removeBlock,
      updateBlock,
      createMeta,
      updateMeta,
      removeMeta,
      uploadFile,
      uploadBlockFile,
      updateBlockPosition
    };
  },
});

const queryType = new GraphQLObjectType({
  name: 'Query',
  fields() {
    return {
      node: nodeField,
      pages: {
        type: pageConnection,
        args: connectionArgs,
        resolve (_, args) {
          return models.page.findAll({
            include: [ 
              DB.models.page.listingImage,
            ]
          }).then((pages) => (
            connectionFromArray(pages, args)
          ));
        }
      }
    };
  }
}); 

const schema = new GraphQLSchema({
  query: queryType,
  mutation: mutationType,
});

module.exports = schema;

