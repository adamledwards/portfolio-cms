const path = require('path');
const fs = require('fs-extra');
const md5 = require('md5');

function saveFile(file, filePath) {
  const fileExt = path.extname(file.originalname);
  const filename = `${md5(`${file.originalname}-${Date.now()}`)}${fileExt}`;
  const newPath = path.resolve(filePath, filename);
  return fs.copy(file.path, newPath)
    .then(() => {
      return fs.unlink(file.path);
    })
    .then(()=>{
      return {
        path: filename,
        originalname: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    });
}

function deleteFile(filePath) {
  return fs.unlink(filePath);
}
module.exports = {
  saveFile,
  deleteFile
};