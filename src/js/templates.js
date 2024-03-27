const fs = require('fs');
const mustache = require('mustache');


// Object that contains the available templates
const _templates = {
  'points': fs.readFileSync('src/templates/points.mustache', 'utf-8'),
  'point_media': fs.readFileSync('src/templates/point_media.mustache', 'utf-8'),
};


// Return if a template exists
function exists(template) {
  return _templates[template] !== undefined;
}

// Render a template
function render(element, template, data, callback) {
  element.html(mustache.render(_templates[template], data, _templates));
  if (callback !== undefined)
    callback(element);
}


// Define the exports
module.exports = {exists, render};
